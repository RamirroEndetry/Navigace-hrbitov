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


def regularize_graves(geoms, secs, gap=0.06):
    """Zarovnání hrobů pro čistou mapu: obdélníky natočené podle okolních hrobů, řady a sloupce
    srovnané do mřížky, bez překryvů. Těžiště hrobu se posune nejvýš o 30 cm."""
    import math, statistics
    from shapely import affinity
    from shapely.geometry import box
    from shapely.strtree import STRtree

    info = []
    for g in geoms:
        c = list(g.minimum_rotated_rectangle.exterior.coords)
        edges = [(c[k], c[k + 1]) for k in range(4)]
        e = max(edges, key=lambda p: math.dist(*p))
        L, Wd = math.dist(*e), min(math.dist(*q) for q in edges)
        info.append({"a": math.atan2(e[1][1] - e[0][1], e[1][0] - e[0][0]) % (math.pi / 2),
                     "big": Wd > 0 and L / Wd > 1.3 and g.area > 0.8, "area": g.area, "c": g.centroid})
    cents = [i["c"] for i in info]
    ctree = STRtree(cents)
    sec_mean, sec_straight = {}, {}
    for sname in set(secs):
        sx = sy = wsum = 0.0
        for i, s in zip(info, secs):
            if s == sname:
                wt = i["area"] * (3 if i["big"] else 1)
                sx += wt * math.cos(4 * i["a"]); sy += wt * math.sin(4 * i["a"]); wsum += wt
        sec_mean[sname] = math.atan2(sy, sx) / 4 if (sx or sy) else None
        # rovná sekce = natočení hrobů je jednotné (délka výsledného vektoru blízko 1)
        sec_straight[sname] = wsum > 0 and math.hypot(sx, sy) / wsum > 0.82
    # 1) natočení: plochou vážený průměr jasně obdélníkových hrobů v okolí (8 m, pak 15 m, pak sekce)
    theta = []
    for i, c in enumerate(cents):
        t = sec_mean[secs[i]] if sec_straight[secs[i]] else None
        for rad in ((8.0, 15.0) if t is None else ()):
            sx = sy = 0.0
            for j in ctree.query(c.buffer(rad)):
                j = int(j)
                if secs[j] == secs[i] and info[j]["big"]:
                    sx += info[j]["area"] * math.cos(4 * info[j]["a"]); sy += info[j]["area"] * math.sin(4 * info[j]["a"])
            if sx or sy:
                t = math.atan2(sy, sx) / 4; break
        if t is None:
            t = sec_mean[secs[i]] if sec_mean[secs[i]] is not None else info[i]["a"]
        theta.append(t)
    print("zarovnani: rovne sekce", sorted(k for k, v in sec_straight.items() if v), "| obloukove", sorted(k for k, v in sec_straight.items() if not v))
    # 2) obdélník v daném natočení (u = podél natočení, v = kolmo)
    rects = []
    for g, c, t in zip(geoms, cents, theta):
        r = affinity.rotate(g, -t, origin=c, use_radians=True)
        x0, y0, x1, y1 = r.bounds
        rects.append({"t": t, "cx": c.x + 0, "cy": c.y + 0, "u": (x0 + x1) / 2 - c.x, "v": (y0 + y1) / 2 - c.y,
                      "w": round((x1 - x0) * 20) / 20, "h": round((y1 - y0) * 20) / 20})
    # 3) mřížka: ve skupině se stejným natočením srovnat řady (v) i sloupce (u)
    groups = collections.defaultdict(list)
    for i, r in enumerate(rects):
        groups[(secs[i], round(math.degrees(r["t"]) / 1.5))].append(i)
    for members in groups.values():
        t = statistics.median(rects[i]["t"] for i in members)
        ct, st = math.cos(t), math.sin(t)
        for ax in ("u", "v"):
            def coord(i):
                r = rects[i]; X, Y = r["cx"], r["cy"]
                return (X * ct + Y * st) + r["u"] if ax == "u" else (-X * st + Y * ct) + r["v"]
            order = sorted(members, key=coord)
            clusters, cur = [], [order[0]]
            for i in order[1:]:
                if coord(i) - coord(cur[-1]) < 0.22: cur.append(i)
                else: clusters.append(cur); cur = [i]
            clusters.append(cur)
            for cl in clusters:
                if len(cl) < 2: continue
                med = statistics.median(coord(i) for i in cl)
                for i in cl:
                    d = med - coord(i)
                    if abs(d) < 0.3: rects[i][ax] += d
    def poly(r, f=1.0):
        w, h = max(r["w"] * f - gap, 0.2), max(r["h"] * f - gap, 0.2)
        b = box(r["u"] - w / 2, r["v"] - h / 2, r["u"] + w / 2, r["v"] + h / 2)
        b = affinity.rotate(b, r["t"], origin=(0, 0), use_radians=True)
        return affinity.translate(b, r["cx"], r["cy"])
    scale = [1.0] * len(rects)
    out = [poly(r) for r in rects]
    # 4) překryvy: obě sousední místa jemně zmenšit (nejvýš o 20 %)
    for _ in range(5):
        tree = STRtree(out)
        changed = False
        for i in range(len(out)):
            for j in tree.query(out[i]):
                j = int(j)
                if j <= i or out[i].intersection(out[j]).area < 1e-4:
                    continue
                for k in (i, j):
                    if scale[k] > 0.8:
                        scale[k] = round(scale[k] - 0.04, 2); out[k] = poly(rects[k], scale[k]); changed = True
        if not changed:
            break
    return out


def _thin(img):
    """Zhang–Suen ztenčení binárního rastru (numpy), vrací kostru o šířce 1 px."""
    import numpy as np
    img = img.astype(np.uint8).copy()
    while True:
        changed = False
        for step in (0, 1):
            P = np.pad(img, 1)
            p2, p3, p4, p5 = P[:-2, 1:-1], P[:-2, 2:], P[1:-1, 2:], P[2:, 2:]
            p6, p7, p8, p9 = P[2:, 1:-1], P[2:, :-2], P[1:-1, :-2], P[:-2, :-2]
            B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9
            seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2]
            A = sum(((seq[i] == 0) & (seq[i + 1] == 1)).astype(np.uint8) for i in range(8))
            if step == 0:
                c1, c2 = p2 * p4 * p6, p4 * p6 * p8
            else:
                c1, c2 = p2 * p4 * p8, p2 * p6 * p8
            m = (img == 1) & (B >= 2) & (B <= 6) & (A == 1) & (c1 == 0) & (c2 == 0)
            if m.any():
                img[m] = 0
                changed = True
        if not changed:
            return img


def build_network(paved, blockers, gates, T, res=0.25):
    """Osy zpevněných cest jako graf: uzly [x,y] a hrany [a, b, šířka dm, polyline]."""
    import numpy as np
    from PIL import Image, ImageDraw
    from scipy import ndimage

    minx, miny, maxx, maxy = paved.bounds
    W, H = int((maxx - minx) / res) + 3, int((maxy - miny) / res) + 3
    px = lambda x, y: ((x - minx) / res + 1, (maxy - y) / res + 1)
    world = lambda r, c: (minx + (c - 1 + 0.5) * res, maxy - (r - 1 + 0.5) * res)

    im = Image.new("L", (W, H), 0)
    dr = ImageDraw.Draw(im)
    for p in (paved.geoms if hasattr(paved, "geoms") else [paved]):
        dr.polygon([px(x, y) for x, y in p.exterior.coords], fill=1)
        for i in p.interiors:
            dr.polygon([px(x, y) for x, y in i.coords], fill=0)
    bim = Image.new("L", (W, H), 0)
    bdr = ImageDraw.Draw(bim)
    for b in blockers:
        for p in (b.geoms if hasattr(b, "geoms") else [b]):
            if p.bounds[2] < minx or p.bounds[0] > maxx:
                continue
            bdr.polygon([px(x, y) for x, y in p.exterior.coords], fill=1)
    blocked = np.array(bim, dtype=bool)
    mask = np.array(im, dtype=bool) & ~blocked
    # vyhladit okraje a zalepit drobné mezery – ale nikdy ne přes hrob, budovu či zeď
    mask = ndimage.binary_closing(mask, iterations=2) & ~blocked
    mask = ndimage.binary_opening(mask, iterations=2)
    lab, n = ndimage.label(mask)
    sizes = ndimage.sum(mask, lab, range(1, n + 1))
    keep = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s * res * res >= 15])
    mask &= keep
    width = ndimage.distance_transform_edt(mask) * res * 2  # šířka cesty v m
    sk = _thin(mask).astype(bool)

    # --- kostra -> graf ---
    nb = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]
    pts = set(zip(*np.nonzero(sk)))
    deg = {p: sum((p[0] + dy, p[1] + dx) in pts for dy, dx in nb) for p in pts}
    nodepix = {p for p, d in deg.items() if d != 2}
    # sloučit sousední uzlové pixely do jednoho uzlu
    nid, nodes = {}, []
    for p in nodepix:
        if p in nid:
            continue
        stack, comp = [p], []
        nid[p] = len(nodes)
        while stack:
            q = stack.pop(); comp.append(q)
            for dy, dx in nb:
                r = (q[0] + dy, q[1] + dx)
                if r in nodepix and r not in nid:
                    nid[r] = len(nodes); stack.append(r)
        cy = sum(q[0] for q in comp) / len(comp); cx = sum(q[1] for q in comp) / len(comp)
        nodes.append(world(cy, cx))
    edges, seen = [], set()
    for start in nodepix:
        for dy, dx in nb:
            q = (start[0] + dy, start[1] + dx)
            if q not in pts or q in nodepix or (start, q) in seen:
                continue
            chain, prev, cur = [start], start, q
            while cur not in nodepix:
                chain.append(cur)
                nxt = [(cur[0] + a, cur[1] + b) for a, b in nb if (cur[0] + a, cur[1] + b) in pts and (cur[0] + a, cur[1] + b) != prev and (cur[0] + a, cur[1] + b) not in chain[-3:]]
                if not nxt:
                    break
                # přednost ortogonálním sousedům (nezkracovat přes roh)
                nxt.sort(key=lambda r: abs(r[0] - cur[0]) + abs(r[1] - cur[1]))
                prev, cur = cur, nxt[0]
            if cur not in nodepix:
                continue
            chain.append(cur)
            seen.add((start, chain[1])); seen.add((cur, chain[-2]))
            a, b = nid[start], nid[cur]
            if a == b and len(chain) < 12:
                continue
            wv = [width[p] for p in chain[1:-1]] or [width[start]]
            line = LineString([nodes[a]] + [world(*p) for p in chain[1:-1]] + [nodes[b]])
            edges.append([a, b, float(np.median(wv)), line])

    # --- prořezání krátkých výběžků (kromě míst u vchodů) ---
    near_gate = lambda i: any(Point(nodes[i]).distance(g) < 7 for g in gates)
    for _ in range(4):
        d = collections.Counter()
        for a, b, *_ in edges:
            d[a] += 1; d[b] += 1
        edges = [e for e in edges if not ((d[e[0]] == 1 or d[e[1]] == 1) and e[3].length < 5 and not (near_gate(e[0]) or near_gate(e[1])))]
    # sloučit uzly stupně 2
    while True:
        d = collections.defaultdict(list)
        for i, e in enumerate(edges):
            d[e[0]].append(i); d[e[1]].append(i)
        mid = next((n for n, l in d.items() if len(l) == 2 and l[0] != l[1]), None)
        if mid is None:
            break
        i, j = d[mid]
        e1, e2 = edges[i], edges[j]
        c1 = list(e1[3].coords) if e1[1] == mid else list(e1[3].coords)[::-1]
        c2 = list(e2[3].coords) if e2[0] == mid else list(e2[3].coords)[::-1]
        a = e1[0] if e1[1] == mid else e1[1]
        b = e2[1] if e2[0] == mid else e2[0]
        w = (e1[2] * e1[3].length + e2[2] * e2[3].length) / max(e1[3].length + e2[3].length, 1e-6)
        new = [a, b, w, LineString(c1 + c2[1:])]
        edges = [e for k, e in enumerate(edges) if k not in (i, j)] + [new]
    used = sorted({e[0] for e in edges} | {e[1] for e in edges})
    remap = {o: k for k, o in enumerate(used)}
    out_nodes = [list(T(*nodes[o])) for o in used]
    out_edges = []
    for a, b, w, line in edges:
        s = line.simplify(0.2)
        flat = [c for x, y in s.coords for c in T(x, y)]
        out_edges.append([remap[a], remap[b], round(w * 10), flat])
    print(f"sit cest: {len(out_nodes)} uzlu, {len(out_edges)} hran, {sum(e[3].length for e in edges):.0f} m")
    return {"nodes": out_nodes, "edges": out_edges}


def build(raw, out, regular=True):
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
        if g.is_empty:
            continue
        typ = GTYPE.get(int(p["hrob_typ_kod"]), "hrob")
        note = (p.get("poznamka") or "").strip()
        child = "dětsk" in note.lower()
        graves.append([code, sec, row, num, typ, 1 if free else 0, len(places), 1 if child else 0, g])
        secs[sec].append(g)
    # zarovnání hrobů (čisté obdélníky, rovné řady, bez překryvů)
    if regular:
        aligned = regularize_graves([gr[8] for gr in graves], [gr[1] for gr in graves])
        for gr, ag in zip(graves, aligned):
            gr[8] = ag
    for gr in graves:
        gr[8] = polys(gr[8], 0.01)[0][0]

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

    # --- síť os cest (pro navigaci po středu cest) ---
    blockers = [shape(f["geometry"]) for f in load(raw, "v_platnost_hrob_platne")]
    for f in load(raw, "n_polohopis_pob"):
        if AREA.get(int(f["properties"]["kod"])) in ("building", "monument", "wall", "shrub", "flower", "tech"):
            blockers.append(shape(f["geometry"]))
    net = build_network(paved, blockers, [Point(g[2], g[3]) for g in gates], T)

    data = {
        "name": hr and load(raw, "n_polohopis_hranice_pohrebiste")[0]["properties"].get("nazev"),
        "source": "ASGIS Ostrava · Pasport hřbitova · geodetické zaměření DIGIS, spol. s r.o. (10. 12. 2025)",
        "crs": {"epsg": 5514, "ox": round(ox, 3), "oy": round(oy, 3), "unit": 0.1},
        "w": round(W * 10), "h": round(H * 10),
        "boundary": polys(hr, 0.05),
        "areas": areas, "lines": lns, "points": pts,
        "sections": sections, "graves": graves, "gates": gates_out, "net": net,
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
    ap.add_argument("--raw-graves", action="store_true", help="nezarovnávat hroby (původní zaměřené tvary)")
    a = ap.parse_args()
    if a.fetch:
        fetch(a.raw)
    else:
        build(a.raw, a.out, regular=not a.raw_graves)
