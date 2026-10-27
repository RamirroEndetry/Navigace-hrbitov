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
    main: { x: 278, y: 1717, label: 'Hlavní vchod', short: 'hlavním vchodem', gen: 'hlavního vchodu', btn: 'Hlavní' },
    north: { x: 735, y: 1215, label: 'Severní vchod', short: 'severním vchodem', gen: 'severního vchodu', btn: 'Severní' },
    east: { x: 3334, y: 1790, label: 'Východní branka', short: 'východní brankou', gen: 'východní branky', btn: 'Východní' }
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
  // cost = mřížka pro hledání cesty (hroby mírně zmenšené), solid = plné překážky pro kontrolu čáry
  let cost = null, reach = null, solid = null;
  // 0 = neprůchozí, 1 = zpevněná cesta, 3 = tráva / ulička mezi hroby (+1 u hrany překážky)
  function fill(rings, val, target) {
    const T = target || cost;
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
        for (let cx = a; cx <= b; cx++) T[cy * GW + cx] = val;
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
    // hroby v mřížce o 25 cm menší než na mapě – úzké uličky mezi zarovnanými řadami zůstanou průchozí
    solid = cost.slice();
    for (const g of graves) fill([g.ring], 0, solid);
    for (const g of graves) {
      const r = g.ring, out = [];
      for (let i = 0; i < r.length; i += 2) {
        const dx = r[i] - g.cx, dy = r[i + 1] - g.cy, L = Math.hypot(dx, dy) || 1, k = Math.max(0.3, 1 - 2.5 / L);
        out.push(g.cx + dx * k, g.cy + dy * k);
      }
      fill([out], 0);
    }
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
        const ci = Math.floor(y + oy) * GW + Math.floor(x + ox), c = cost[ci];
        if (!c || c > ca || !solid[ci]) return false;
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
  const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

  function nearestSection(x, y) {
    let best = null, bd = Infinity;
    for (const s of sections) { const d = Math.hypot(s.lx - x, s.ly - y); if (d < bd) { bd = d; best = s; } }
    return bd < 260 ? best : null;
  }

  // ---------- Síť cest (graf) ----------
  // Trasa vede výhradně po této síti: osy cest narovnané na rovné úseky středem cesty.
  // Jen poslední krátký úsek k hrobu vede uličkou mezi hroby.
  //
  // Ruční úpravy sítě (souřadnice v dm, viz data/vitkovice.js):
  //  - remove: oblasti, kde automatická osa nedává smysl (terasa pod budovou u hlavní brány)
  //  - add:    skutečné průchody po prostranství (rozcestí u brány → cesta k jihu → kolem terasy na hlavní alej)
  const NET_FIX = {
    remove: [[[330, 1650], [660, 1650], [660, 1850], [330, 1850]]],
    add: [
      [[278, 1717], [400, 1718]],               // hlavní brána → rovně dovnitř na prostranství
      [[400, 1718], [368, 1669]],               // → cesta na sever mezi budovami
      [[400, 1718], [424, 1819]],               // dolů středem zpevněného pásu mezi trávníkem a terasou
      [[424, 1819], [381, 1873]],               // → cesta k jihu
      [[424, 1819], [521, 1822], [612, 1789]]   // kolem terasy na hlavní alej
    ]
  };

  const NET = { nodes: [], edges: [] };
  const GATE_NODE = {};
  let netReady = false;

  function inPoly(poly, x, y) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  function measure(e) {
    e.cum = [0];
    for (let k = 1; k < e.pts.length; k++) e.cum.push(e.cum[k - 1] + dist(e.pts[k - 1], e.pts[k]));
    e.len = e.cum[e.cum.length - 1];
  }
  function addNode(x, y) { NET.nodes.push({ x, y, adj: [] }); return NET.nodes.length - 1; }
  function nodeAt(x, y, snap) {
    let best = -1, bd = snap;
    NET.nodes.forEach((n, i) => { if (!n.adj.length) return; const d = Math.hypot(n.x - x, n.y - y); if (d < bd) { bd = d; best = i; } });
    return best >= 0 ? best : addNode(x, y);
  }
  function addEdge(a, b, pts, w) {
    const e = { a, b, w, pts, wf: w < 15 ? 3 : w < 25 ? 1.15 : 1 };
    measure(e);
    NET.edges.push(e);
    NET.nodes[a].adj.push(NET.edges.length - 1); NET.nodes[b].adj.push(NET.edges.length - 1);
    return e;
  }
  // rovný úsek nesmí vést přes hrob, budovu ani zeď
  function clearSeg(a, b, skipStart) {
    const n = Math.ceil(dist(a, b) / 1.5);
    for (let s = skipStart ? 2 : 1; s < n; s++) {
      const x = a.x + (b.x - a.x) * s / n, y = a.y + (b.y - a.y) * s / n;
      if (!solid[Math.floor(y / R) * GW + Math.floor(x / R)]) return false;
    }
    return true;
  }
  // Douglas–Peucker s kontrolou překážek: zůstanou jen skutečné zlomy cesty
  function straightLine(pts, tol) {
    if (pts.length < 3) return pts.slice();
    const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [i, j] = stack.pop();
      if (j - i < 2) continue;
      const a = pts[i], b = pts[j], L = dist(a, b) || 1;
      let md = -1, mk = -1;
      for (let k = i + 1; k < j; k++) {
        const d = Math.abs((b.x - a.x) * (a.y - pts[k].y) - (a.x - pts[k].x) * (b.y - a.y)) / L;
        if (d > md) { md = d; mk = k; }
      }
      if (md > tol || !clearSeg(a, b)) { keep[mk] = 1; stack.push([i, mk], [mk, j]); }
    }
    const out = pts.filter((_, i) => keep[i]);
    // téměř rovné zlomy (pod 10°) sloučit
    for (let i = 1; i < out.length - 1;) {
      const p = out[i - 1], q = out[i], r = out[i + 1];
      const t = Math.abs(Math.atan2((q.x - p.x) * (r.y - q.y) - (q.y - p.y) * (r.x - q.x), (q.x - p.x) * (r.x - q.x) + (q.y - p.y) * (r.y - q.y)));
      if (t < 0.17 && clearSeg(p, r)) out.splice(i, 1); else i++;
    }
    return out;
  }

  function prepNet() {
    if (netReady) return;
    if (!cost) buildGrid();
    V.net.nodes.forEach(([x, y]) => addNode(x, y));
    for (const [a, b, w, flat] of V.net.edges) {
      const pts = [];
      for (let k = 0; k < flat.length; k += 2) pts.push({ x: flat[k], y: flat[k + 1] });
      // skutečný geometrický střed hrany (ne prostřední vrchol)
      const tmp = { pts }; measure(tmp); const mid = pointAt(tmp, tmp.len / 2);
      if (NET_FIX.remove.some((poly) => inPoly(poly, mid.x, mid.y))) continue;
      addEdge(a, b, pts, w);
    }
    for (const line of NET_FIX.add) {
      const pts = line.map(([x, y]) => ({ x, y }));
      const a = nodeAt(pts[0].x, pts[0].y, 20), b = nodeAt(pts[pts.length - 1].x, pts[pts.length - 1].y, 20);
      pts[0] = { x: NET.nodes[a].x, y: NET.nodes[a].y }; pts[pts.length - 1] = { x: NET.nodes[b].x, y: NET.nodes[b].y };
      addEdge(a, b, pts, 40);
    }
    // shluky uzlů na širokých křižovatkách (do 5 m od sebe) sloučit do jednoho středu křižovatky
    const parent = NET.nodes.map((_, i) => i);
    const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    for (const e of NET.edges) if (e.len < 50) parent[find(e.a)] = find(e.b);
    const groups = {};
    NET.nodes.forEach((n, i) => { if (n.adj.length) (groups[find(i)] = groups[find(i)] || []).push(i); });
    for (const [root, members] of Object.entries(groups)) {
      if (members.length < 2) continue;
      const cx = members.reduce((s, i) => s + NET.nodes[i].x, 0) / members.length, cy = members.reduce((s, i) => s + NET.nodes[i].y, 0) / members.length;
      NET.nodes[root].x = cx; NET.nodes[root].y = cy;
    }
    const kept = [];
    for (const e of NET.edges) {
      const a = find(e.a), b = find(e.b);
      if (a === b) continue;
      e.a = a; e.b = b;
      e.pts[0] = { x: NET.nodes[a].x, y: NET.nodes[a].y };
      e.pts[e.pts.length - 1] = { x: NET.nodes[b].x, y: NET.nodes[b].y };
      measure(e); kept.push(e);
    }
    NET.edges = kept;
    NET.nodes.forEach((n) => (n.adj = []));
    NET.edges.forEach((e, i) => { NET.nodes[e.a].adj.push(i); NET.nodes[e.b].adj.push(i); });
    // narovnat všechny cesty: rovné úseky středem cesty (odchylka max. 1,2 m)
    for (const e of NET.edges) { e.pts = straightLine(e.pts, 6); measure(e); }
    // brány: vlastní uzel s rovnou spojnicí kolmo na nejbližší místo cesty (cesta se tam rozdělí)
    for (const [key, gt] of Object.entries(GATES)) {
      const own = NET.nodes.findIndex((n) => n.adj.length && Math.hypot(n.x - gt.x, n.y - gt.y) < 3);
      if (own >= 0) { GATE_NODE[key] = own; continue; }
      let best = null;
      NET.edges.forEach((e, ei) => {
        for (let k = 1; k < e.pts.length; k++) {
          const a = e.pts[k - 1], b = e.pts[k], L2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2 || 1;
          const t = Math.max(0, Math.min(1, ((gt.x - a.x) * (b.x - a.x) + (gt.y - a.y) * (b.y - a.y)) / L2));
          const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, d = dist(p, gt);
          if ((!best || d < best.d) && clearSeg(gt, p, true)) best = { ei, k, p, d, off: e.cum[k - 1] + t * Math.sqrt(L2) };
        }
      });
      const gn = addNode(gt.x, gt.y);
      GATE_NODE[key] = gn;
      if (!best) continue;
      const e = NET.edges[best.ei];
      let pn;
      if (best.off < 30) pn = e.a;
      else if (e.len - best.off < 30) pn = e.b;
      else {
        // rozdělit hranu v bodě napojení
        pn = addNode(best.p.x, best.p.y);
        const first = [...e.pts.slice(0, best.k), best.p], second = [best.p, ...e.pts.slice(best.k)];
        const oldB = e.b;
        NET.nodes[oldB].adj = NET.nodes[oldB].adj.filter((i) => i !== best.ei);
        e.b = pn; e.pts = first; measure(e);
        NET.nodes[pn].adj.push(best.ei);
        addEdge(pn, oldB, second, e.w);
      }
      addEdge(gn, pn, [{ x: gt.x, y: gt.y }, { x: NET.nodes[pn].x, y: NET.nodes[pn].y }], 40);
    }
    netReady = true;
  }
  function pointAt(e, off) {
    off = Math.max(0, Math.min(e.len, off));
    let k = 1;
    while (k < e.cum.length - 1 && e.cum[k] < off) k++;
    const t = (off - e.cum[k - 1]) / ((e.cum[k] - e.cum[k - 1]) || 1);
    return { x: e.pts[k - 1].x + (e.pts[k].x - e.pts[k - 1].x) * t, y: e.pts[k - 1].y + (e.pts[k].y - e.pts[k - 1].y) * t };
  }
  // úsek hrany mezi dvěma offsety (ve směru o1 -> o2)
  function slice(e, o1, o2) {
    const out = [pointAt(e, o1)];
    if (o1 < o2) { for (let k = 0; k < e.pts.length; k++) if (e.cum[k] > o1 && e.cum[k] < o2) out.push(e.pts[k]); }
    else { for (let k = e.pts.length - 1; k >= 0; k--) if (e.cum[k] < o1 && e.cum[k] > o2) out.push(e.pts[k]); }
    out.push(pointAt(e, o2));
    return out;
  }
  // buňky mřížky ležící na ose cesty -> (hrana, offset)
  let netCell = null, netOff = null;
  function rasterNet() {
    prepNet();
    netCell = new Int32Array(GW * GH); netOff = new Float32Array(GW * GH);
    NET.edges.forEach((e, ei) => {
      for (let off = 0; off <= e.len; off += 1.5) {
        const p = pointAt(e, off), i = idx(p.x, p.y);
        if (i >= 0 && i < netCell.length && cost[i] && (!netCell[i] || NET.edges[netCell[i] - 1].wf > e.wf)) { netCell[i] = ei + 1; netOff[i] = off; }
      }
    });
  }

  // omezený Dijkstra na mřížce z bodu – najde místa, kde se lze napojit na síť cest
  function attach(x, y, limit, windowCells) {
    if (!cost) buildGrid();
    if (!netCell) rasterNet();
    const s = nearestWalkable(x, y, 160);
    if (s < 0) return null;
    const n = GW * GH;
    if (!G) { G = new Float32Array(n); F = new Int32Array(n); P = new Int32Array(n); STAMP = new Int32Array(n); }
    stamp++;
    const heap = [], hf = [];
    const push = (i, f) => { heap.push(i); hf.push(f); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (hf[p] <= hf[k]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; [hf[p], hf[k]] = [hf[k], hf[p]]; k = p; } };
    const pop = () => { const top = heap[0], li = heap.pop(), lf = hf.pop(); if (heap.length) { heap[0] = li; hf[0] = lf; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && hf[l] < hf[m]) m = l; if (r < heap.length && hf[r] < hf[m]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; [hf[m], hf[k]] = [hf[k], hf[m]]; k = m; } } return top; };
    G[s] = 0; STAMP[s] = stamp; P[s] = -1; push(s, 0);
    const cands = [];
    let firstHit = Infinity;
    const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
    while (heap.length) {
      const u = pop();
      if (F[u] === stamp) continue;
      F[u] = stamp;
      const gu = G[u];
      if (gu > limit || gu > firstHit + (windowCells || 60)) break;
      if (netCell[u]) { cands.push({ cell: u, e: netCell[u] - 1, off: netOff[u], gd: gu * R }); if (firstHit === Infinity) firstHit = gu; }
      const ux = u % GW, uy = (u / GW) | 0;
      for (const [dx, dy, dd] of DIRS) {
        const vx = ux + dx, vy = uy + dy;
        if (vx < 0 || vy < 0 || vx >= GW || vy >= GH) continue;
        const v = vy * GW + vx, c = cost[v];
        if (!c) continue;
        if (dx && dy && (!cost[uy * GW + vx] || !cost[vy * GW + ux])) continue;
        const ng = gu + dd * (WT[c] + WT[cost[u]]) / 2;
        if (STAMP[v] !== stamp || ng < G[v]) { STAMP[v] = stamp; G[v] = ng; P[v] = u; push(v, ng); }
      }
    }
    // na každé hraně stačí nejlepší kandidát po 2 m
    const bestBy = new Map();
    for (const c of cands) { const k = c.e * 100000 + Math.round(c.off / 20); const o = bestBy.get(k); if (!o || c.gd < o.gd) bestBy.set(k, c); }
    const kept = [...bestBy.values()];
    // cesta z každého kandidáta zpět k výchozí buňce (posbírat hned – pole se sdílí)
    for (const c of kept) { const ch = []; for (let i = c.cell; i !== -1; i = P[i]) ch.push(i); c.chain = ch; }
    return { s, cands: kept };
  }

  const endCache = {};
  function graveEnd(g) {
    if (!endCache[g.id]) {
      let a = attach(g.cx, g.cy, 600, 250);
      // daleko od zpevněných cest (např. urnový háj): hledat dál po trávě
      if (!a || !a.cands.length) a = attach(g.cx, g.cy, 2500, 120);
      endCache[g.id] = a;
    }
    return endCache[g.id];
  }

  function dedupe(pts) {
    const out = [];
    for (const p of pts) if (!out.length || dist(out[out.length - 1], p) > 0.5) out.push(p);
    return out;
  }
  const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
  const heading = (p, q) => Math.atan2(q.y - p.y, q.x - p.x);

  // odstranit „hroty“ (krátké návraty tam a zpět na křižovatkách), pokud je přímá spojnice volná
  function despike(pts) {
    const out = pts.slice();
    for (let changed = true; changed;) {
      changed = false;
      for (let i = 1; i < out.length - 1; i++) {
        const a = out[i - 1], b = out[i], c = out[i + 1];
        const t = Math.abs(angDiff(heading(a, b), heading(b, c)));
        if ((t > 2.0 && Math.min(dist(a, b), dist(b, c)) < 80 || t > 1.7 && Math.min(dist(a, b), dist(b, c)) < 70) && clearSeg(a, c, i === 1)) { out.splice(i, 1); changed = true; break; }
      }
    }
    return out;
  }

  // ---------- poslední úsek k hrobu: varianty „do kolínka“ podle os hrobu ----------
  function graveAxes(g) {
    const r = g.ring;
    const p0 = { x: r[0], y: r[1] }, p1 = { x: r[2], y: r[3] }, p3 = { x: r[r.length - 2], y: r[r.length - 1] };
    const L1 = dist(p0, p1) || 1, L3 = dist(p0, p3) || 1;
    return { u: { x: (p1.x - p0.x) / L1, y: (p1.y - p0.y) / L1 }, v: { x: (p3.x - p0.x) / L3, y: (p3.y - p0.y) / L3 }, w: L1, h: L3 };
  }
  function nearestOnRing(g, p) {
    let best = null, bd = Infinity;
    const r = g.ring, n = r.length / 2;
    for (let i = 0; i < n; i++) {
      const a = { x: r[2 * i], y: r[2 * i + 1] }, b = { x: r[(2 * i + 2) % r.length], y: r[(2 * i + 3) % r.length] };
      const L2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2 || 1;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / L2));
      const q = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, d = dist(p, q);
      if (d < bd) { bd = d; best = q; }
    }
    return best;
  }
  // délka čáry (v dm) uvnitř cizích hrobů a přes pevné překážky
  function legScore(pts, g) {
    let inside = 0, len = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], L = dist(a, b), m = Math.max(1, Math.ceil(L));
      len += L;
      for (let s = 0; s < m; s++) {
        const x = a.x + (b.x - a.x) * (s + 0.5) / m, y = a.y + (b.y - a.y) * (s + 0.5) / m;
        const o = graveAt(x, y, 0);
        if (o && o !== g && inRing(o.ring, x, y)) inside += L / m;
        else if (!o) { const k = Math.floor(y / R) * GW + Math.floor(x / R); if (!solid[k] && !isGraveCell(x, y)) inside += 2 * L / m; }
      }
    }
    return inside * 6 + len;
  }
  function isGraveCell(x, y) { return !!graveAt(x, y, 3); }
  // varianty „do kolínka“: odbočit z cesty přesně tam, kde na ni ústí spára mezi řadami/sloupci hrobů,
  // projít spárou k hrobu a krátce k jeho okraji
  function elbowLegs(P, Pprev, g) {
    const { u, v, w, h } = graveAxes(g), G = { x: g.cx, y: g.cy };
    const along = (o, d, t) => ({ x: o.x + d.x * t, y: o.y + d.y * t });
    const dot = (a, d) => a.x * d.x + a.y * d.y;
    const L = dist(Pprev, P) || 1, d = { x: (P.x - Pprev.x) / L, y: (P.y - Pprev.y) / L };
    // průsečík přímky cesty (P + t·d) s přímkou spáry (O + s·e)
    const meet = (O, e) => {
      const den = d.x * e.y - d.y * e.x;
      if (Math.abs(den) < 0.2) return null;
      const t = ((O.x - P.x) * e.y - (O.y - P.y) * e.x) / den;
      return t >= -3 && t <= 150 ? along(P, d, t) : null;
    };
    const out = [];
    const rel = { x: P.x - G.x, y: P.y - G.y };
    for (const off of [0.3, 2]) {
      for (const side of [1, -1]) {
        // spára vedle hrobu ve směru v (mezi sloupci): přímka G + u·bu, směr v
        const bu = side * (w / 2 + off), O1 = along(G, u, bu), Q1 = meet(O1, v);
        if (Q1) out.push(dedupe([P, Q1, along(O1, v, 0), along(G, u, side * w / 2)]));
        // spára před/za hrobem (mezi řadami): přímka G + v·av, směr u
        const av = side * (h / 2 + off), O2 = along(G, v, av), Q2 = meet(O2, u);
        if (Q2) out.push(dedupe([P, Q2, along(O2, u, 0), along(G, v, side * h / 2)]));
        // jednoduché kolínko z bodu P
        const pu = dot(rel, u), pv = dot(rel, v);
        out.push(dedupe([P, along(P, v, av - pv), along(G, v, av), along(G, v, side * h / 2)]));
        out.push(dedupe([P, along(P, u, bu - pu), along(G, u, bu), along(G, u, side * w / 2)]));
      }
    }
    return out;
  }

  // odstranit „hrbolky“: krátký výstupek (1–3 body) uprostřed jinak rovného úseku (např. posunutý střed křižovatky)
  function debump(pts) {
    const out = pts.slice();
    const dirDiff = (p, q, r, t) => Math.abs(angDiff(heading(p, q), heading(r, t)));
    for (let changed = true; changed;) {
      changed = false;
      for (let k = 1; k <= 3 && !changed; k++) {
        for (let i = 1; i + k < out.length; i++) {
          const a = out[i - 1], c = out[i + k];
          if (dist(a, c) > 160) continue;
          let dev = 0;
          for (let j = i; j < i + k; j++) dev = Math.max(dev, Math.abs((c.x - a.x) * (a.y - out[j].y) - (a.x - out[j].x) * (c.y - a.y)) / (dist(a, c) || 1));
          if (dev < 6 || dev > 45) continue;
          const inOk = i < 2 || dirDiff(out[i - 2], a, a, c) < 0.3;
          const outOk = i + k + 1 >= out.length || dirDiff(a, c, c, out[i + k + 1]) < 0.3;
          if (inOk && outOk && clearSeg(a, c, i === 1)) { out.splice(i, k); changed = true; break; }
        }
      }
    }
    return out;
  }

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
    prepNet();
    if (!netCell) rasterNet();
    const g = graveById[graveId];
    const end = graveEnd(g);
    const fallback = { ok: false, gate: startKey, u: Infinity, pts: [{ x: gate.x, y: gate.y }, { x: g.cx, y: g.cy }], draw: [{ x: gate.x, y: gate.y }, { x: g.cx, y: g.cy }], steps: [{ kind: 'finish', text: 'Trasu se nepodařilo spočítat' }], m: 0, min: 0 };
    if (!end || !end.cands.length) return fallback;

    // --- start: brána je uzel sítě; GPS se na síť napojí nejbližším průchodem ---
    const N = NET.nodes.length, D = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), via = new Int32Array(N).fill(-1), src = new Int32Array(N).fill(-1);
    let starts = [];
    if (startKey === 'gps') {
      const a = attach(gate.x, gate.y, 300);
      if (a) starts = a.cands.map((c) => ({ e: c.e, off: c.off, gd: c.gd, chain: c.chain }));
      if (!starts.length) return fallback;
      starts.forEach((s, si) => {
        const e = NET.edges[s.e];
        for (const [node, d] of [[e.a, s.gd + s.off * e.wf], [e.b, s.gd + (e.len - s.off) * e.wf]]) if (d < D[node]) { D[node] = d; src[node] = si; via[node] = s.e; }
      });
    } else {
      D[GATE_NODE[startKey]] = 0;
    }
    const done = new Uint8Array(N);
    for (;;) {
      let u = -1;
      for (let i = 0; i < N; i++) if (!done[i] && D[i] < Infinity && (u < 0 || D[i] < D[u])) u = i;
      if (u < 0) break;
      done[u] = 1;
      for (const ei of NET.nodes[u].adj) {
        const e = NET.edges[ei], v = e.a === u ? e.b : e.a, nd = D[u] + e.len * e.wf;
        if (nd < D[v]) { D[v] = nd; prev[v] = u; via[v] = ei; src[v] = src[u]; }
      }
    }

    // --- nejlepší místo, kde z cesty odbočit k hrobu ---
    // chůze mimo chodník je výrazně „dražší“ – trasa zůstane na cestě co nejdéle a k hrobu odbočí až na nejbližším místě
    const GRASS = 4;
    let best = null;
    for (const c of end.cands) {
      const e = NET.edges[c.e];
      const opts = [{ node: e.a, t: D[e.a] + c.off * e.wf }, { node: e.b, t: D[e.b] + (e.len - c.off) * e.wf }];
      starts.forEach((s, si) => { if (s.e === c.e) opts.push({ same: si, t: s.gd + Math.abs(s.off - c.off) * e.wf }); });
      for (const o of opts) {
        const tot = o.t + c.gd * GRASS;
        if (!best || tot < best.tot) best = { tot, c, o };
      }
    }
    if ((!best || !isFinite(best.tot)) && !end.wide) {
      endCache[g.id] = Object.assign(attach(g.cx, g.cy, 2500, 400) || { cands: [] }, { wide: true });
      return routeFrom(graveId, startKey, gate);
    }
    if (!best || !isFinite(best.tot)) return fallback;

    // --- geometrie: start → po síti → místo odbočení ---
    const { c, o } = best;
    const ce = NET.edges[c.e];
    let head;
    if (o.same != null) {
      const s = starts[o.same];
      head = [{ x: gate.x, y: gate.y }, ...straightLine(dedupe(smooth(s.chain.slice().reverse()).map(toPt)), 8), ...slice(ce, s.off, c.off)];
    } else {
      const chainN = [];
      for (let n = o.node; n !== -1 && n !== undefined; n = prev[n]) { chainN.unshift(n); if (prev[n] === -1) break; }
      head = [];
      if (startKey === 'gps') {
        const s = starts[src[chainN[0]]], se = NET.edges[s.e];
        head.push({ x: gate.x, y: gate.y }, ...straightLine(dedupe(smooth(s.chain.slice().reverse()).map(toPt)), 8));
        head.push(...slice(se, s.off, chainN[0] === se.a ? 0 : se.len));
      } else {
        head.push({ x: NET.nodes[chainN[0]].x, y: NET.nodes[chainN[0]].y });
      }
      for (let k = 1; k < chainN.length; k++) {
        const e = NET.edges[via[chainN[k]]];
        head.push(...(e.a === chainN[k - 1] ? e.pts : e.pts.slice().reverse()).slice(1));
      }
      head.push(...slice(ce, o.node === ce.a ? 0 : ce.len, c.off).slice(1));
    }
    // narovnat celou část po cestách (hrbolky na křižovatkách pryč), kontrola překážek zůstává
    head = debump(straightLine(despike(dedupe(head)), 8));
    // poslední úsek: z osy cesty „do kolínka“ podél řad hrobů (mezerou mezi řadami/sloupci) k hrobu
    const P0 = head[head.length - 1];
    let leg = straightLine(dedupe([P0, ...smooth(c.chain).map(toPt)]), 8);
    {
      const gridLp = leg[leg.length - 1];
      leg = [...leg, nearestOnRing(g, gridLp)];
      let bestLeg = leg, bestScore = legScore(leg, g);
      for (const cand of elbowLegs(P0, head[Math.max(0, head.length - 2)], g)) {
        const sc = legScore(cand, g);
        if (sc < bestScore) { bestScore = sc; bestLeg = cand; }
      }
      leg = bestLeg;
    }
    const pts = despike(dedupe([...head, ...leg.slice(1)]));
    const lp = leg[leg.length - 2] || leg[0];
    const ed = dist(lp, leg[leg.length - 1]);
    // čistá čára: rovné úseky, zlomy jen v zatáčkách (téměř rovné zlomy sloučit)
    const draw = pts.slice();
    for (let i = 1; i < draw.length - 2;) {
      const t = Math.abs(angDiff(heading(draw[i - 1], draw[i]), heading(draw[i], draw[i + 1])));
      if (t < 0.17 && clearSeg(draw[i - 1], draw[i + 1])) draw.splice(i, 1); else i++;
    }
    let total = 0;
    for (let i = 1; i < pts.length; i++) total += dist(pts[i - 1], pts[i]);

    // --- pokyny: úseky mezi zatáčkami; krátké úseky do 12 m se slučují podle celkové změny směru ---
    const legs = [];
    for (let i = 1; i < head.length; i++) {
      const u = dist(head[i - 1], head[i]);
      if (u < 1) continue;
      const h = heading(head[i - 1], head[i]), last = legs[legs.length - 1];
      if (last && Math.abs(angDiff(last.h1, h)) < 0.7) { last.u += u; last.h1 = h; continue; }
      legs.push({ u, h0: h, h1: h, at: head[i - 1] });
    }
    for (let changed = true; changed;) {
      changed = false;
      for (let i = 1; i < legs.length; i++) {
        if (legs[i].u >= 80) continue;
        if (i === legs.length - 1 && legs[i].u >= 40 && Math.abs(angDiff(legs[i - 1].h1, legs[i].h0)) > 1.0) continue;
        if (i < legs.length - 1) { legs[i + 1].u += legs[i].u; legs[i + 1].at = legs[i].at; legs[i + 1].fromH = legs[i - 1].h1; }
        else legs[i - 1].u += legs[i].u;
        legs.splice(i, 1); changed = true; break;
      }
    }
    const steps = [{ kind: 'start', text: startKey === 'gps' ? 'Vyjděte od místa, kde stojíte' : `Vstupte ${gate.short}` }];
    legs.forEach((l, i) => {
      const m = roundM(meters(l.u));
      const dh = i ? angDiff(l.fromH != null ? l.fromH : legs[i - 1].h1, l.h0) : 0;
      const prevStep = steps[steps.length - 1];
      if (Math.abs(dh) < 0.6) {
        if (prevStep.kind === 'straight') prevStep.m = roundM(prevStep.m + m);
        else steps.push({ kind: 'straight', text: 'Pokračujte rovně', m });
        return;
      }
      const dir = dh > 0 ? 'right' : 'left', side = dir === 'right' ? 'vpravo' : 'vlevo';
      const verb = Math.abs(dh) > 1.0 ? `Odbočte ${side}` : `Držte se ${side}`;
      const ahead = { x: l.at.x + Math.cos(l.h0) * Math.min(80, l.u), y: l.at.y + Math.sin(l.h0) * Math.min(80, l.u) };
      const sec = nearestSection(ahead.x, ahead.y);
      steps.push({ kind: dir, text: sec ? `${verb} k sekci ${sec.id}` : verb, m });
    });
    // zbytečné kroky „rovně 1–2 m“ vynechat
    for (let i = steps.length - 1; i > 0; i--) if (steps[i].kind === 'straight' && steps[i].m < 3) steps.splice(i, 1);
    // odbočka z cesty do uličky mezi hroby
    let legLen = 0;
    for (let i = 1; i < leg.length; i++) legLen += dist(leg[i - 1], leg[i]);
    const hp = head[head.length - 1], hq = head[Math.max(0, head.length - 2)];
    const into = legLen > 25;
    if (into) {
      const q = leg[1] || leg[0];
      const cr = (hp.x - hq.x) * (q.y - hp.y) - (hp.y - hq.y) * (q.x - hp.x);
      steps.push({ kind: cr > 0 ? 'right' : 'left', text: `Odbočte ${cr > 0 ? 'vpravo' : 'vlevo'} mezi hroby`, m: roundM(meters(legLen)) });
    }
    const la = into ? leg[Math.max(0, leg.length - 2)] : hq, lb = into ? leg[leg.length - 1] : hp;
    const cr = (lb.x - la.x) * (g.cy - lb.y) - (lb.y - la.y) * (g.cx - lb.x);
    const sideTxt = into && ed < 12 ? 'přímo před vámi' : cr > 0 ? 'po vaší pravé straně' : 'po vaší levé straně';
    steps.push({ kind: 'finish', text: `Hrob ${g.num} v sekci ${g.sec} je ${sideTxt}` });
    const m = roundM(meters(total));
    return { ok: true, gate: startKey, u: best.tot, pts, draw, head, leg, steps, m, min: Math.max(1, Math.round(m / 70)) };
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
    _grid: () => { if (!cost) buildGrid(); prepNet(); return { cost, solid, GW, GH, R, nearestWalkable, astar, NET, GATE_NODE }; }
  };
})();
