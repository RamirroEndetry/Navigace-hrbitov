/* Tichá cesta — mapa hřbitova: dlaždicový podklad (canvas), SVG pro značky a trasu, posun, zoom, pinch, otáčení.
   Světové jednotky = decimetry (viz data/vitkovice.js).

   Jak je to postavené (kvůli plynulosti i na slabých zařízeních):
   1. Podklad (plochy, cesty, zdi, hroby, stromy) se kreslí do bitmapových dlaždic 256 px po úrovních zoomu,
      stejně jako u webových map. Každá dlaždice vzniká jen z geometrie, která do ní spadá (prostorový index),
      kreslí se po částech s pevným rozpočtem času na snímek a hotová se uloží do paměti.
   2. Posun, zoom i otáčení jen mění CSS transformaci vrstvy s dlaždicemi (skládá ji GPU) – nic se nepřekresluje.
      Chybějící dlaždice se dokreslují průběžně; než jsou hotové, prosvítá hrubá základní úroveň.
   3. Značky, popisky, čísla hrobů, trasa, špendlík a zvýraznění jsou v lehkých SVG vrstvách nad dlaždicemi;
      jejich animace překreslují jen pár tvarů. */
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, parent) => {
    const e = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const RAD = Math.PI / 180;
  const norm360 = (a) => ((a % 360) + 360) % 360;
  const ringD = (r) => { let s = 'M' + r[0] + ' ' + r[1]; for (let i = 2; i < r.length; i += 2) s += 'L' + r[i] + ' ' + r[i + 1]; return s + 'Z'; };
  const polyD = (polys) => polys.map((p) => p.map(ringD).join('')).join('');
  const lineD = (l) => { let s = 'M' + l[0] + ' ' + l[1]; for (let i = 2; i < l.length; i += 2) s += 'L' + l[i] + ' ' + l[i + 1]; return s; };

  // lomená čára se zaoblenými kolínky (poloměr do r, max. polovina kratšího úseku)
  const roundedD = (pts, r) => {
    if (pts.length < 3) return 'M' + pts.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('L');
    let d = `M${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const p = pts[i - 1], q = pts[i], n = pts[i + 1];
      const l1 = Math.hypot(q.x - p.x, q.y - p.y), l2 = Math.hypot(n.x - q.x, n.y - q.y);
      const rr = Math.min(r, l1 / 2, l2 / 2);
      const ax = q.x + (p.x - q.x) * rr / (l1 || 1), ay = q.y + (p.y - q.y) * rr / (l1 || 1);
      const bx = q.x + (n.x - q.x) * rr / (l2 || 1), by = q.y + (n.y - q.y) * rr / (l2 || 1);
      d += `L${ax.toFixed(1)} ${ay.toFixed(1)}Q${q.x.toFixed(1)} ${q.y.toFixed(1)} ${bx.toFixed(1)} ${by.toFixed(1)}`;
    }
    const e = pts[pts.length - 1];
    return d + `L${e.x.toFixed(1)} ${e.y.toFixed(1)}`;
  };

  const ICONS = {
    water: '<path d="M12 4.5c3 3.9 5 6.5 5 8.9a5 5 0 0 1-10 0c0-2.4 2-5 5-8.9z"/>',
    bin: '<path d="M8.2 9h7.6l-.8 9.5H9zM7 6.6h10v1.6H7zM10 5h4v1.6h-4z"/>',
    bench: '<path d="M5 9.5h14v2.2H5zM5.5 13h13v1.7h-13zM7 14.7h1.7V18H7zM15.3 14.7H17V18h-1.7z"/>',
    cross: '<path d="M11 4h2v3.6h3.6v2H13V20h-2V9.6H7.4v-2H11z"/>',
    memorial: '<path d="M10.4 4.5h3.2v3h-3.2zM9.2 8.2h5.6v8.6H9.2zM7 17.4h10V19H7z"/>',
    fountain: '<path d="M12 4c2 2.5 3 4.2 3 5.6a3 3 0 0 1-6 0C9 8.2 10 6.5 12 4zM5 14h14v2a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z"/>',
    pano: '<path fill-rule="evenodd" d="M6.8 8.6h2.3l1.2-1.8h3.4l1.2 1.8h2.3a1 1 0 0 1 1 1v6.6a1 1 0 0 1-1 1H6.8a1 1 0 0 1-1-1V9.6a1 1 0 0 1 1-1zM12 10.4a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2z"/>'
  };
  const POI_COLOR = { water: '#3F7F9A', bin: '#7A7F76', bench: '#9A7F57', cross: '#2D4A3D', memorial: '#5C584F', fountain: '#3F7F9A', pano: '#B06F35' };
  const POI_LAYER = { water: 'water', fountain: 'water', bin: 'bin', bench: 'bench', cross: 'service', memorial: 'service', pano: 'pano' };
  const POI_R = { water: 10, fountain: 10, cross: 9, memorial: 8, bin: 7, bench: 7, pano: 11 };
  const GRAVE_FILL = { hrob: 'gr', dvojhrob: 'gr2', trojhrob: 'gr2', vicehrob: 'gr2', hrobka: 'tomb', urnovy: 'urn', kolumbarium: 'col', vsyp: 'vsyp' };
  // názvy CSS proměnných --m-* použitých při kreslení dlaždic
  const PAL_KEYS = ['ground', 'lawn', 'park', 'halo', 'section', 'section-s', 'section-shadow', 'ditch', 'gravel', 'paved', 'steps', 'path-s',
    'shrub', 'flower', 'tech', 'wall', 'monument', 'building', 'struct-s', 'boundary', 'boundary-hi', 'lwall', 'fence', 'hedge', 'hedge-hi', 'rail',
    'obj-shadow', 'bld-shadow', 'gr-shadow', 'gr', 'gr-s', 'gr2', 'tomb', 'urn', 'col', 'vsyp', 'free', 'tree-shadow', 'tree', 'tree-hi', 'conifer', 'conifer-hi', 'bush'];

  // ---------- Dlaždice ----------
  const T = 256;                       // velikost dlaždice v CSS px
  const K0 = 0.06;                     // měřítko úrovně 0 (px na dm); každá další úroveň je √2×
  const ZMAX = 15;
  const zOf = (k) => clamp(Math.round(2 * Math.log2(k / K0)), 0, ZMAX);
  const kOf = (z) => K0 * Math.pow(2, z / 2);
  const CELL = 256;                    // buňka prostorového indexu (dm)
  const TILE_BUDGET_MB = 56;           // horní mez paměti dlaždic

  // prostorový index: mřížka buněk → položky s obálkou
  // razítko proti duplicitám je společné všem indexům: tatáž položka (hrob, strom, budova) bývá ve více vrstvách
  let STAMP = 0;
  class Index {
    constructor() { this.cells = new Map(); }
    add(it) {
      for (let cy = Math.floor(it.y0 / CELL); cy <= Math.floor(it.y1 / CELL); cy++)
        for (let cx = Math.floor(it.x0 / CELL); cx <= Math.floor(it.x1 / CELL); cx++) {
          const k = cx * 1000 + cy; let c = this.cells.get(k); if (!c) this.cells.set(k, c = []); c.push(it);
        }
    }
    query(x0, y0, x1, y1) {
      const s = ++STAMP, out = [];
      for (let cy = Math.floor(y0 / CELL); cy <= Math.floor(y1 / CELL); cy++)
        for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) {
          const c = this.cells.get(cx * 1000 + cy); if (!c) continue;
          for (const it of c) if (it._s !== s && it.x1 >= x0 && it.x0 <= x1 && it.y1 >= y0 && it.y0 <= y1) { it._s = s; out.push(it); }
        }
      return out;
    }
  }

  class CemeteryMap {
    constructor(container, data, opts) {
      this.c = container; this.d = data; this.o = opts || {};
      container.cemeteryMap = this; // pro ladění v konzoli
      // živý pohled (co uživatel vidí) a pohled, ve kterém jsou SVG vrstvy naposledy skutečně vykreslené
      this.k = 1; this.x = 0; this.y = 0; this.r = 0; this.fitK = 1;
      this.cv = { x: 0, y: 0, k: 1, r: 0 };
      this.m = 0;
      this.scaled = [];
      // vrstvy: dlaždice (podklad) → hlavní SVG (POI, popisky, čísla; chytá ukazatel) → překryvné SVG (trasa, značky)
      this.tilesEl = document.createElement('div'); this.tilesEl.className = 'map-tiles'; container.appendChild(this.tilesEl);
      this.svg = el('svg', { class: 'map-svg', role: 'application', 'aria-label': 'Interaktivní mapa hřbitova' }, container);
      this.ov = el('svg', { class: 'map-svg map-ov', 'aria-hidden': 'true' }, container);
      this.layout();
      this.prepare();
      this.build();
      this.bind();
      this.initTiles();
      this.fit(false);
      let lastW = container.clientWidth, lastH = container.clientHeight;
      new ResizeObserver(() => {
        const cw = container.clientWidth, ch = container.clientHeight;
        if (cw === lastW && ch === lastH) return;
        this.layout();
        if (Math.abs(cw - lastW) > 40 && !this._touched) this.fit(false); else this.apply(true);
        lastW = cw; lastH = ch;
      }).observe(container);
      // změna vzhledu (denní/noční, styl mapy, úsporný režim) → dlaždice nakreslit znovu
      new MutationObserver(() => { const s = this.styleKey(); if (s !== this._styleKey) this.restyle(); })
        .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-mapstyle', 'class'] });
    }

    // SVG vrstvy jsou o okraj větší než výřez, aby při posunu či otočení nebyl hned vidět nevykreslený kraj
    layout() {
      const cw = this.c.clientWidth, ch = this.c.clientHeight;
      this.m = Math.round(Math.min(cw, ch) * 0.2);
      for (const s of [this.svg.style, this.ov.style]) {
        s.left = s.top = -this.m + 'px';
        s.width = cw + 2 * this.m + 'px'; s.height = ch + 2 * this.m + 'px';
        s.transformOrigin = `${this.m}px ${this.m}px`;
      }
    }

    // ---------- Příprava geometrie pro dlaždice ----------
    prepare() {
      const d = this.d, V = d.V, A = V.areas;
      const bbox = (flat, it) => { for (let i = 0; i < flat.length; i += 2) { const x = flat[i], y = flat[i + 1]; if (x < it.x0) it.x0 = x; if (x > it.x1) it.x1 = x; if (y < it.y0) it.y0 = y; if (y > it.y1) it.y1 = y; } return it; };
      const item = () => ({ x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
      const polyItem = (p) => { const it = item(); for (const r of p) bbox(r, it); it.p = new Path2D(polyD([p])); return it; };
      const lineItem = (l) => { const it = bbox(l, item()); it.p = new Path2D(lineD(l)); return it; };
      const NO_DASH = [];
      const L = this.layers = [];
      const layer = (items, draw, begin, end) => { const idx = new Index(); for (const it of items) idx.add(it); L.push({ idx, draw, begin, end }); };
      const polys = (list) => (list || []).map(polyItem);
      const lines = (list) => (list || []).map(lineItem);
      const fill = (col) => (c, it, P) => { c.fillStyle = P[col]; c.fill(it.p, 'evenodd'); };
      const fillStroke = (col, scol, w) => (c, it, P) => { c.fillStyle = P[col]; c.fill(it.p, 'evenodd'); c.strokeStyle = P[scol]; c.lineWidth = w; c.setLineDash(NO_DASH); c.stroke(it.p); };
      const stroke = (col, w, cap, dash) => (c, it, P) => { c.strokeStyle = P[col]; c.lineWidth = w; c.lineCap = cap || 'butt'; c.lineJoin = 'round'; c.setLineDash(dash || []); c.stroke(it.p); };
      const shadow = (col, dx, dy, lite) => [(c, it, P) => { c.fillStyle = P[col]; c.fill(it.p, 'evenodd'); },
        (c, P, lod, M) => { if (lite && M.lite) return false; c.save(); c.translate(dx, dy); }, (c) => c.restore()];

      const bnd = polys(V.boundary.map((p) => p));
      // areál a trávníky
      layer(bnd, stroke('halo', 40, 'round'), (c, P, lod, M) => !M.lite);
      layer(bnd, fill('ground'));
      layer(polys(A.lawn), fill('lawn'));
      layer(polys(A.park), fill('park'));
      // sekce jako mírně vyvýšené záhony se stínem
      const secItems = d.sections.map((s) => { const it = item(); for (const p of s.area) for (const r of p) bbox(r, it); it.p = new Path2D(polyD(s.area)); return it; });
      layer(secItems, ...shadow('section-shadow', 2.5, 3.5, true));
      layer(secItems, fillStroke('section', 'section-s', 1.6));
      layer(polys(A.ditch), fill('ditch'));
      layer(polys(A.gravel), fillStroke('gravel', 'path-s', 1.4));
      layer(polys(A.paved), fillStroke('paved', 'path-s', 1.8));
      layer(polys(A.steps), fillStroke('steps', 'path-s', 1));
      layer(polys(A.shrub), fill('shrub'));
      layer(polys(A.flower), fill('flower'));
      layer(polys(A.tech), fill('tech'));
      // linie
      layer(lines(V.lines.wall), stroke('lwall', 4, 'round'));
      layer(lines(V.lines.fence), stroke('fence', 1.5, 'butt', [6, 4]));
      const hedges = lines(V.lines.hedge);
      layer(hedges, stroke('hedge', 7, 'round'));
      layer(hedges, stroke('hedge-hi', 2.5, 'round'));
      layer(lines(V.lines.rail), stroke('rail', 1.5));
      // zeď: dvojitá linka
      layer(bnd, stroke('boundary', 7, 'butt'));
      layer(bnd, stroke('boundary-hi', 1.6, 'butt'));
      layer(polys(A.wall), fill('wall'));
      const mon = polys(A.monument), bld = polys(A.building);
      layer(mon, ...shadow('obj-shadow', 1, 1.5, true));
      layer(mon, fillStroke('monument', 'struct-s', 0.6));
      layer(bld, ...shadow('bld-shadow', 7, 9, true));
      layer(bld, fillStroke('building', 'struct-s', 2.2));
      // hroby: kamenné desky se stínem; daleko bez obrysu, velmi daleko bez stínu
      const graves = d.graves.map((g) => ({ x0: g.x0, y0: g.y0, x1: g.x1, y1: g.y1, p: new Path2D(ringD(g.ring)), f: g.status === 'volne' ? 'free' : GRAVE_FILL[g.type] || 'gr' }));
      layer(graves.filter((g) => g.f !== 'free'), (c, it) => c.fill(it.p),
        (c, P, lod, M) => { if (M.lite || lod.rel < 1) return false; c.save(); c.translate(1.3, 1.8); c.fillStyle = P['gr-shadow']; if (lod.far) c.globalAlpha = 0.55; }, (c) => c.restore());
      layer(graves, (c, it, P, lod) => {
        c.fillStyle = P[it.f]; c.fill(it.p);
        if (it.f === 'free') { c.strokeStyle = P.freeLine; c.lineWidth = 0.8; c.setLineDash([3, 2]); c.stroke(it.p); c.setLineDash([]); }
        else if (!lod.far) { c.strokeStyle = P['gr-s']; c.lineWidth = 0.35; c.stroke(it.p); }
      });
      // stromy: stín, koruna, odlesk
      const circ = (x, y, r) => { const p = new Path2D(); p.arc(x, y, r, 0, Math.PI * 2); return p; };
      const trees = d.trees.map((t) => {
        const r = t.t === 'bush' ? 9 : t.t === 'conifer' ? 18 : 24;
        const it = { x0: t.x - r - 6, y0: t.y - r - 6, x1: t.x + r + 8, y1: t.y + r + 10, t: t.t, p: circ(t.x, t.y, r) };
        if (t.t !== 'bush') { it.sh = circ(t.x + 6, t.y + 8, r * 1.02); it.hi = circ(t.x - r * 0.28, t.y - r * 0.3, +(r * 0.56).toFixed(1)); }
        return it;
      });
      const crowns = trees.filter((t) => t.t !== 'bush');
      const treesOn = (c, P, lod, M) => !M.hideTrees;
      layer(crowns, (c, it) => c.fill(it.sh), (c, P, lod, M) => { if (M.hideTrees || M.lite) return false; c.save(); c.fillStyle = P['tree-shadow']; if (lod.near) c.globalAlpha = 0.3; }, (c) => c.restore());
      layer(trees.filter((t) => t.t === 'bush'), (c, it, P) => { c.fillStyle = P.bush; c.fill(it.p); }, treesOn);
      layer(crowns, (c, it, P) => { c.fillStyle = it.t === 'conifer' ? P.conifer : P.tree; c.fill(it.p); },
        (c, P, lod, M) => { if (M.hideTrees) return false; c.save(); c.globalAlpha = lod.near ? 0.3 : lod.mid ? 0.72 : 1; }, (c) => c.restore());
      layer(crowns, (c, it, P) => { c.fillStyle = it.t === 'conifer' ? P['conifer-hi'] : P['tree-hi']; c.fill(it.hi); },
        (c, P, lod, M) => { if (M.hideTrees || M.lite) return false; c.save(); c.globalAlpha = lod.near ? 0.25 : lod.mid ? 0.6 : 0.9; }, (c) => c.restore());
    }

    // ---------- SVG vrstvy: POI, popisky, brány, čísla, trasa, značky ----------
    build() {
      const d = this.d, svg = this.svg;
      const defs = el('defs', null, svg);
      defs.innerHTML = `
        ${Object.entries(ICONS).map(([k, v]) => `<symbol id="i-${k}" viewBox="0 0 24 24">${v}</symbol>`).join('')}`;
      this.root = el('g', { class: 'root' }, svg);
      this.ovRoot = el('g', { class: 'root' }, this.ov);
      const R = this.root, O = this.ovRoot;

      // ztlumení mapy při zvýraznění výsledků hledání
      el('rect', { class: 'dim', x: -2000, y: -2000, width: d.W + 4000, height: d.H + 4000 }, O);
      // zvýraznění hrobů se mění při hledání a najetí myší → překryvná vrstva
      this.hitPath = el('path', { class: 'gr-hit', d: '' }, O);
      this.hoverPath = el('path', { class: 'gr-hover', d: '' }, O);
      this.selPath = el('path', { class: 'gr-sel', d: '' }, O);
      this.numG = el('g', { class: 'nums' }, R);
      // trasa (animace vykreslení, pohyb šipek, pulz cíle) → překryvná vrstva
      this.routeG = el('g', { class: 'route' }, O);
      // POI
      this.poiG = el('g', { class: 'pois' }, R);
      d.pois.forEach((p, i) => {
        const g = this.marker(p.x, p.y, this.poiG);
        g.classList.add('poi', 'layer-' + POI_LAYER[p.t], 'poi-' + p.t);
        g.dataset.poi = i;
        const r = POI_R[p.t];
        el('circle', { r, fill: POI_COLOR[p.t], class: 'poi-dot' }, g);
        el('use', { href: '#i-' + p.t, x: -r * 0.8, y: -r * 0.8, width: r * 1.6, height: r * 1.6, fill: '#fff' }, g);
        const tt = el('title', null, g); tt.textContent = p.label;
      });
      // popisky sekcí: štítky s patkovým písmem a stínem
      this.secG = el('g', { class: 'sec-labels' }, R);
      for (const s of d.sections) {
        const g = this.marker(s.lx, s.ly, this.secG);
        g.classList.add('sec-label'); g.dataset.sec = s.id;
        if (s.n < 100) g.classList.add('small');
        const w = 16 + s.id.length * 7.4;
        el('rect', { x: -w / 2, y: -10, width: w, height: 22, rx: 7, class: 'sec-pill-shadow' }, g);
        el('rect', { x: -w / 2, y: -12, width: w, height: 22, rx: 7, class: 'sec-pill' }, g);
        const t = el('text', { y: 3.6, class: 'sec-t' }, g); t.textContent = s.id;
      }
      // vchody: výrazná značka s ikonou brány a štítkem
      const GT = el('g', { class: 'gates' }, R);
      for (const [key, gt] of Object.entries(d.GATES)) {
        const g = this.marker(gt.x, gt.y, GT);
        g.classList.add('gate-marker', 'gate-' + key);
        el('circle', { r: 14, cy: 2, class: 'gate-shadow' }, g);
        el('circle', { r: 13, class: 'gate-dot' }, g);
        el('path', { d: 'M-6 6V-1a6 6 0 0 1 12 0v7M0 6V0', class: 'gate-ico' }, g);
        const right = key !== 'east';
        const lbl = gt.label.toUpperCase(), w = 18 + lbl.length * 7.1;
        const x0 = right ? 18 : -18 - w;
        el('rect', { x: x0, y: -11, width: w, height: 22, rx: 11, class: 'gate-pill' }, g);
        const t = el('text', { class: 'gate-t', x: x0 + w / 2, y: 4 }, g);
        t.textContent = lbl;
      }
      // špendlík, svíčky, poloha, tečky výsledků (animované) → překryvná vrstva
      this.markG = el('g', { class: 'marks' }, O);
    }

    marker(x, y, parent) {
      const g = el('g', { 'data-x': x, 'data-y': y }, parent);
      this.scaled.push(g);
      this._mDirty = true;
      return g;
    }
    unmark(sel) {
      this.markG.querySelectorAll(sel).forEach((n) => { this.scaled = this.scaled.filter((s) => s !== n); n.remove(); });
    }

    // ---------- Dlaždice: správa a kreslení ----------
    initTiles() {
      this.tiles = new Map();      // key → { c, z, tx, ty, used, bytes }
      this.jobs = new Map();       // key → rozpracovaná dlaždice
      this.queue = [];             // klíče k vykreslení v pořadí priority
      this.levels = new Map();     // z → div
      this.bytes = 0; this.tick = 0;
      this.hideTrees = false;
      this.restyle();
    }
    styleKey() {
      const h = document.documentElement;
      return `${h.dataset.theme}|${h.dataset.mapstyle}|${h.classList.contains('lite')}|${this.hideTrees}`;
    }
    // barvy z CSS proměnných, zahození hotových dlaždic a nové vykreslení
    restyle() {
      this._styleKey = this.styleKey();
      const cs = getComputedStyle(document.documentElement);
      const P = this.pal = {};
      for (const k of PAL_KEYS) P[k] = cs.getPropertyValue('--m-' + k).trim() || '#f0f';
      P.freeLine = cs.getPropertyValue('--free').trim() || '#4F8C83';
      this.lite = document.documentElement.classList.contains('lite');
      this.dpr = Math.min(window.devicePixelRatio || 1, this.lite ? 1.5 : 2);
      for (const t of this.tiles.values()) t.c.remove();
      this.tiles.clear(); this.jobs.clear(); this.queue = []; this.bytes = 0;
      for (const dv of this.levels.values()) dv.remove();
      this.levels.clear();
      if (this.fitK !== 1) this.updateTiles(1);
    }
    lodFor(kz) { const rel = kz / this.fitK; return { rel, far: rel < 1.6, mid: rel > 2.2, near: rel > 5 }; }
    levelEl(z) {
      let dv = this.levels.get(z);
      if (!dv) {
        dv = document.createElement('div');
        dv.style.transform = `scale(${(1 / kOf(z)).toFixed(6)})`;
        dv.dataset.z = z;
        // základní úroveň vždy dole, ostatní nad ní v pořadí vzniku
        if (z === this.zBase) this.tilesEl.prepend(dv); else this.tilesEl.appendChild(dv);
        this.levels.set(z, dv);
      }
      return dv;
    }
    // světová obálka výřezu (i při otočení)
    viewBox(margin) {
      const W = this.c.clientWidth, H = this.c.clientHeight, m = margin || 0;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [px, py] of [[-m, -m], [W + m, -m], [-m, H + m], [W + m, H + m]]) {
        const w = this.worldPt(px, py);
        x0 = Math.min(x0, w.x); y0 = Math.min(y0, w.y); x1 = Math.max(x1, w.x); y1 = Math.max(y1, w.y);
      }
      return { x0, y0, x1, y1 };
    }
    tileRange(z, b) {
      const kz = kOf(z), nx = Math.ceil(this.d.W * kz / T), ny = Math.ceil(this.d.H * kz / T);
      return {
        tx0: clamp(Math.floor(b.x0 * kz / T), 0, nx - 1), tx1: clamp(Math.floor(b.x1 * kz / T), 0, nx - 1),
        ty0: clamp(Math.floor(b.y0 * kz / T), 0, ny - 1), ty1: clamp(Math.floor(b.y1 * kz / T), 0, ny - 1)
      };
    }
    // které dlaždice jsou pro aktuální pohled potřeba; chybějící zařadit do fronty podle vzdálenosti od středu
    updateTiles(ring) {
      const z = zOf(this.k), kz = kOf(z);
      this.z = z;
      const need = [], tick = ++this.tick;
      const vc = this.viewCenter(), wc = this.worldPt(vc.x, vc.y);
      const push = (zz, rg, pri) => {
        const kk = kOf(zz);
        for (let ty = rg.ty0; ty <= rg.ty1; ty++) for (let tx = rg.tx0; tx <= rg.tx1; tx++) {
          const key = zz + '/' + tx + '/' + ty;
          const t = this.tiles.get(key);
          if (t) { t.used = tick; continue; }
          const cx = (tx + 0.5) * T / kk, cy = (ty + 0.5) * T / kk;
          need.push({ key, z: zz, tx, ty, pri: pri + Math.hypot(cx - wc.x, cy - wc.y) });
        }
      };
      const b = this.viewBox(0);
      push(z, this.tileRange(z, b), 0);
      const missing = need.length;
      // základní úroveň (celý hřbitov, pár dlaždic) – prosvítá, kde ještě chybí ostrá dlaždice
      if (this.zBase != null && this.zBase !== z) push(this.zBase, this.tileRange(this.zBase, { x0: 0, y0: 0, x1: this.d.W, y1: this.d.H }), 1e6);
      // v klidu dopředu okolní prstenec
      if (ring) push(z, this.tileRange(z, this.viewBox(T * ring)), 2e6);
      need.sort((a, b2) => a.pri - b2.pri);
      this.queue = need;
      this.needTick = tick;
      if (!missing) this.pruneLevels(z);
      if (need.length && !this._tileRaf) this._tileRaf = requestAnimationFrame((now) => this.renderLoop(now));
    }
    // po dokončení úrovně zahodit ostatní (kromě základní)
    pruneLevels(z) {
      for (const [lz, dv] of [...this.levels]) {
        if (lz === z || lz === this.zBase) continue;
        for (const [key, t] of [...this.tiles]) if (t.z === lz) { this.bytes -= t.bytes; this.tiles.delete(key); }
        dv.remove(); this.levels.delete(lz);
      }
      this.evict();
    }
    evict() {
      if (this.bytes <= TILE_BUDGET_MB * 1048576) return;
      const cand = [...this.tiles.entries()].filter(([, t]) => t.used !== this.needTick && t.z !== this.zBase).sort((a, b) => a[1].used - b[1].used);
      for (const [key, t] of cand) {
        if (this.bytes <= TILE_BUDGET_MB * 0.8 * 1048576) break;
        t.c.remove(); this.bytes -= t.bytes; this.tiles.delete(key);
      }
    }
    startJob(n) {
      const kz = kOf(n.z), dpr = this.dpr, S = Math.ceil((T + 1) * dpr);
      const c = document.createElement('canvas');
      c.width = c.height = S;
      c.style.cssText = `left:${n.tx * T}px;top:${n.ty * T}px;width:${T + 1}px;height:${T + 1}px`;
      const ctx = c.getContext('2d', { alpha: true });
      ctx.setTransform(kz * dpr, 0, 0, kz * dpr, -n.tx * T * dpr, -n.ty * T * dpr);
      const q = 26; // okraj pro tahy a stíny přesahující z vedlejší dlaždice
      const w0 = n.tx * T / kz, h0 = n.ty * T / kz, w1 = (n.tx + 1) * T / kz + 1 / kz, h1 = (n.ty + 1) * T / kz + 1 / kz;
      return { key: n.key, z: n.z, tx: n.tx, ty: n.ty, c, ctx, li: 0, ii: 0, items: null, lod: this.lodFor(kz), box: [w0 - q, h0 - q, w1 + q, h1 + q], bytes: S * S * 4 };
    }
    // kreslení s rozpočtem času: pokračuje tam, kde minulý snímek skončil
    work(job, deadline) {
      const ctx = job.ctx, P = this.pal, M = this;
      while (job.li < this.layers.length) {
        const L = this.layers[job.li];
        if (!job.items) {
          if (L.begin && L.begin(ctx, P, job.lod, M) === false) { job.li++; continue; }
          job.items = L.idx.query(job.box[0], job.box[1], job.box[2], job.box[3]); job.ii = 0;
        }
        const items = job.items;
        while (job.ii < items.length) {
          L.draw(ctx, items[job.ii++], P, job.lod);
          if ((job.ii & 15) === 0 && performance.now() > deadline) return false;
        }
        if (L.end) L.end(ctx);
        job.items = null; job.li++;
      }
      return true;
    }
    renderLoop(now) {
      this._tileRaf = null;
      const moving = document.documentElement.classList.contains('map-moving');
      const deadline = now + (moving ? 4 : 8);
      while (this.queue.length && performance.now() < deadline) {
        const n = this.queue[0];
        if (this.tiles.has(n.key)) { this.queue.shift(); continue; }
        let job = this.jobs.get(n.key);
        if (!job) { job = this.startJob(n); this.jobs.set(n.key, job); }
        if (!this.work(job, deadline)) break;
        this.jobs.delete(n.key); this.queue.shift();
        this.levelEl(job.z).appendChild(job.c);
        this.tiles.set(job.key, { c: job.c, z: job.z, tx: job.tx, ty: job.ty, used: this.needTick, bytes: job.bytes });
        this.bytes += job.bytes;
      }
      // rozpracované dlaždice, které už nejsou potřeba, zahodit
      if (this.jobs.size > 4) { const keep = new Set(this.queue.map((n) => n.key)); for (const k of [...this.jobs.keys()]) if (!keep.has(k)) this.jobs.delete(k); }
      if (this.queue.length) this._tileRaf = requestAnimationFrame((t) => this.renderLoop(t));
      else { this.pruneLevels(this.z); }
    }

    // ---------- Geometrie pohledu ----------
    // obrazovka = T + R(r) · k · svět
    worldPt(px, py) {
      const a = -this.r * RAD, cos = Math.cos(a), sin = Math.sin(a);
      const dx = px - this.x, dy = py - this.y;
      return { x: (dx * cos - dy * sin) / this.k, y: (dx * sin + dy * cos) / this.k };
    }
    world(e) { const r = this.c.getBoundingClientRect(); return this.worldPt(e.clientX - r.left, e.clientY - r.top); }
    insets() { return (this.o.insets && this.o.insets()) || { left: 0, top: 0, right: 0, bottom: 0 }; }
    // střed části výřezu, kterou nezakrývají panely
    viewCenter() {
      const i = this.insets();
      return { x: i.left + (this.c.clientWidth - i.left - i.right) / 2, y: i.top + (this.c.clientHeight - i.top - i.bottom) / 2 };
    }
    // posun, při kterém světový bod (cx,cy) leží na obrazovce v (vx,vy)
    originFor(k, r, cx, cy, vx, vy) {
      const a = r * RAD, cos = Math.cos(a), sin = Math.sin(a);
      return { x: vx - k * (cx * cos - cy * sin), y: vy - k * (cx * sin + cy * cos) };
    }

    // ---------- Interakce ----------
    bind() {
      const svg = this.svg;
      const pts = new Map();
      let pinch = null, moved = 0, rot = null;
      const ang = (a, b) => Math.atan2(b.y - a.y, b.x - a.x) / RAD;
      const suppress = () => { this._suppress = true; setTimeout(() => (this._suppress = false), 30); };
      svg.addEventListener('contextmenu', (e) => e.preventDefault());
      svg.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 2) return;
        this._touched = true; this.stopAnim(); moved = 0;
        // myš: pravé tlačítko nebo Ctrl/Shift + tažení otáčí mapu kolem středu výřezu
        if (e.pointerType === 'mouse' && (e.button === 2 || e.ctrlKey || e.shiftKey)) {
          rot = { id: e.pointerId, x: e.clientX }; svg.classList.add('rotating'); return;
        }
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: this.k, a: ang(a, b), acc: 0, on: false }; }
        svg.classList.add('dragging');
      });
      window.addEventListener('pointermove', (e) => {
        if (rot && e.pointerId === rot.id) {
          const c = this.viewCenter();
          this.rotateAt((e.clientX - rot.x) * 0.4, c.x, c.y);
          rot.x = e.clientX; moved += 10;
          this.queue_();
          return;
        }
        const p = pts.get(e.pointerId);
        if (!p) {
          if (e.pointerType === 'mouse' && e.target.closest && e.target.closest('.map-svg')) this.hover(e);
          return;
        }
        const dx = e.clientX - p.x, dy = e.clientY - p.y;
        if (pts.size === 1) {
          this.x += dx; this.y += dy; moved += Math.abs(dx) + Math.abs(dy);
          p.x = e.clientX; p.y = e.clientY;
          this.queue_();
        } else if (pts.size === 2 && pinch) {
          const old = [...pts.values()];
          const oc = { x: (old[0].x + old[1].x) / 2, y: (old[0].y + old[1].y) / 2 };
          p.x = e.clientX; p.y = e.clientY;
          const [a, b] = [...pts.values()];
          const nc = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          const r = this.c.getBoundingClientRect();
          const px = nc.x - r.left, py = nc.y - r.top;
          this.x += nc.x - oc.x; this.y += nc.y - oc.y;
          this.zoomAt(pinch.k * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d / this.k, px, py);
          // otočení dvěma prsty začne až po malém prahu, aby se mapa při běžném zoomu nekroutila
          const na = ang(a, b);
          let da = na - pinch.a; if (da > 180) da -= 360; if (da < -180) da += 360;
          pinch.a = na;
          if (pinch.on) this.rotateAt(da, px, py);
          else { pinch.acc += da; if (Math.abs(pinch.acc) > 10) pinch.on = true; }
          moved += 10;
          this.queue_();
        }
      });
      const up = (e) => {
        if (rot && e.pointerId === rot.id) { rot = null; svg.classList.remove('rotating'); if (moved > 6) suppress(); return; }
        if (!pts.has(e.pointerId)) return;
        pts.delete(e.pointerId);
        if (pts.size < 2) pinch = null;
        if (!pts.size) svg.classList.remove('dragging');
        if (moved > 6) suppress();
      };
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
      svg.addEventListener('pointerleave', () => { this.hoverPath.setAttribute('d', ''); this.o.onHover && this.o.onHover(null); });
      svg.addEventListener('wheel', (e) => {
        e.preventDefault();
        this._touched = true; this.stopAnim();
        const r = this.c.getBoundingClientRect();
        this.zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)), e.clientX - r.left, e.clientY - r.top);
        this.queue_();
      }, { passive: false });
      svg.addEventListener('dblclick', (e) => { const r = this.c.getBoundingClientRect(); this.animateZoom(2, e.clientX - r.left, e.clientY - r.top); });
      svg.addEventListener('click', (e) => {
        if (this._suppress) return;
        const poi = e.target.closest && e.target.closest('.poi');
        if (poi && this.o.onPoi) return this.o.onPoi(this.d.pois[+poi.dataset.poi]);
        const lab = e.target.closest && e.target.closest('.sec-label');
        if (lab) return this.focusSection(lab.dataset.sec);
        const w = this.world(e);
        const r = this.c.getBoundingClientRect();
        if (this.k < this.fitK * 2.6) {
          const g0 = this.d.graveAt(w.x, w.y, 6);
          if (g0 || this.k < this.fitK * 1.5) return this.animateZoom(this.k < this.fitK * 1.5 ? 3 : 2, e.clientX - r.left, e.clientY - r.top);
        }
        const g = this.d.graveAt(w.x, w.y, 10 / this.k + 2);
        if (g && this.o.onGrave) this.o.onGrave(g);
      });
    }

    hover(e) {
      const w = this.world(e);
      const g = this.k >= this.fitK * 1.4 ? this.d.graveAt(w.x, w.y, 2) : null;
      if (g !== this._hov) {
        this._hov = g;
        this.hoverPath.setAttribute('d', g ? ringD(g.ring) : '');
        this.svg.style.cursor = g ? 'pointer' : '';
      }
      this.o.onHover && this.o.onHover(g, e);
    }

    focusSection(id) {
      const s = this.d.secById[id];
      if (!s) return;
      this.flyTo({ x: s.x0 - 40, y: s.y0 - 40, w: s.x1 - s.x0 + 80, h: s.y1 - s.y0 + 80 });
      this.o.onSection && this.o.onSection(s);
    }

    // zoom kolem bodu obrazovky (nezávislý na otočení)
    zoomAt(f, px, py) {
      const k = clamp(this.k * f, this.fitK * 0.6, this.fitK * 40);
      this.x = px - (px - this.x) * (k / this.k);
      this.y = py - (py - this.y) * (k / this.k);
      this.k = k;
    }

    // otočení o dr stupňů kolem bodu obrazovky
    rotateAt(dr, px, py) {
      const a = dr * RAD, cos = Math.cos(a), sin = Math.sin(a);
      const dx = this.x - px, dy = this.y - py;
      this.x = px + dx * cos - dy * sin;
      this.y = py + dx * sin + dy * cos;
      this.r = norm360(this.r + dr);
    }

    animateZoom(f, px, py) {
      if (px == null) { const c = this.viewCenter(); px = c.x; py = c.y; }
      const k = clamp(this.k * f, this.fitK * 0.6, this.fitK * 40);
      this.animTo(k, px - (px - this.x) * (k / this.k), py - (py - this.y) * (k / this.k), 340);
    }

    animateRotate(dr) {
      const c = this.viewCenter(), a = dr * RAD, cos = Math.cos(a), sin = Math.sin(a);
      const dx = this.x - c.x, dy = this.y - c.y;
      this.animTo(this.k, c.x + dx * cos - dy * sin, c.y + dx * sin + dy * cos, 420, this.r + dr);
    }
    resetNorth() { let d = -this.r; if (d < -180) d += 360; this.animateRotate(d); }

    // ---------- Vykreslení pohledu ----------
    // události ukazatele se slučují do jednoho snímku
    queue_() {
      if (this._q) return;
      this._q = requestAnimationFrame(() => { this._q = null; this.apply(); });
    }

    apply(force) {
      if (this._q) { cancelAnimationFrame(this._q); this._q = null; }
      // dlaždice: jen transformace vrstvy (GPU), chybějící dlaždice do fronty
      const a = this.r * RAD, cos = Math.cos(a) * this.k, sin = Math.sin(a) * this.k;
      this.tilesEl.style.transform = `matrix(${cos.toFixed(6)},${sin.toFixed(6)},${(-sin).toFixed(6)},${cos.toFixed(6)},${this.x.toFixed(2)},${this.y.toFixed(2)})`;
      this.updateTiles(0);
      // SVG vrstvy: levná CSS transformace, skutečné překreslení až po zastavení
      if (force || this._mDirty || this.needCommit()) this.commit(); else this.cssView();
      // během pohybu: bez rozmazání pozadí panelů; po zastavení se vše doplní
      const html = document.documentElement;
      if (!html.classList.contains('map-moving')) html.classList.add('map-moving');
      clearTimeout(this._idleT);
      this._idleT = setTimeout(() => this.settle(), 140);
      if (this.o.onView && (this.k !== this._vk || this.r !== this._vr)) { this._vk = this.k; this._vr = this.r; this.o.onView(this.k, this.r); }
    }

    settle() {
      // překreslení a nová čísla hrobů ve stejném snímku → jediné vykreslení
      if (this.svg.style.transform) this.commit();
      this.scheduleNums(true);
      document.documentElement.classList.remove('map-moving');
      if (this.route) this.placeChevrons();
      this.updateTiles(1);
    }

    // levná cesta: už vykreslené SVG jen posunout/zvětšit/otočit (GPU)
    cssView() {
      const c = this.cv, s = this.k / c.k, a = (this.r - c.r) * RAD;
      const cos = Math.cos(a) * s, sin = Math.sin(a) * s;
      const ex = this.x - (cos * c.x - sin * c.y), ey = this.y - (sin * c.x + cos * c.y);
      const t = `matrix(${cos.toFixed(5)},${sin.toFixed(5)},${(-sin).toFixed(5)},${cos.toFixed(5)},${ex.toFixed(2)},${ey.toFixed(2)})`;
      this.svg.style.transform = t; this.ov.style.transform = t;
    }

    // je potřeba SVG skutečně překreslit? (velká změna měřítka, nebo by byl vidět nevykreslený kraj)
    needCommit() {
      const c = this.cv, s = this.k / c.k;
      if (s > 1.5 || s < 0.67) return true;
      const a = (this.r - c.r) * RAD;
      const ca = Math.cos(a) * s, sa = Math.sin(a) * s;
      const bx = this.x - (ca * c.x - sa * c.y), by = this.y - (sa * c.x + ca * c.y);
      const ic = Math.cos(a) / s, is = Math.sin(a) / s;
      const W = this.c.clientWidth, H = this.c.clientHeight, tol = this.m + Math.min(W, H) * 0.08;
      for (const [px, py] of [[0, 0], [W, 0], [0, H], [W, H]]) {
        const dx = px - bx, dy = py - by;
        const qx = ic * dx + is * dy, qy = -is * dx + ic * dy;
        if (qx < -tol || qx > W + tol || qy < -tol || qy > H + tol) return true;
      }
      return false;
    }

    // skutečné překreslení SVG vrstev v aktuálním pohledu
    commit() {
      const m = this.m;
      const t = `translate(${(this.x + m).toFixed(2)},${(this.y + m).toFixed(2)}) rotate(${this.r.toFixed(3)}) scale(${this.k.toFixed(5)})`;
      this.root.setAttribute('transform', t); this.ovRoot.setAttribute('transform', t);
      this.svg.style.transform = ''; this.ov.style.transform = '';
      this.cv = { x: this.x, y: this.y, k: this.k, r: this.r };
      // značky (POI, popisky, špendlík) mají stálou velikost a zůstávají vzpřímené
      if (this.k !== this._lastK || this.r !== this._lastR || this._mDirty) {
        this._lastK = this.k; this._lastR = this.r; this._mDirty = false;
        const s = (1 / this.k).toFixed(5), rr = (-this.r).toFixed(2);
        for (const g of this.scaled) g.setAttribute('transform', `translate(${g.dataset.x},${g.dataset.y}) rotate(${rr}) scale(${s})`);
        const rel = this.k / this.fitK;
        for (const sv of [this.svg, this.ov]) {
          sv.classList.toggle('lod-mid', rel > 2.2);
          sv.classList.toggle('lod-near', rel > 5);
          sv.classList.toggle('lod-far', rel < 1.6);
        }
      }
    }

    // čísla hrobů jen ve viditelném výřezu při velkém přiblížení
    scheduleNums(now) {
      if (this._numRaf) { if (!now) return; cancelAnimationFrame(this._numRaf); }
      const run = () => {
        this._numRaf = null;
        if (this.k < 2.2) { if (this.numG.childNodes.length) this.numG.textContent = ''; this._numKey = ''; return; }
        const b = this.viewBox(0);
        const key = [b.x0, b.y0, b.x1, b.y1].map((v) => Math.round(v / 20)).join(',') + '|' + Math.round(this.r);
        if (key === this._numKey) return;
        this._numKey = key;
        const list = this.d.gravesIn(b.x0, b.y0, b.x1, b.y1, 900);
        const rot = this.r ? (-this.r).toFixed(1) : null;
        let html = '';
        for (const g of list) {
          const w = g.x1 - g.x0, h = g.y1 - g.y0;
          const fs = Math.max(2.2, Math.min(4.2, Math.min(w, h) * 0.42));
          const cx = g.cx.toFixed(1), cy = g.cy.toFixed(1);
          html += `<text x="${cx}" y="${(g.cy + fs * 0.36).toFixed(1)}" font-size="${fs.toFixed(1)}"${rot ? ` transform="rotate(${rot} ${cx} ${cy})"` : ''}>${g.num}</text>`;
        }
        this.numG.innerHTML = html;
      };
      if (now) run(); else this._numRaf = requestAnimationFrame(run);
    }

    frame(box, pad, r) {
      const cw = this.c.clientWidth, ch = this.c.clientHeight, i = this.insets();
      pad = pad == null ? 24 : pad;
      if (r == null) r = this.r;
      const aw = Math.max(80, cw - i.left - i.right - pad * 2), ah = Math.max(80, ch - i.top - i.bottom - pad * 2);
      // rozměry otočeného obdélníku
      const a = r * RAD, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
      const bw = box.w * c + box.h * s, bh = box.w * s + box.h * c;
      const k = Math.min(aw / bw, ah / bh);
      const o = this.originFor(k, r, box.x + box.w / 2, box.y + box.h / 2, i.left + pad + aw / 2, i.top + pad + ah / 2);
      return { k, x: o.x, y: o.y };
    }

    fit(animate = true) {
      const box = { x: 120, y: 120, w: this.d.W - 240, h: this.d.H - 240 };
      const fk = this.frame(box, 8, 0).k;
      if (fk !== this.fitK) {
        this.fitK = fk;
        const zb = zOf(fk * 0.6);
        // jiný základ (změna velikosti okna) → dlaždice odpovídají jiným úrovním detailu
        if (zb !== this.zBase) { this.zBase = zb; this.restyle(); }
      }
      const f = this.frame(box, 8);
      if (animate) this.animTo(f.k, f.x, f.y); else { this.k = f.k; this.x = f.x; this.y = f.y; this.apply(true); }
    }

    flyTo(box, maxRel) {
      const f = this.frame(box, 40);
      const k = Math.min(f.k, this.fitK * (maxRel || 12));
      const v = this.viewCenter();
      const o = this.originFor(k, this.r, box.x + box.w / 2, box.y + box.h / 2, v.x, v.y);
      this.animTo(k, o.x, o.y);
    }

    animTo(k, x, y, dur, r) {
      this.stopAnim();
      const k0 = this.k, x0 = this.x, y0 = this.y, r0 = this.r, t0 = performance.now();
      if (r == null) r = r0;
      let dr = r - r0; dr = ((dr + 180) % 360 + 360) % 360 - 180; // nejkratší směr otočení
      dur = dur || 750;
      const finish = () => { this._raf = null; this.k = k; this.x = x; this.y = y; this.r = norm360(r0 + dr); this.apply(true); };
      const step = (now) => {
        const t = Math.min(1, (now - t0) / dur), e = ease(t);
        if (t >= 1) return finish();
        this.k = k0 + (k - k0) * e; this.x = x0 + (x - x0) * e; this.y = y0 + (y - y0) * e; this.r = r0 + dr * e;
        this.apply();
        this._raf = requestAnimationFrame(step);
      };
      this._raf = requestAnimationFrame(step);
      // pojistka: na kartě na pozadí prohlížeč animace pozastaví – dojet rovnou na cíl
      clearTimeout(this._animGuard);
      this._animGuard = setTimeout(() => { if (this._raf) { cancelAnimationFrame(this._raf); finish(); } }, dur + 250);
    }
    stopAnim() { if (this._raf) cancelAnimationFrame(this._raf); this._raf = null; clearTimeout(this._animGuard); }

    // ---------- Stav: výběr, trasa, zvýraznění ----------
    highlight(ids) {
      let dStr = '';
      if (ids) for (const id of ids) { const g = this.d.graveById[id]; if (g) dStr += ringD(g.ring); }
      this.hitPath.setAttribute('d', dStr);
      this.ov.classList.toggle('has-hits', !!dStr);
      this._hits = ids;
      this.unmark('.hit-dot');
      if (ids && ids.size <= 60) {
        for (const id of ids) {
          const g = this.d.graveById[id];
          const m = this.marker(g.cx, g.cy, this.markG);
          m.classList.add('hit-dot');
          m.innerHTML = '<circle r="5"/>';
        }
        this.apply();
      }
    }

    fitTo(ids) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const id of ids) { const g = this.d.graveById[id]; x0 = Math.min(x0, g.x0); y0 = Math.min(y0, g.y0); x1 = Math.max(x1, g.x1); y1 = Math.max(y1, g.y1); }
      if (x0 === Infinity) return;
      const pad = 120;
      this.flyTo({ x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 }, 8);
    }

    select(g, label) {
      this.selPath.setAttribute('d', g ? ringD(g.ring) : '');
      this.unmark('.pin');
      if (!g) return;
      const m = this.marker(g.cx, g.y0, this.markG);
      m.classList.add('pin');
      m.innerHTML = '<g class="pin-in"><path class="pin-shape" d="M0 0C-4-9-15-14-15-25a15 15 0 1 1 30 0C15-14 4-9 0 0z"/><circle class="pin-dot" cy="-25" r="5.5"/></g>';
      if (label) {
        const t = el('text', { class: 'pin-label', y: -50 }, m); t.textContent = label;
        const bb = t.getBBox();
        m.insertBefore(el('rect', { class: 'pin-label-bg', x: bb.x - 9, y: bb.y - 5, width: bb.width + 18, height: bb.height + 10, rx: (bb.height + 10) / 2 }), t);
      }
      this.apply();
    }

    showRoute(r, focus) {
      this.scaled = this.scaled.filter((n) => !n.classList.contains('chev'));
      this.routeG.innerHTML = '';
      this.walker = null;
      this.route = null;
      if (!r) return;
      const line = r.draw || r.pts;
      // styl jako u navigace v obchodních centrech: tenká čára, rovné úseky, ostrá kolínka, šipky po celé délce
      const dStr = roundedD(line, 12);
      el('path', { d: dStr, class: 'route-casing' }, this.routeG);
      const p = el('path', { d: dStr, class: 'route-line', id: 'routePath' }, this.routeG);
      this.chevG = el('g', { class: 'route-chevs' }, this.routeG);
      this.route = { path: p, len: p.getTotalLength(), k: 0 };
      // start: štítek (brána nebo „Jsem zde“)
      const st = line[0];
      const sm = this.marker(st.x, st.y, this.routeG);
      sm.classList.add('chev', 'route-start');
      const kioskHere = document.documentElement.classList.contains('kiosk') && r.gate === 'main';
      const lbl = r.gate === 'gps' || kioskHere ? 'JSEM ZDE' : 'START';
      sm.innerHTML = `<circle class="rs-dot" r="7"/><g class="rs-pill"><rect x="-${lbl.length * 3.9 + 12}" y="-38" width="${lbl.length * 7.8 + 24}" height="22" rx="5"/><path d="M-6 -16.5 L0 -9 L6 -16.5Z"/><text y="-23">${lbl}</text></g>`;
      // cíl: pulzující kruh kolem hrobu
      const en = line[line.length - 1];
      const em = this.marker(en.x, en.y, this.routeG);
      em.classList.add('chev', 'route-end');
      em.innerHTML = '<circle class="re-pulse" r="12"/><circle class="re-dot" r="5"/>';
      // animace vykreslení od startu k cíli
      const L = Math.ceil(this.route.len * this.k) + 40;
      p.style.strokeDasharray = `${L} ${L}`;
      p.style.strokeDashoffset = `${L}`;
      p.getBoundingClientRect();
      p.style.transition = 'stroke-dashoffset 1.1s cubic-bezier(.4,0,.2,1)';
      p.style.strokeDashoffset = '0';
      this.chevG.classList.add('pending');
      clearTimeout(this._drawT);
      this._drawT = setTimeout(() => { p.style.transition = ''; p.style.strokeDasharray = ''; p.style.strokeDashoffset = ''; this.chevG && this.chevG.classList.remove('pending'); }, 1200);
      this.apply();
      if (focus !== false) {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const q of r.pts) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
        this.flyTo({ x: x0 - 160, y: y0 - 160, w: x1 - x0 + 320, h: y1 - y0 + 220 }, 10);
      }
    }

    // bez pohybu šipek: omezený pohyb v systému, nebo úsporné vykreslení
    still() {
      const html = document.documentElement;
      return html.classList.contains('lite') || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }

    // šipky po trase: stálý rozestup na obrazovce (~54 px) a plynulý pohyb ve směru chůze
    placeChevrons() {
      const R = this.route;
      if (!R || !this.chevG) return;
      if (!R.samples) {
        // tvar trasy navzorkovat jednou (každé 2 dm), animace pak jen posouvá šipky
        R.samples = [];
        for (let l = 0; l <= R.len; l += 2) {
          const a = R.path.getPointAtLength(l), b = R.path.getPointAtLength(Math.min(R.len, l + 1.5));
          R.samples.push([a.x, a.y, Math.atan2(b.y - a.y, b.x - a.x) / RAD]);
        }
      }
      if (Math.abs(R.k - this.k) / this.k < 0.03 && R.nodes) return;
      R.k = this.k;
      R.gap = 54 / this.k;
      const count = Math.min(400, Math.ceil(R.len / R.gap) + 1);
      let html = '';
      for (let i = 0; i < count; i++) html += '<path d="M-6 -7.5 L6.5 0 L-6 7.5 L-2.5 0Z"/>';
      this.chevG.innerHTML = html;
      R.nodes = [...this.chevG.children];
      this.moveChevrons(performance.now());
      this.startChevronLoop();
    }

    moveChevrons(now) {
      const R = this.route;
      if (!R || !R.nodes) return;
      // rychlost ~32 px/s na obrazovce
      const phase = this.still() ? R.gap * 0.75 : ((now / 1000) * (32 / this.k)) % R.gap;
      const s = (1 / this.k).toFixed(4), S = R.samples, end = R.len - R.gap * 0.35;
      R.nodes.forEach((n, i) => {
        const l = phase + i * R.gap;
        if (l < R.gap * 0.3 || l > end) { n.setAttribute('visibility', 'hidden'); return; }
        const p = S[Math.min(S.length - 1, Math.round(l / 2))];
        // jemné zeslábnutí u startu a cíle
        const fade = Math.min(1, (l - R.gap * 0.3) / (R.gap * 0.5), (end - l) / (R.gap * 0.5));
        n.setAttribute('visibility', 'visible');
        n.setAttribute('opacity', fade.toFixed(2));
        n.setAttribute('transform', `translate(${p[0].toFixed(1)},${p[1].toFixed(1)}) rotate(${p[2].toFixed(1)}) scale(${s})`);
      });
    }

    startChevronLoop() {
      if (this._chevLoop) return;
      let last = 0;
      const tick = (now) => {
        if (!this.route) { this._chevLoop = null; return; }
        // ~30 snímků/s stačí (posun ~1 px na snímek)
        if (now - last >= 28 && !this.still() && !document.documentElement.classList.contains('map-moving')) { last = now; this.moveChevrons(now); }
        this._chevLoop = requestAnimationFrame(tick);
      };
      this._chevLoop = requestAnimationFrame(tick);
    }

    focusGrave(g) { this.flyTo({ x: g.cx - 160, y: g.cy - 140, w: 320, h: 260 }, 16); }

    setCandles(ids) {
      this.unmark('.candle');
      for (const id of ids) {
        const g = this.d.graveById[id]; if (!g) continue;
        const m = this.marker(g.cx, g.cy, this.markG);
        m.classList.add('candle');
        m.innerHTML = '<circle class="candle-glow" r="13"/><path class="candle-flame" d="M0-8c3 3.5 4.4 6 4.4 8.2A4.4 4.4 0 0 1-4.4.2C-4.4-2 -3 -4.5 0-8z"/><rect class="candle-body" x="-3" y="2" width="6" height="7" rx="1"/>';
      }
      this.apply();
    }

    youAreHere(pt, label, acc) {
      this.unmark('.here');
      if (!pt) return;
      const m = this.marker(pt.x, pt.y, this.markG);
      m.classList.add('here');
      m.innerHTML = `<circle class="here-pulse" r="11"/><circle class="here-dot" r="7"/><text class="here-t" x="14" y="4">${label || 'Vy jste zde'}</text>`;
      this.apply();
    }

    setLayer(name, on) {
      if (name === 'trees') { this.hideTrees = !on; this.restyle(); return; }
      this.svg.classList.toggle('hide-' + name, !on);
    }
  }

  window.CemeteryMap = CemeteryMap;
})();
