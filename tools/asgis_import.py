"""Import pasportu hřbitova z ASGIS (DIGIS HřbitovServer) do datového souboru aplikace.

Použití:
    python tools/asgis_import.py --fetch  --raw <složka>   # stáhne vrstvy WFS do <složka>
    python tools/asgis_import.py --raw <složka> --out data/vitkovice.js

Zdroj: https://asgis.ostrava.cz/HS_mmo_vtk/ (WFSServlet, GeoJSON, S-JTSK EPSG:5514).
Výstup: lokální souřadnice v decimetrech, osa X na východ, osa Y na jih (SVG).
"""
import argparse, collections, json, os, re, sys, urllib.request, http.cookiejar

from shapely.geometry import shape, Polygon, MultiPolygon, LineString, Point, mapping
from shapely.ops import unary_union

BASE = "https://asgis.ostrava.cz/HS_mmo_vtk"
WS = "AS_vs_mmo_vtk:MMO_VTK_modul_ph4_"
LAYERS = ["n_polohopis_hranice_pohrebiste", "n_polohopis_pob", "n_polohopis_lin_obj", "n_polohopis_bod_obj",
          "v_platnost_hm_platne", "v_platnost_hrob_platne"]

# kód polohopisu -> třída vykreslení
AREA = {
    13220: "paved", 13230: "paved", 13240: "paved", 13250: "gravel", 13260: "paved",
    13310: "paved", 13320: "paved", 13330: "paved", 13350: "gravel", 4080: "steps",
    3140: "park", 13040: "park", 3141: "shrub", 3142: "flower", 3150: "lawn", 3160: "lawn",
    4020: "building", 13531: "building", 14041: "steps", 4140: "monument",
    4220: "wall", 13420: "wall", 13440: "wall", 13450: "wall", 13410: "ditch", 13680: "tech",
}
LINE = {2170: "wall", 4220: "wall", 2140: "hedge", 2121: "fence", 5300: "rail"}
POINT = {3131: "conifer", 3132: "tree", 13020: "tree", 3134: "bush", 3135: "bush", 13010: "bush",
         4090: "cross", 4140: "memorial", 4270: "bin", 4300: "water", 8110: "water", 8170: "fountain",
         4340: "bench", 6560: "lamp", 4190: "board"}
# typ hrobu (hrob_typ_kod / cenik_typ_kod)
GTYPE = {1: "hrob", 2: "dvojhrob", 3: "trojhrob", 4: "vicehrob", 10: "hrob", 5: "urnovy", 17: "urnovy",
         7: "kolumbarium", 6: "hrobka", 11: "vsyp"}


def fetch(raw):
    os.makedirs(raw, exist_ok=True)
    cj = http.cookiejar.CookieJar()
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
    op.open(BASE + "/index.xhtml", timeout=60).read()
    for l in LAYERS:
        body = (f'<GetFeature xmlns="http://www.opengis.net/wfs" service="WFS" version="1.1.0" '
                f'outputFormat="application/json"><Query typeName="{WS}{l}" srsName="EPSG:5514"/></GetFeature>')
        req = urllib.request.Request(BASE + "/WFSServlet", data=body.encode(), headers={"Content-Type": "text/xml"})
        data = op.open(req, timeout=300).read()
        json.loads(data)
        open(os.path.join(raw, l + ".json"), "wb").write(data)
        print("stazeno", l, len(data))


def load(raw, name):
    return json.load(open(os.path.join(raw, name + ".json"), encoding="utf-8"))["features"]


def roman_key(s):
    m = re.match(r"([IVXLC]+)(.*)", s)
    if not m:
        return (999, s)
    v, tot, prev = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100}, 0, 0
    for ch in reversed(m.group(1)):
        n = v[ch]; tot += -n if n < prev else n; prev = max(prev, n)
    return (tot, m.group(2))


def build(raw, out):
    hr = shape(load(raw, "n_polohopis_hranice_pohrebiste")[0]["geometry"])
    minx, miny, maxx, maxy = hr.bounds
    M = 18.0
    ox, oy = minx - M, maxy + M
    W, H = (maxx - minx) + 2 * M, (maxy - miny) + 2 * M
    T = lambda x, y: (round((x - ox) * 10), round((oy - y) * 10))

    def ring(coords):
        pts, last = [], None
        for x, y in coords:
            p = T(x, y)
            if p != last:
                pts.append(p); last = p
        if len(pts) > 1 and pts[0] == pts[-1]:
            pts.pop()
        return [c for p in pts for c in p]

    def polys(g, tol=0.05):
        """Seznam ploch; každá plocha = [vnější kruh, díra, díra…] (vykreslení evenodd)."""
        g = g.simplify(tol, preserve_topology=True)
        gs = g.geoms if isinstance(g, MultiPolygon) else [g]
        out = []
        for p in gs:
            if p.is_empty or len(p.exterior.coords) < 4:
                continue
            out.append([ring(p.exterior.coords)] + [ring(i.coords) for i in p.interiors if len(i.coords) >= 4])
        return out

    def lines(g):
        gs = g.geoms if hasattr(g, "geoms") else [g]
        return [[c for p in (T(x, y) for x, y in l.coords) for c in p] for l in gs]

    # --- polohopis ---
    areas = collections.defaultdict(list)
    paved_geoms = []
    for f in load(raw, "n_polohopis_pob"):
        k = int(f["properties"]["kod"])
        cls = AREA.get(k)
        if not cls:
            continue
        g = shape(f["geometry"])
        areas[cls].extend(polys(g))
        if cls in ("paved", "gravel", "steps"):
            paved_geoms.append(g)
    lns = collections.defaultdict(list)
    for f in load(raw, "n_polohopis_lin_obj"):
        cls = LINE.get(int(f["properties"]["kod"]))
        if cls:
            lns[cls].extend(lines(shape(f["geometry"])))
    pts = []
    for f in load(raw, "n_polohopis_bod_obj"):
        cls = POINT.get(int(f["properties"]["kod"]))
        if cls:
            x, y = f["geometry"]["coordinates"][:2]
            pts.append([*T(x, y), cls])

    # --- hroby ---
    hm = collections.defaultdict(list)
    for f in load(raw, "v_platnost_hm_platne"):
        p = f["properties"]
        hm[str(p["hrob_id"])].append(p)
    graves, seen, secs = [], collections.Counter(), collections.defaultdict(list)
    for f in load(raw, "v_platnost_hrob_platne"):
        p = f["properties"]
        sec = p["nazev"].replace("Sekce ", "").strip()
        parts = p["id_klic"].split("-")
        num_raw = parts[3] if len(parts) > 3 else p["oznaceni_hrobu"]
        suffix = ""
        m = re.match(r"(.+?)_(uh|kh)$", num_raw)
        if m:
            num_raw, suffix = m.group(1), m.group(2)
        num = num_raw.replace("_", "/")
        row = str(p["rada_id"])
        code = f"{sec}-{row}-{num}"
        seen[code] += 1
        if seen[code] > 1:
            code = f"{code}{'U' if suffix == 'uh' else 'K'}" if seen[code] == 2 else f"{code}.{seen[code]}"
        places = hm.get(str(p["id"]), [])
        free = bool(places) and all(int(x["vyuziti"]) == 0 for x in places)
        g = shape(f["geometry"])
        rs = polys(g, 0.03)
        if not rs:
            continue
        typ = GTYPE.get(int(p["hrob_typ_kod"]), "hrob")
        note = (p.get("poznamka") or "").strip()
        child = "dětsk" in note.lower()
        graves.append([code, sec, row, num, typ, 1 if free else 0, len(places), 1 if child else 0, rs[0][0]])
        secs[sec].append(g)

    # --- sekce: plochy a těžiště popisků ---
    sections = []
    for name in sorted(secs, key=roman_key):
        u = unary_union([g.buffer(0.9) for g in secs[name]]).buffer(-0.6)
        c = u.representative_point() if u.area else secs[name][0].centroid
        lab = unary_union(secs[name]).centroid
        if not u.contains(lab):
            lab = c
        sections.append({"id": name, "n": len(secs[name]), "area": polys(u, 0.3), "lx": T(lab.x, lab.y)[0], "ly": T(lab.x, lab.y)[1]})

    # --- vstupy: místa, kde zpevněné cesty protínají hranici areálu ---
    paved = unary_union(paved_geoms)
    cross = hr.boundary.intersection(paved.buffer(0.3))
    segs = [s for s in (cross.geoms if hasattr(cross, "geoms") else [cross]) if s.length > 1.2]
    gates = []
    for s in segs:
        c = s.interpolate(0.5, normalized=True)
        if all(c.distance(Point(g[2], g[3])) > 8 for g in gates):
            gates.append([round(s.length, 1), 0, c.x, c.y])
    gates.sort(key=lambda g: -g[0])
    gates_out = [[*T(g[2], g[3]), g[0]] for g in gates]

    data = {
        "name": hr and load(raw, "n_polohopis_hranice_pohrebiste")[0]["properties"].get("nazev"),
        "source": "ASGIS Ostrava · Pasport hřbitova · geodetické zaměření DIGIS, spol. s r.o. (10. 12. 2025)",
        "crs": {"epsg": 5514, "ox": round(ox, 3), "oy": round(oy, 3), "unit": 0.1},
        "w": round(W * 10), "h": round(H * 10),
        "boundary": polys(hr, 0.05),
        "areas": areas, "lines": lns, "points": pts,
        "sections": sections, "graves": graves, "gates": gates_out,
    }
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as fh:
        fh.write("/* Vygenerováno nástrojem tools/asgis_import.py – needitovat ručně. */\n")
        fh.write("window.VTK=")
        json.dump(data, fh, ensure_ascii=False, separators=(",", ":"))
        fh.write(";\n")
    print(f"zapsano {out}: {os.path.getsize(out)//1024} kB, hrobu {len(graves)}, sekci {len(sections)}, bodu {len(pts)}")
    print("kolize kodu:", sum(1 for v in seen.values() if v > 1))
    print("vstupy (sirka m, x, y dm):", gates_out[:8])
    print("plochy:", {k: len(v) for k, v in areas.items()}, "linie:", {k: len(v) for k, v in lns.items()})
    print("typy:", collections.Counter(g[4] for g in graves), "volne:", sum(g[5] for g in graves))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", required=True)
    ap.add_argument("--out", default="data/vitkovice.js")
    ap.add_argument("--fetch", action="store_true")
    a = ap.parse_args()
    if a.fetch:
        fetch(a.raw)
    else:
        build(a.raw, a.out)
