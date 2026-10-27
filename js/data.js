/* Tichá cesta — datová vrstva a trasování.
   Půdorys, sekce a hrobová místa: skutečná data z ASGIS (pasport hřbitova Vítkovice, zaměření DIGIS 12/2025),
   převedená nástrojem tools/asgis_import.py do data/vitkovice.js.
   Jména zemřelých a data jsou GENEROVANÁ a FIKTIVNÍ – evidence osob není ve veřejné službě k dispozici. */
(function () {
  'use strict';
  const V = window.VTK;

  function mulberry(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  const rnd = mulberry(1974);
  const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const pad = (n) => String(n).padStart(2, '0');
  const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  // ---------- Geometrie (1 jednotka = 1 dm, osa Y na jih) ----------
  const M_PER_UNIT = 0.1;
  const W = V.w, H = V.h;
  const GATES = {
    main: { x: 278, y: 1717, label: 'Hlavní vchod', short: 'hlavním vchodem', btn: 'Hlavní' },
    north: { x: 735, y: 1215, label: 'Severní vchod', short: 'severním vchodem', btn: 'Severní' },
    east: { x: 3334, y: 1790, label: 'Východní branka', short: 'východní brankou', btn: 'Východní' }
  };

  // ---------- Jména (fiktivní) ----------
  const MALE = ['Jan', 'Josef', 'Jiří', 'Karel', 'Václav', 'František', 'Miroslav', 'Zdeněk', 'Ladislav', 'Antonín', 'Stanislav', 'Jaroslav', 'Milan', 'Vladimír', 'Bohumil', 'Oldřich', 'Rudolf', 'Emil', 'Ludvík', 'Vojtěch', 'Pavel', 'Petr', 'Leoš', 'Bedřich', 'Alois', 'Otakar', 'Radek', 'Tomáš', 'Martin', 'Lumír', 'Bohuslav', 'Vilém'];
  const FEMALE = ['Marie', 'Anna', 'Jana', 'Věra', 'Ludmila', 'Božena', 'Jarmila', 'Zdeňka', 'Helena', 'Libuše', 'Milada', 'Dagmar', 'Eva', 'Hana', 'Vlasta', 'Jiřina', 'Olga', 'Irena', 'Alžběta', 'Růžena', 'Emilie', 'Drahomíra', 'Květoslava', 'Jaroslava', 'Blanka', 'Ilona', 'Renata', 'Kamila', 'Taťána', 'Pavla', 'Anežka', 'Hedvika'];
  const SURN = [['Novák', 'Nováková'], ['Dvořák', 'Dvořáková'], ['Černý', 'Černá'], ['Procházka', 'Procházková'], ['Kučera', 'Kučerová'], ['Veselý', 'Veselá'], ['Horák', 'Horáková'], ['Němec', 'Němcová'], ['Pokorný', 'Pokorná'], ['Mareček', 'Marečková'], ['Pospíšil', 'Pospíšilová'], ['Hájek', 'Hájková'], ['Jelínek', 'Jelínková'], ['Král', 'Králová'], ['Růžička', 'Růžičková'], ['Beneš', 'Benešová'], ['Fiala', 'Fialová'], ['Sedláček', 'Sedláčková'], ['Doležal', 'Doležalová'], ['Zeman', 'Zemanová'], ['Kolář', 'Kolářová'], ['Navrátil', 'Navrátilová'], ['Čermák', 'Čermáková'], ['Vaněk', 'Vaňková'], ['Urban', 'Urbanová'], ['Blažek', 'Blažková'], ['Kříž', 'Křížová'], ['Kovář', 'Kovářová'], ['Bartoš', 'Bartošová'], ['Vlček', 'Vlčková'], ['Polák', 'Poláková'], ['Musil', 'Musilová'], ['Kopecký', 'Kopecká'], ['Šimek', 'Šimková'], ['Konečný', 'Konečná'], ['Malý', 'Malá'], ['Holub', 'Holubová'], ['Štěpánek', 'Štěpánková'], ['Kadlec', 'Kadlecová'], ['Dostál', 'Dostálová'], ['Sýkora', 'Sýkorová'], ['Wagner', 'Wagnerová'], ['Kubíček', 'Kubíčková'], ['Matějka', 'Matějková'], ['Ondruš', 'Ondrušová'], ['Mlčoch', 'Mlčochová'], ['Bednář', 'Bednářová'], ['Kaluža', 'Kalužová'], ['Lipina', 'Lipinová'], ['Ševčík', 'Ševčíková'], ['Gajdoš', 'Gajdošová'], ['Sikora', 'Sikorová'], ['Kocur', 'Kocurová'], ['Lasota', 'Lasotová'], ['Kantor', 'Kantorová'], ['Hrabal', 'Hrabalová'], ['Žurek', 'Žurková'], ['Pustka', 'Pustková'], ['Mrózek', 'Mrózková'], ['Szotkowski', 'Szotkowská'], ['Chlebek', 'Chlebková'], ['Kubala', 'Kubalová'], ['Onderka', 'Onderková'], ['Wojnar', 'Wojnarová']];

  const NOW = new Date();
  const CUTOFF = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - 12);
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  function randDate(year) {
    let d = new Date(year, ri(0, 11), ri(1, 28));
    if (d > CUTOFF) d = new Date(CUTOFF.getTime() - ri(1, 300) * 864e5);
    return d;
  }

  // ---------- Sekce a hroby ----------
  const sections = V.sections.map((s) => ({ id: s.id, n: s.n, area: s.area, lx: s.lx, ly: s.ly, graves: [], x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }));
  const secById = {};
  sections.forEach((s) => (secById[s.id] = s));
  const graves = [], persons = [], graveById = {}, byGrave = {};
  const COUNT = { hrob: [1, 2], dvojhrob: [2, 3], trojhrob: [2, 4], vicehrob: [3, 5], hrobka: [3, 5], urnovy: [1, 3], kolumbarium: [1, 2], vsyp: [1, 1] };
  let pid = 0;
  for (const [code, sec, row, num, type, free, places, child, ring] of V.graves) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, sx = 0, sy = 0;
    const n = ring.length / 2;
    for (let i = 0; i < ring.length; i += 2) {
      const x = ring[i], y = ring[i + 1];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      sx += x; sy += y;
    }
    const g = { id: code, sec, row, num, type, status: free ? 'volne' : 'obsazeno', places, child: !!child, ring, x0, y0, x1, y1, cx: sx / n, cy: sy / n };
    graves.push(g); graveById[code] = g; byGrave[code] = [];
    const s = secById[sec];
    if (s) { s.graves.push(code); s.x0 = Math.min(s.x0, x0); s.y0 = Math.min(s.y0, y0); s.x1 = Math.max(s.x1, x1); s.y1 = Math.max(s.y1, y1); }
    if (free) continue;
    const fam = pick(SURN);
    const [cMin, cMax] = COUNT[type] || [1, 2];
    const count = ri(cMin, cMax);
    const d0 = ri(1946, NOW.getFullYear());
    let sex = rnd() < 0.5 ? 0 : 1;
    for (let i = 0; i < count; i++) {
      const died = randDate(i === 0 ? d0 : Math.min(NOW.getFullYear(), d0 + ri(-3, 26)));
      const age = child && i === 0 ? ri(0, 12) : rnd() < 0.06 ? ri(19, 47) : ri(52, 97);
      const born = new Date(died.getFullYear() - age, ri(0, 11), ri(1, 28));
      const p = { id: 'p' + (++pid), first: sex ? pick(FEMALE) : pick(MALE), last: fam[sex], sex, born: iso(born), died: iso(died), grave: code };
      p.n = norm(p.first + ' ' + p.last);
      persons.push(p); byGrave[code].push(p);
      sex = 1 - sex;
    }
    byGrave[code].sort((a, b) => a.died.localeCompare(b.died));
    g.lease = `${ri(NOW.getFullYear(), NOW.getFullYear() + 10)}-${pad(ri(1, 12))}-${pad(ri(1, 28))}`;
  }
  persons.sort((a, b) => a.last.localeCompare(b.last, 'cs') || a.first.localeCompare(b.first, 'cs') || a.died.localeCompare(b.died));
  const secOrder = sections.map((s) => s.id);

  // ---------- Prostorový index hrobů (buňky 10 m) ----------
  const CELL = 100, gcols = Math.ceil(W / CELL), grid = new Map();
  for (const g of graves) {
    for (let cx = Math.floor(g.x0 / CELL); cx <= Math.floor(g.x1 / CELL); cx++)
      for (let cy = Math.floor(g.y0 / CELL); cy <= Math.floor(g.y1 / CELL); cy++) {
        const k = cy * gcols + cx;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(g);
      }
  }
  function inRing(r, x, y) {
    let inside = false;
    for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
      const xi = r[i], yi = r[i + 1], xj = r[j], yj = r[j + 1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function graveAt(x, y, tol) {
    const list = grid.get(Math.floor(y / CELL) * gcols + Math.floor(x / CELL)) || [];
    let best = null, bd = tol == null ? 4 : tol;
    for (const g of list) {
      if (x < g.x0 - bd || x > g.x1 + bd || y < g.y0 - bd || y > g.y1 + bd) continue;
      if (inRing(g.ring, x, y)) return g;
      const d = Math.hypot(Math.max(g.x0 - x, 0, x - g.x1), Math.max(g.y0 - y, 0, y - g.y1));
      if (d < bd) { bd = d; best = g; }
    }
    return best;
  }
  function gravesIn(x0, y0, x1, y1, max) {
    const out = [], seen = new Set();
    for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++)
      for (let cy = Math.floor(y0 / CELL); cy <= Math.floor(y1 / CELL); cy++)
        for (const g of grid.get(cy * gcols + cx) || []) {
          if (seen.has(g) || g.cx < x0 || g.cx > x1 || g.cy < y0 || g.cy > y1) continue;
          seen.add(g); out.push(g);
          if (out.length >= max) return out;
        }
    return out;
  }

  // ---------- Body zájmu ----------
  const POI_LABEL = { water: 'Voda', bin: 'Odpadkový koš', bench: 'Lavička', cross: 'Kříž', memorial: 'Pomník', fountain: 'Fontána' };
  const pois = [], trees = [];
  for (const [x, y, t] of V.points) {
    if (t === 'tree' || t === 'conifer' || t === 'bush') trees.push({ x, y, t });
    else if (POI_LABEL[t]) pois.push({ t, x, y, label: POI_LABEL[t] });
  }
  const PANO = [
    { x: 470, y: 1660, label: 'Vstupní prostranství' },
    { x: 1330, y: 1570, label: 'Hlavní alej' },
    { x: 2693, y: 1093, label: 'Kruhové náměstí s křížem' },
    { x: 2327, y: 517, label: 'Kruhové oddělení XIX-O' }
  ];
  PANO.forEach((p, i) => pois.push({ t: 'pano', x: p.x, y: p.y, label: p.label, pano: i }));

  // ---------- Mřížka pro trasování (0,4 m) ----------
  const R = 4, GW = Math.ceil(W / R), GH = Math.ceil(H / R);
  let cost = null, reach = null;
  // 0 = neprůchozí, 1 = zpevněná cesta, 3 = tráva / ulička mezi hroby (+1 u hrany překážky)
  function fill(rings, val) {
    let y0 = Infinity, y1 = -Infinity;
    for (const r of rings) for (let i = 1; i < r.length; i += 2) { if (r[i] < y0) y0 = r[i]; if (r[i] > y1) y1 = r[i]; }
    const ys = Math.max(0, Math.floor(y0 / R)), ye = Math.min(GH - 1, Math.floor(y1 / R));
    const xs = [];
    for (let cy = ys; cy <= ye; cy++) {
      const y = cy * R + R / 2;
      xs.length = 0;
      for (const r of rings) {
        for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
          const yi = r[i + 1], yj = r[j + 1];
          if ((yi > y) !== (yj > y)) xs.push(r[i] + (y - yi) * (r[j] - r[i]) / (yj - yi));
        }
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const a = Math.max(0, Math.ceil(xs[k] / R - 0.5)), b = Math.min(GW - 1, Math.floor(xs[k + 1] / R - 0.5));
        for (let cx = a; cx <= b; cx++) cost[cy * GW + cx] = val;
      }
    }
  }
  function stroke(line, val) {
    for (let i = 0; i + 3 < line.length; i += 2) {
      const ax = line[i], ay = line[i + 1], bx = line[i + 2], by = line[i + 3];
      const n = Math.ceil(Math.hypot(bx - ax, by - ay) / (R / 2));
      for (let s = 0; s <= n; s++) {
        const cx = Math.floor((ax + (bx - ax) * s / n) / R), cy = Math.floor((ay + (by - ay) * s / n) / R);
        if (cx >= 0 && cy >= 0 && cx < GW && cy < GH) cost[cy * GW + cx] = val;
      }
    }
  }
  function buildGrid() {
    cost = new Uint8Array(GW * GH);
    const A = V.areas;
    for (const p of V.boundary) fill(p, 3);
    for (const k of ['paved', 'gravel', 'steps']) for (const p of A[k] || []) fill(p, 1);
    for (const k of ['building', 'monument', 'wall', 'shrub', 'flower', 'tech']) for (const p of A[k] || []) fill(p, 0);
    for (const k of ['wall', 'fence', 'hedge', 'rail']) for (const l of V.lines[k] || []) stroke(l, 0);
    for (const g of graves) fill([g.ring], 0);
    // okraj u překážky (0,4 m): 1 → 2 (chodník u hrany), 3 → 4 (tráva u hrany)
    const edge = new Uint8Array(GW * GH);
    for (let y = 1; y < GH - 1; y++) for (let x = 1; x < GW - 1; x++) {
      const i = y * GW + x;
      if (cost[i] && (!cost[i - 1] || !cost[i + 1] || !cost[i - GW] || !cost[i + GW] || !cost[i - GW - 1] || !cost[i - GW + 1] || !cost[i + GW - 1] || !cost[i + GW + 1])) edge[i] = 1;
    }
    for (let i = 0; i < edge.length; i++) if (edge[i]) cost[i] += 1;
    // dosažitelná oblast z hlavního vchodu (oplocená místa bez průchodu se vynechají)
    reach = null;
    const s = nearestWalkable(GATES.main.x, GATES.main.y, 40);
    const r = new Uint8Array(GW * GH);
    const stack = [s]; r[s] = 1;
    while (stack.length) {
      const u = stack.pop(), ux = u % GW, uy = (u / GW) | 0;
      if (ux > 0 && !r[u - 1] && cost[u - 1]) { r[u - 1] = 1; stack.push(u - 1); }
      if (ux < GW - 1 && !r[u + 1] && cost[u + 1]) { r[u + 1] = 1; stack.push(u + 1); }
      if (uy > 0 && !r[u - GW] && cost[u - GW]) { r[u - GW] = 1; stack.push(u - GW); }
      if (uy < GH - 1 && !r[u + GW] && cost[u + GW]) { r[u + GW] = 1; stack.push(u + GW); }
    }
    reach = r;
  }
  const idx = (x, y) => Math.floor(y / R) * GW + Math.floor(x / R);
  function nearestWalkable(x, y, maxR) {
    const cx0 = Math.floor(x / R), cy0 = Math.floor(y / R);
    for (let r = 0; r <= (maxR || 80); r++) {
      let best = -1, bd = Infinity;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const cx = cx0 + dx, cy = cy0 + dy;
        if (cx < 0 || cy < 0 || cx >= GW || cy >= GH) continue;
        const c = cost[cy * GW + cx];
        if (!c || (reach && !reach[cy * GW + cx])) continue;
        const d = dx * dx + dy * dy + (c - 1) * 0.3;
        if (d < bd) { bd = d; best = cy * GW + cx; }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  // váha buňky: chodník, chodník u hrany, tráva/ulička, tráva u hrany
  const WT = [0, 1, 1.6, 3, 3.6];
  let G, F, P, STAMP, stamp = 0;
  function astar(s, t) {
    const n = GW * GH;
    if (!G) { G = new Float32Array(n); F = new Int32Array(n); P = new Int32Array(n); STAMP = new Int32Array(n); }
    stamp++;
    const tx = t % GW, ty = (t / GW) | 0;
    const h = (i) => { const dx = Math.abs(i % GW - tx), dy = Math.abs(((i / GW) | 0) - ty); return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy); };
    // binární halda
    let heap = [], hf = [];
    const push = (i, f) => { heap.push(i); hf.push(f); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (hf[p] <= hf[k]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; [hf[p], hf[k]] = [hf[k], hf[p]]; k = p; } };
    const pop = () => {
      const top = heap[0], lastI = heap.pop(), lastF = hf.pop();
      if (heap.length) {
        heap[0] = lastI; hf[0] = lastF; let k = 0;
        for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && hf[l] < hf[m]) m = l; if (r < heap.length && hf[r] < hf[m]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; [hf[m], hf[k]] = [hf[k], hf[m]]; k = m; }
      }
      return top;
    };
    G[s] = 0; STAMP[s] = stamp; P[s] = -1; F[s] = 0;
    push(s, h(s));
    const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
    while (heap.length) {
      const u = pop();
      if (u === t) break;
      if (F[u] === stamp) continue;
      F[u] = stamp;
      const ux = u % GW, uy = (u / GW) | 0;
      for (const [dx, dy, dd] of DIRS) {
        const vx = ux + dx, vy = uy + dy;
        if (vx < 0 || vy < 0 || vx >= GW || vy >= GH) continue;
        const v = vy * GW + vx, c = cost[v];
        if (!c) continue;
        if (dx && dy && (!cost[uy * GW + vx] || !cost[vy * GW + ux])) continue;
        const ng = G[u] + dd * (WT[c] + WT[cost[u]]) / 2;
        if (STAMP[v] !== stamp || ng < G[v]) { STAMP[v] = stamp; G[v] = ng; P[v] = u; push(v, ng + h(v)); }
      }
    }
    if (STAMP[t] !== stamp) return null;
    const path = [];
    for (let i = t; i !== -1; i = P[i]) path.push(i);
    return path.reverse();
  }

  function clearLine(a, b) {
    const ax = a % GW + 0.5, ay = ((a / GW) | 0) + 0.5, bx = b % GW + 0.5, by = ((b / GW) | 0) + 0.5;
    const ca = Math.max(cost[a], cost[b]);
    // jemné vzorkování + kontrola okolí bodu (± 0,15 buňky), aby linie neřízla roh překážky
    const n = Math.ceil(Math.hypot(bx - ax, by - ay) * 5);
    for (let s = 1; s < n; s++) {
      const x = ax + (bx - ax) * s / n, y = ay + (by - ay) * s / n;
      for (const [ox, oy] of [[0, 0], [0.15, 0.15], [-0.15, 0.15], [0.15, -0.15], [-0.15, -0.15]]) {
        const c = cost[Math.floor(y + oy) * GW + Math.floor(x + ox)];
        if (!c || c > ca) return false;
      }
    }
    return true;
  }
  function smooth(path) {
    const out = [path[0]];
    let i = 0;
    const last = path.length - 1;
    while (i < last) {
      // cválání vpřed a pak binární hledání nejvzdálenějšího viditelného bodu
      let ok = i + 1, step = 2, bad = -1;
      while (ok + step <= last && step <= 512) {
        if (clearLine(path[i], path[ok + step])) { ok += step; step *= 2; } else { bad = ok + step; break; }
      }
      let hi = bad < 0 ? Math.min(last, ok + step) : bad;
      if (hi > ok && clearLine(path[i], path[hi])) ok = hi;
      else while (hi - ok > 1) { const mid = (ok + hi) >> 1; if (clearLine(path[i], path[mid])) ok = mid; else hi = mid; }
      out.push(path[ok]); i = ok;
    }
    return out;
  }
  const toPt = (i) => ({ x: (i % GW) * R + R / 2, y: ((i / GW) | 0) * R + R / 2 });
  const meters = (u) => Math.max(1, Math.round(u * M_PER_UNIT));
  const roundM = (m) => (m < 20 ? m : Math.round(m / 5) * 5);

  function nearestSection(x, y) {
    let best = null, bd = Infinity;
    for (const s of sections) { const d = Math.hypot(s.lx - x, s.ly - y); if (d < bd) { bd = d; best = s; } }
    return bd < 260 ? best : null;
  }

  // Douglas–Peucker: zjednodušení jen pro textové pokyny (nakreslená trasa zůstává přesná)
  function simplify(pts, tol) {
    if (pts.length < 3) return pts.slice();
    const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [i, j] = stack.pop();
      const a = pts[i], b = pts[j], L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      let md = 0, mk = -1;
      for (let k = i + 1; k < j; k++) {
        const d = Math.abs((b.x - a.x) * (a.y - pts[k].y) - (a.x - pts[k].x) * (b.y - a.y)) / L;
        if (d > md) { md = d; mk = k; }
      }
      if (md > tol) { keep[mk] = 1; stack.push([i, mk], [mk, j]); }
    }
    return pts.filter((_, i) => keep[i]);
  }
  const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

  const cache = {};
  function route(graveId, startKey, at) {
    if (startKey === 'gps' && at) return routeFrom(graveId, 'gps', { x: at.x, y: at.y, label: 'Moje poloha', short: 'od místa, kde stojíte' });
    if (startKey === 'auto' || !GATES[startKey]) {
      let best = null;
      for (const k of Object.keys(GATES)) { const r = route(graveId, k); if (r.ok && (!best || r.u < best.u)) best = r; }
      return best || route(graveId, 'main');
    }
    const key = graveId + '|' + startKey;
    if (cache[key]) return cache[key];
    return (cache[key] = routeFrom(graveId, startKey, GATES[startKey]));
  }

  function routeFrom(graveId, startKey, gate) {
    if (!cost) buildGrid();
    const g = graveById[graveId];
    const s = nearestWalkable(gate.x, gate.y, 60), t = nearestWalkable(g.cx, g.cy, 160);
    const raw = s >= 0 && t >= 0 ? astar(s, t) : null;
    const pts = [{ x: gate.x, y: gate.y }];
    if (raw) pts.push(...smooth(raw).map(toPt));
    // poslední krok k hrobu: na nejbližší bod obrysu
    const end = pts[pts.length - 1];
    let ex = g.cx, ey = g.cy, ed = Infinity;
    for (let i = 0; i < g.ring.length; i += 2) {
      const d = Math.hypot(g.ring[i] - end.x, g.ring[i + 1] - end.y);
      if (d < ed) { ed = d; ex = g.ring[i]; ey = g.ring[i + 1]; }
    }
    pts.push({ x: ex, y: ey });
    let total = 0;
    for (let i = 1; i < pts.length; i++) total += dist(pts[i - 1], pts[i]);

    // ---- pokyny: úseky mezi zatáčkami nad 30° ----
    const sp = simplify(pts.slice(0, -1), 15);
    const legs = [];
    let acc = 0, turn = null;
    for (let i = 1; i < sp.length; i++) {
      acc += dist(sp[i - 1], sp[i]);
      if (i === sp.length - 1) break;
      const p = sp[i - 1], a = sp[i], b = sp[i + 1];
      const cross = (a.x - p.x) * (b.y - a.y) - (a.y - p.y) * (b.x - a.x);
      const ang = Math.abs(Math.atan2(cross, (a.x - p.x) * (b.x - a.x) + (a.y - p.y) * (b.y - a.y)));
      if (ang < 0.52) continue;
      legs.push({ turn, u: acc });
      // orientační bod: sekce kousek za zatáčkou
      const L = dist(a, b) || 1, ahead = { x: a.x + (b.x - a.x) * Math.min(1, 80 / L), y: a.y + (b.y - a.y) * Math.min(1, 80 / L) };
      turn = { dir: cross > 0 ? 'right' : 'left', sharp: ang > 0.85, back: ang > 2.4, sec: nearestSection(ahead.x, ahead.y) };
      acc = 0;
    }
    legs.push({ turn, u: acc });
    // krátké úseky (do 5 m) přičíst k následujícímu – obloučky a odsazení cest
    for (let i = legs.length - 2; i >= 1; i--) if (legs[i].u < 50) { legs[i + 1].u += legs[i].u; if (!legs[i + 1].turn) legs[i + 1].turn = legs[i].turn; legs.splice(i, 1); }
    // poslední krátký úsek (do 5 m) je jen „přistoupení k hrobu“ – přičíst k předchozímu
    if (legs.length > 1 && legs[legs.length - 1].u < 50) legs[legs.length - 2].u += legs.pop().u;
    const steps = [{ kind: 'start', text: startKey === 'gps' ? 'Vyjděte od místa, kde stojíte' : `Vstupte ${gate.short}` }];
    for (const l of legs) {
      const m = roundM(meters(l.u));
      if (!l.turn) { steps.push({ kind: 'straight', text: 'Pokračujte rovně', m }); continue; }
      const side = l.turn.dir === 'right' ? 'vpravo' : 'vlevo';
      const verb = l.turn.back ? 'Otočte se' : l.turn.sharp ? `Odbočte ${side}` : `Držte se ${side}`;
      steps.push({ kind: l.turn.dir, text: l.turn.sec ? `${verb} k sekci ${l.turn.sec.id}` : verb, m });
    }
    const la = sp[Math.max(0, sp.length - 2)], lb = sp[sp.length - 1];
    const cr = (lb.x - la.x) * (g.cy - lb.y) - (lb.y - la.y) * (g.cx - lb.x);
    const side = ed < 12 ? 'přímo před vámi' : cr > 0 ? 'po vaší pravé straně' : 'po vaší levé straně';
    steps.push({ kind: 'finish', text: `Hrob ${g.num} v sekci ${g.sec} je ${side}` });
    const m = roundM(meters(total));
    return { ok: !!raw, gate: startKey, u: total, pts, steps, m, min: Math.max(1, Math.round(m / 70)) };
  }

  // ---------- Pohřby (relativně k dnešku) ----------
  const funerals = [];
  (function () {
    const slots = [[0, '10:00'], [0, '12:30'], [0, '14:00'], [1, '9:30'], [1, '11:00'], [1, '13:30'], [2, '10:30'], [3, '9:00'], [3, '12:00'], [4, '10:00']];
    const pool = graves.filter((g) => g.status === 'obsazeno' && g.type !== 'vsyp');
    for (const [day, time] of slots) {
      const d = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + day);
      if (d.getDay() === 0) continue;
      const sex = rnd() < 0.5 ? 0 : 1, fam = pick(SURN), g = pick(pool);
      const urn = /urn|kolumb/.test(g.type);
      funerals.push({ date: iso(d), time, name: `${sex ? pick(FEMALE) : pick(MALE)} ${fam[sex]}`, age: ri(61, 96), sex, place: urn ? 'Smuteční obřad · poté uložení urny' : 'Smuteční obřad · poté do hrobu', grave: g.id });
    }
  })();

  // ---------- Informace o hřbitově ----------
  const info = {
    name: 'Hřbitov Vítkovice',
    owner: 'Statutární město Ostrava – městský obvod Vítkovice',
    admin: 'Správa hřbitova',
    address: 'Adresa hřbitova · doplní správa',
    phone: '+420 000 000 000',
    email: 'sprava@hrbitov.example',
    source: V.source,
    office: [['Pondělí', '8:00 – 17:00'], ['Úterý', '8:00 – 14:00'], ['Středa', '8:00 – 17:00'], ['Čtvrtek', '8:00 – 14:00'], ['Pátek', '8:00 – 12:00']]
  };
  function hoursFor(d) {
    const m = d.getMonth(), day = d.getDate();
    if ((m === 9 && day >= 31) || (m === 10 && day <= 2)) return { open: 7, close: 21, note: 'Dušičky – prodloužená doba' };
    if (m >= 3 && m <= 8) return { open: 7, close: 20 };
    return { open: 7, close: 18 };
  }

  // ---------- Souřadnice S-JTSK ↔ mapa ----------
  const crs = V.crs;
  const fromSJTSK = (x, y) => ({ x: (x - crs.ox) * 10, y: (crs.oy - y) * 10 });

  window.CEM = {
    W, H, GATES, M_PER_UNIT, V,
    sections, secById, secOrder, graves, persons, graveById, byGrave, trees, pois, funerals, info,
    route, graveAt, gravesIn, hoursFor, norm, iso, fromSJTSK,
    _grid: () => { if (!cost) buildGrid(); return { cost, GW, GH, R, nearestWalkable, astar }; }
  };
})();
