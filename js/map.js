/* Tichá cesta — vykreslení skutečného půdorysu hřbitova (SVG), posun, zoom, pinch, trasa a značky.
   Světové jednotky = decimetry (viz data/vitkovice.js). */
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
  const ringD = (r) => { let s = 'M' + r[0] + ' ' + r[1]; for (let i = 2; i < r.length; i += 2) s += 'L' + r[i] + ' ' + r[i + 1]; return s + 'Z'; };
  const polyD = (polys) => polys.map((p) => p.map(ringD).join('')).join('');
  const lineD = (l) => { let s = 'M' + l[0] + ' ' + l[1]; for (let i = 2; i < l.length; i += 2) s += 'L' + l[i] + ' ' + l[i + 1]; return s; };

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
  const GRAVE_CLASSES = ['hrob', 'dvojhrob', 'trojhrob', 'vicehrob', 'hrobka', 'urnovy', 'kolumbarium', 'vsyp'];

  class CemeteryMap {
    constructor(container, data, opts) {
      this.c = container; this.d = data; this.o = opts || {};
      this.k = 1; this.x = 0; this.y = 0; this.fitK = 1;
      this.scaled = [];
      this.svg = el('svg', { class: 'map-svg', role: 'application', 'aria-label': 'Interaktivní mapa hřbitova' }, container);
      this.build();
      this.bind();
      this.fit(false);
      let lastW = container.clientWidth;
      new ResizeObserver(() => {
        if (Math.abs(container.clientWidth - lastW) > 40 && !this._touched) this.fit(false);
        lastW = container.clientWidth;
      }).observe(container);
    }

    // ---------- Stavba scény ----------
    build() {
      const d = this.d, V = d.V, svg = this.svg;
      const defs = el('defs', null, svg);
      defs.innerHTML = `
        <radialGradient id="gTree" cx="38%" cy="34%" r="70%"><stop offset="0" stop-color="#A9BC9C"/><stop offset=".65" stop-color="#7F9973"/><stop offset="1" stop-color="#6A8560"/></radialGradient>
        <radialGradient id="gConifer" cx="38%" cy="34%" r="70%"><stop offset="0" stop-color="#7E9C7E"/><stop offset=".7" stop-color="#557558"/><stop offset="1" stop-color="#46644A"/></radialGradient>
        <filter id="fSoft" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#33402F" flood-opacity=".22"/></filter>
        ${Object.entries(ICONS).map(([k, v]) => `<symbol id="i-${k}" viewBox="0 0 24 24">${v}</symbol>`).join('')}`;

      this.root = el('g', { class: 'root' }, svg);
      const R = this.root, A = V.areas;
      const area = (cls, list, parent) => list && list.length && el('path', { d: polyD(list), class: 'a-' + cls, 'fill-rule': 'evenodd' }, parent || R);

      area('ground', V.boundary);
      area('lawn', A.lawn); area('park', A.park);
      const S = el('g', { class: 'sections' }, R);
      for (const s of d.sections) el('path', { d: polyD(s.area), class: 'section', 'data-sec': s.id, 'fill-rule': 'evenodd' }, S);
      area('ditch', A.ditch);
      area('gravel', A.gravel); area('paved', A.paved); area('steps', A.steps);
      area('shrub', A.shrub); area('flower', A.flower); area('tech', A.tech);
      for (const [cls, list] of Object.entries(V.lines)) if (list.length) el('path', { d: list.map(lineD).join(''), class: 'l-' + cls }, R);
      el('path', { d: polyD(V.boundary), class: 'boundary', fill: 'none' }, R);
      area('wall', A.wall);
      area('monument', A.monument);
      const bld = area('building', A.building); if (bld) bld.setAttribute('filter', 'url(#fSoft)');

      // hroby: jedna cesta na typ (výkon)
      const G = el('g', { class: 'graves' }, R);
      const buckets = {};
      for (const g of d.graves) {
        const key = g.status === 'volne' ? 'volne' : g.type;
        (buckets[key] = buckets[key] || []).push(ringD(g.ring));
      }
      for (const key of [...GRAVE_CLASSES, 'volne']) if (buckets[key]) el('path', { d: buckets[key].join(''), class: 'gr gr-' + key }, G);
      this.hitPath = el('path', { class: 'gr-hit', d: '' }, R);
      this.hoverPath = el('path', { class: 'gr-hover', d: '' }, R);
      this.selPath = el('path', { class: 'gr-sel', d: '' }, R);
      this.numG = el('g', { class: 'nums' }, R);

      // stromy a keře
      const T = el('g', { class: 'trees' }, R);
      for (const t of d.trees) {
        const r = t.t === 'bush' ? 9 : t.t === 'conifer' ? 18 : 24;
        if (t.t !== 'bush') el('circle', { cx: t.x + 3, cy: t.y + 4, r, class: 'tree-shadow' }, T);
        el('circle', { cx: t.x, cy: t.y, r, class: t.t === 'bush' ? 'bush' : t.t === 'conifer' ? 'tree conifer' : 'tree' }, T);
      }

      this.routeG = el('g', { class: 'route' }, R);
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
      // popisky sekcí
      this.secG = el('g', { class: 'sec-labels' }, R);
      for (const s of d.sections) {
        const g = this.marker(s.lx, s.ly, this.secG);
        g.classList.add('sec-label'); g.dataset.sec = s.id;
        if (s.n < 100) g.classList.add('small');
        const w = 12 + s.id.length * 7.6;
        el('rect', { x: -w / 2, y: -11, width: w, height: 22, rx: 11, class: 'sec-pill' }, g);
        const t = el('text', { y: 4.3, class: 'sec-t' }, g); t.textContent = s.id;
      }
      // vchody
      const GT = el('g', { class: 'gates' }, R);
      for (const [key, gt] of Object.entries(d.GATES)) {
        const g = this.marker(gt.x, gt.y, GT);
        g.classList.add('gate-marker', 'gate-' + key);
        el('circle', { r: 8, class: 'gate-dot' }, g);
        const t = el('text', { class: 'gate-t', x: key === 'east' ? -14 : 14, y: 4, 'text-anchor': key === 'east' ? 'end' : 'start' }, g);
        t.textContent = gt.label;
      }
      this.markG = el('g', { class: 'marks' }, R);
    }

    marker(x, y, parent) {
      const g = el('g', { 'data-x': x, 'data-y': y }, parent);
      this.scaled.push(g);
      return g;
    }
    unmark(sel) {
      this.markG.querySelectorAll(sel).forEach((n) => { this.scaled = this.scaled.filter((s) => s !== n); n.remove(); });
    }

    world(e) {
      const r = this.c.getBoundingClientRect();
      return { x: (e.clientX - r.left - this.x) / this.k, y: (e.clientY - r.top - this.y) / this.k };
    }

    // ---------- Interakce ----------
    bind() {
      const svg = this.svg;
      const pts = new Map();
      let pinch = null, moved = 0;
      svg.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 && e.pointerType === 'mouse') return;
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        moved = 0; this._touched = true; this.stopAnim();
        if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: this.k }; }
        svg.classList.add('dragging');
      });
      window.addEventListener('pointermove', (e) => {
        const p = pts.get(e.pointerId);
        if (!p) {
          if (e.pointerType === 'mouse' && e.target.closest && e.target.closest('.map-svg')) this.hover(e);
          return;
        }
        const dx = e.clientX - p.x, dy = e.clientY - p.y;
        if (pts.size === 1) {
          this.x += dx; this.y += dy; moved += Math.abs(dx) + Math.abs(dy);
          p.x = e.clientX; p.y = e.clientY;
          this.apply();
        } else if (pts.size === 2 && pinch) {
          const old = [...pts.values()];
          const oc = { x: (old[0].x + old[1].x) / 2, y: (old[0].y + old[1].y) / 2 };
          p.x = e.clientX; p.y = e.clientY;
          const [a, b] = [...pts.values()];
          const nc = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          const r = this.c.getBoundingClientRect();
          this.x += nc.x - oc.x; this.y += nc.y - oc.y;
          this.zoomAt(pinch.k * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d / this.k, nc.x - r.left, nc.y - r.top);
          moved += 10;
        }
      });
      const up = (e) => {
        if (!pts.has(e.pointerId)) return;
        pts.delete(e.pointerId);
        if (pts.size < 2) pinch = null;
        if (!pts.size) svg.classList.remove('dragging');
        if (moved > 6) { this._suppress = true; setTimeout(() => (this._suppress = false), 30); }
      };
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
      svg.addEventListener('pointerleave', () => { this.hoverPath.setAttribute('d', ''); this.o.onHover && this.o.onHover(null); });
      svg.addEventListener('wheel', (e) => {
        e.preventDefault();
        this._touched = true; this.stopAnim();
        const r = this.c.getBoundingClientRect();
        this.zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)), e.clientX - r.left, e.clientY - r.top);
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

    zoomAt(f, px, py) {
      const k = clamp(this.k * f, this.fitK * 0.6, this.fitK * 40);
      this.x = px - (px - this.x) * (k / this.k);
      this.y = py - (py - this.y) * (k / this.k);
      this.k = k;
      this.apply();
    }

    animateZoom(f, px, py) {
      if (px == null) { const i = this.insets(); px = i.left + (this.c.clientWidth - i.left - i.right) / 2; py = i.top + (this.c.clientHeight - i.top - i.bottom) / 2; }
      const k = clamp(this.k * f, this.fitK * 0.6, this.fitK * 40);
      this.animTo(k, px - (px - this.x) * (k / this.k), py - (py - this.y) * (k / this.k), 340);
    }

    apply() {
      this.root.setAttribute('transform', `translate(${this.x.toFixed(2)},${this.y.toFixed(2)}) scale(${this.k.toFixed(5)})`);
      const s = (1 / this.k).toFixed(5);
      for (const g of this.scaled) g.setAttribute('transform', `translate(${g.dataset.x},${g.dataset.y}) scale(${s})`);
      const rel = this.k / this.fitK;
      this.svg.classList.toggle('lod-mid', rel > 2.2);
      this.svg.classList.toggle('lod-near', rel > 5);
      this.svg.classList.toggle('lod-far', rel < 1.6);
      if (this.walker) this.walker.setAttribute('r', (6 / this.k).toFixed(3));
      this.scheduleNums();
      if (this.o.onView) this.o.onView(this.k);
    }

    // čísla hrobů jen ve viditelném výřezu při velkém přiblížení
    scheduleNums() {
      if (this._numRaf) return;
      this._numRaf = requestAnimationFrame(() => {
        this._numRaf = null;
        if (this.k < 2.2) { if (this.numG.childNodes.length) this.numG.textContent = ''; this._numKey = ''; return; }
        const cw = this.c.clientWidth, ch = this.c.clientHeight;
        const x0 = -this.x / this.k, y0 = -this.y / this.k, x1 = x0 + cw / this.k, y1 = y0 + ch / this.k;
        const key = [x0, y0, x1, y1].map((v) => Math.round(v / 20)).join(',');
        if (key === this._numKey) return;
        this._numKey = key;
        const list = this.d.gravesIn(x0, y0, x1, y1, 900);
        let html = '';
        for (const g of list) {
          const w = g.x1 - g.x0, h = g.y1 - g.y0;
          const fs = Math.max(2.2, Math.min(4.2, Math.min(w, h) * 0.42));
          html += `<text x="${g.cx.toFixed(1)}" y="${(g.cy + fs * 0.36).toFixed(1)}" font-size="${fs.toFixed(1)}">${g.num}</text>`;
        }
        this.numG.innerHTML = html;
      });
    }

    insets() { return (this.o.insets && this.o.insets()) || { left: 0, top: 0, right: 0, bottom: 0 }; }

    frame(box, pad) {
      const cw = this.c.clientWidth, ch = this.c.clientHeight, i = this.insets();
      pad = pad == null ? 24 : pad;
      const aw = Math.max(80, cw - i.left - i.right - pad * 2), ah = Math.max(80, ch - i.top - i.bottom - pad * 2);
      const k = Math.min(aw / box.w, ah / box.h);
      return { k, x: i.left + pad + (aw - box.w * k) / 2 - box.x * k, y: i.top + pad + (ah - box.h * k) / 2 - box.y * k };
    }

    fit(animate = true) {
      const f = this.frame({ x: 120, y: 120, w: this.d.W - 240, h: this.d.H - 240 }, 8);
      this.fitK = f.k;
      if (animate) this.animTo(f.k, f.x, f.y); else { this.k = f.k; this.x = f.x; this.y = f.y; this.apply(); }
    }

    flyTo(box, maxRel) {
      const f = this.frame(box, 40);
      const k = Math.min(f.k, this.fitK * (maxRel || 12));
      const cx = box.x + box.w / 2, cy = box.y + box.h / 2, i = this.insets();
      const vx = i.left + (this.c.clientWidth - i.left - i.right) / 2, vy = i.top + (this.c.clientHeight - i.top - i.bottom) / 2;
      this.animTo(k, vx - cx * k, vy - cy * k);
    }

    animTo(k, x, y, dur) {
      this.stopAnim();
      const k0 = this.k, x0 = this.x, y0 = this.y, t0 = performance.now();
      dur = dur || 750;
      const step = (now) => {
        const t = Math.min(1, (now - t0) / dur), e = ease(t);
        this.k = k0 + (k - k0) * e; this.x = x0 + (x - x0) * e; this.y = y0 + (y - y0) * e;
        this.apply();
        if (t < 1) this._raf = requestAnimationFrame(step);
      };
      this._raf = requestAnimationFrame(step);
      // pojistka: na kartě na pozadí prohlížeč animace pozastaví – dojet rovnou na cíl
      clearTimeout(this._animGuard);
      this._animGuard = setTimeout(() => {
        if (this._raf && this.k !== k) { cancelAnimationFrame(this._raf); this._raf = null; this.k = k; this.x = x; this.y = y; this.apply(); }
      }, dur + 250);
    }
    stopAnim() { if (this._raf) cancelAnimationFrame(this._raf); this._raf = null; clearTimeout(this._animGuard); }

    // ---------- Stav: výběr, trasa, zvýraznění ----------
    highlight(ids) {
      let dStr = '';
      if (ids) for (const id of ids) { const g = this.d.graveById[id]; if (g) dStr += ringD(g.ring); }
      this.hitPath.setAttribute('d', dStr);
      this.svg.classList.toggle('has-hits', !!dStr);
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
      this.routeG.innerHTML = '';
      this.walker = null;
      if (!r) return;
      const dStr = 'M' + r.pts.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('L');
      el('path', { d: dStr, class: 'route-casing' }, this.routeG);
      const p = el('path', { d: dStr, class: 'route-line', id: 'routePath' }, this.routeG);
      el('path', { d: dStr, class: 'route-dash' }, this.routeG);
      const w = el('circle', { r: 6 / this.k, class: 'route-walker' }, this.routeG);
      const len = p.getTotalLength();
      w.innerHTML = `<animateMotion dur="${Math.max(3, len / 260).toFixed(1)}s" repeatCount="indefinite"><mpath href="#routePath"/></animateMotion>`;
      this.walker = w;
      if (focus !== false) {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const q of r.pts) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
        this.flyTo({ x: x0 - 160, y: y0 - 160, w: x1 - x0 + 320, h: y1 - y0 + 220 }, 10);
      }
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

    setLayer(name, on) { this.svg.classList.toggle('hide-' + name, !on); }
  }

  window.CemeteryMap = CemeteryMap;
})();
