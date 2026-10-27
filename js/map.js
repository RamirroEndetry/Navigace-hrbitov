/* Tichá cesta — vykreslení mapy hřbitova (SVG), posun, zoom, pinch, trasa a značky. */
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

  const ICONS = {
    water: '<path d="M12 4.5c3 3.9 5 6.5 5 8.9a5 5 0 0 1-10 0c0-2.4 2-5 5-8.9z"/>',
    bin: '<path d="M8.2 9h7.6l-.8 9.5H9zM7 6.6h10v1.6H7zM10 5h4v1.6h-4z"/>',
    wc: '<text x="12" y="15.6" text-anchor="middle" font-size="8.6" font-weight="800" font-family="Manrope, sans-serif">WC</text>',
    bench: '<path d="M5 9.5h14v2.2H5zM5.5 13h13v1.7h-13zM7 14.7h1.7V18H7zM15.3 14.7H17V18h-1.7z"/>',
    office: '<path d="M12 4.8l7.2 4V10H4.8V8.8zM6.4 11h2v5.8h-2zM11 11h2v5.8h-2zM15.6 11h2v5.8h-2zM4.8 17.4h14.4V19H4.8z"/>',
    chapel: '<path d="M11 4h2v3.6h3.6v2H13V20h-2V9.6H7.4v-2H11z"/>',
    parking: '<path d="M8.6 5h4.3a4 4 0 0 1 0 8H11.2v6H8.6zM11.2 7.4v3.2h1.6a1.6 1.6 0 0 0 0-3.2z"/>',
    memorial: '<path d="M10.4 4.5h3.2v3h-3.2zM9.2 8.2h5.6v8.6H9.2zM7 17.4h10V19H7z"/>',
    pano: '<path fill-rule="evenodd" d="M6.8 8.6h2.3l1.2-1.8h3.4l1.2 1.8h2.3a1 1 0 0 1 1 1v6.6a1 1 0 0 1-1 1H6.8a1 1 0 0 1-1-1V9.6a1 1 0 0 1 1-1zM12 10.4a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2z"/>'
  };
  const POI_COLOR = { water: '#4C8299', bin: '#7A7F76', wc: '#5F6684', bench: '#9A7F57', office: '#2D4A3D', chapel: '#2D4A3D', parking: '#3B68A6', memorial: '#5C584F', pano: '#B06F35' };
  const POI_LAYER = { water: 'water', bin: 'bin', wc: 'service', office: 'service', parking: 'service', chapel: 'service', memorial: 'service', bench: 'bench', pano: 'pano' };

  class CemeteryMap {
    constructor(container, data, opts) {
      this.c = container; this.d = data; this.o = opts || {};
      this.k = 1; this.x = 0; this.y = 0;
      this.scaled = [];
      this.graveEls = {};
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
      const d = this.d, svg = this.svg;
      const defs = el('defs', null, svg);
      defs.innerHTML = `
        <radialGradient id="gTree" cx="38%" cy="34%" r="70%">
          <stop offset="0" stop-color="#A9BC9C"/><stop offset=".65" stop-color="#7F9973"/><stop offset="1" stop-color="#6A8560"/>
        </radialGradient>
        <radialGradient id="gMeadow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stop-color="#E4EAD6"/><stop offset="1" stop-color="#D3DEC4"/>
        </radialGradient>
        <pattern id="pGrass" width="9" height="9" patternUnits="userSpaceOnUse">
          <rect width="9" height="9" fill="#D9E1CD"/><circle cx="2" cy="3" r=".7" fill="#CBD6BD"/><circle cx="6.5" cy="7" r=".6" fill="#CBD6BD"/>
        </pattern>
        <filter id="fSoft" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1.2" stdDeviation="1.4" flood-color="#33402F" flood-opacity=".18"/></filter>
        ${Object.entries(ICONS).map(([k, v]) => `<symbol id="i-${k}" viewBox="0 0 24 24">${v}</symbol>`).join('')}`;

      this.root = el('g', { class: 'root' }, svg);
      const R = this.root;

      // okolí: ulice + parkoviště
      el('rect', { x: -800, y: 990, width: 3200, height: 52, class: 'street' }, R);
      el('text', { x: 300, y: 1022, class: 'street-label' }, R).textContent = 'Hřbitovní ulice';
      el('rect', { x: 930, y: 1046, width: 170, height: 46, rx: 6, class: 'parking' }, R);
      for (let i = 0; i < 9; i++) el('line', { x1: 945 + i * 18, y1: 1050, x2: 945 + i * 18, y2: 1066, class: 'parking-line' }, R);

      // areál
      const W = d.WALL;
      el('rect', { x: W.x, y: W.y, width: W.w, height: W.h, rx: 26, class: 'grounds' }, R);
      el('rect', { x: W.x, y: W.y, width: W.w, height: W.h, rx: 26, class: 'wall' }, R);
      // brány (průrvy ve zdi)
      el('rect', { x: 778, y: 952, width: 44, height: 16, class: 'gate-gap' }, R);
      el('rect', { x: 62, y: 440, width: 16, height: 40, class: 'gate-gap' }, R);
      for (const [x, y] of [[774, 954], [822, 954], [64, 436], [64, 480]]) el('rect', { x: x - 4, y: y - 4, width: 8, height: 8, rx: 1.5, class: 'gate-pillar' }, R);

      // horní pás: louka, kolumbárium, urnový háj
      el('ellipse', { cx: 1270, cy: 145, rx: 120, ry: 52, fill: 'url(#gMeadow)', class: 'meadow' }, R);
      el('rect', { x: 240, y: 112, width: 180, height: 10, rx: 2, class: 'columbarium' }, R);
      for (let i = 0; i < 18; i++) el('line', { x1: 250 + i * 10, y1: 112, x2: 250 + i * 10, y2: 122, class: 'columbarium-line' }, R);
      el('rect', { x: 245, y: 132, width: 170, height: 52, rx: 10, class: 'urn-grove' }, R);
      for (let r = 0; r < 3; r++) for (let i = 0; i < 14; i++) el('rect', { x: 254 + i * 11.5, y: 138 + r * 15, width: 7, height: 7, rx: 1, class: 'urn-slot' }, R);

      // cesty
      const A = el('g', { class: 'alleys' }, R);
      const line = (x1, y1, x2, y2, cls) => {
        el('line', { x1, y1, x2, y2, class: 'alley-edge ' + (cls || '') }, A);
        return [x1, y1, x2, y2, cls];
      };
      const lines = [];
      for (const y of d.YS) lines.push(line(d.XS[0], y, d.XS[4], y));
      for (const x of d.XS) lines.push(line(x, d.YS[0], x, d.YS[3], x === 800 ? 'main' : ''));
      lines.push(line(800, d.YS[3], 800, 975, 'main'));
      lines.push(line(800, 175, 800, d.YS[0], 'main'));
      lines.push(line(62, 460, d.XS[0], 460));
      for (const [x1, y1, x2, y2, cls] of lines) el('line', { x1, y1, x2, y2, class: 'alley ' + (cls || '') }, A);
      // náměstíčko u síně a u brány
      el('circle', { cx: 800, cy: 460, r: 30, class: 'plaza' }, A);
      el('rect', { x: 760, y: 905, width: 80, height: 60, rx: 10, class: 'plaza' }, A);

      // oddělení
      const S = el('g', { class: 'sections' }, R);
      for (const s of d.sections) {
        el('rect', { x: s.x, y: s.y, width: s.w, height: s.h, rx: 9, class: 'section', 'data-sec': s.id }, S);
        const t = el('text', { x: s.x + s.w / 2, y: s.y + s.h / 2 + 52, class: 'section-letter' }, S);
        t.textContent = s.id;
      }

      // budovy
      const B = el('g', { class: 'buildings' }, R);
      el('rect', { x: 735, y: 96, width: 130, height: 72, rx: 6, class: 'building', filter: 'url(#fSoft)' }, B);
      el('rect', { x: 772, y: 160, width: 56, height: 16, rx: 2, class: 'building-portico' }, B);
      el('path', { d: 'M735 132h130', class: 'roof-ridge' }, B);
      el('rect', { x: 862, y: 904, width: 86, height: 42, rx: 5, class: 'building', filter: 'url(#fSoft)' }, B);
      el('rect', { x: 672, y: 908, width: 56, height: 34, rx: 5, class: 'building', filter: 'url(#fSoft)' }, B);
      el('rect', { x: 1018, y: 128, width: 24, height: 24, rx: 3, class: 'monument' }, B);

      // hroby
      const G = el('g', { class: 'graves' }, R);
      const N = el('g', { class: 'nums' }, R);
      for (const g of d.graves) {
        const r = el('rect', { x: g.x, y: g.y, width: g.w, height: g.h, rx: g.type === 'urna' ? 1.5 : 2.2, class: `g-grave t-${g.type} s-${g.status}`, 'data-id': g.id }, G);
        this.graveEls[g.id] = r;
        const t = el('text', { x: g.cx, y: g.y + g.h / 2 + 2.3 }, N);
        t.textContent = g.num;
      }

      // stromy
      const T = el('g', { class: 'trees' }, R);
      for (const t of d.trees) {
        el('circle', { cx: t.x + 1.6, cy: t.y + 2.2, r: t.r, class: 'tree-shadow' }, T);
        el('circle', { cx: t.x, cy: t.y, r: t.r, class: 'tree' }, T);
      }

      // popisky míst
      const L = el('g', { class: 'labels' }, R);
      for (const p of d.places) { const t = el('text', { x: p.x, y: p.y, class: 'place-label' }, L); t.textContent = p.label; }
      const ch = el('text', { x: 800, y: 88, class: 'place-label strong' }, L); ch.textContent = 'Obřadní síň';

      // trasa
      this.routeG = el('g', { class: 'route' }, R);
      // POI
      this.poiG = el('g', { class: 'pois' }, R);
      for (const p of d.pois) {
        const g = this.marker(p.x, p.y, this.poiG);
        g.classList.add('poi', 'layer-' + POI_LAYER[p.t]);
        g.dataset.poi = d.pois.indexOf(p);
        const big = p.t === 'chapel' || p.t === 'office' || p.t === 'parking';
        const r = big ? 13 : p.t === 'bench' || p.t === 'bin' ? 8.5 : 10.5;
        el('circle', { r, fill: POI_COLOR[p.t], class: 'poi-dot' }, g);
        el('use', { href: '#i-' + p.t, x: -r * 0.8, y: -r * 0.8, width: r * 1.6, height: r * 1.6, fill: '#fff' }, g);
        const tt = el('title', null, g); tt.textContent = p.label;
      }
      // odznaky oddělení
      const SB = el('g', { class: 'sec-badges' }, R);
      for (const s of d.sections) {
        const g = this.marker(s.x + 2, s.y + 2, SB);
        el('circle', { r: 12, class: 'sec-badge' }, g);
        const t = el('text', { y: 4.4, class: 'sec-badge-t' }, g); t.textContent = s.id;
      }
      // brány
      const GT = el('g', { class: 'gates' }, R);
      for (const [key, gt] of Object.entries(d.GATES)) {
        const g = this.marker(gt.x, gt.y, GT);
        g.classList.add('gate-marker', 'gate-' + key);
        const t = el('text', { class: 'gate-t', y: key === 'main' ? 30 : 4, x: key === 'main' ? 0 : -16, 'text-anchor': key === 'main' ? 'middle' : 'end' }, g);
        t.textContent = gt.label;
        el('circle', { r: 6.5, class: 'gate-dot' }, g);
      }
      this.markG = el('g', { class: 'marks' }, R);
    }

    marker(x, y, parent) {
      const g = el('g', { 'data-x': x, 'data-y': y }, parent);
      this.scaled.push(g);
      return g;
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
        if (pts.size === 2) {
          const [a, b] = [...pts.values()];
          pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: this.k };
        }
        svg.classList.add('dragging');
      });
      window.addEventListener('pointermove', (e) => {
        const p = pts.get(e.pointerId);
        if (!p) {
          if (e.target.classList && e.target.classList.contains('g-grave') && this.o.onHover) this.o.onHover(this.d.graveById[e.target.dataset.id], e);
          else if (this.o.onHover) this.o.onHover(null, e);
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
          const k = pinch.k * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d;
          this.zoomAt(k / this.k, nc.x - r.left, nc.y - r.top);
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
      svg.addEventListener('wheel', (e) => {
        e.preventDefault();
        this._touched = true; this.stopAnim();
        const r = this.c.getBoundingClientRect();
        this.zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)), e.clientX - r.left, e.clientY - r.top);
      }, { passive: false });
      svg.addEventListener('dblclick', (e) => {
        const r = this.c.getBoundingClientRect();
        this.animateZoom(1.9, e.clientX - r.left, e.clientY - r.top);
      });
      svg.addEventListener('click', (e) => {
        if (this._suppress) return;
        const t = e.target;
        const poi = t.closest && t.closest('.poi');
        if (poi && this.o.onPoi) return this.o.onPoi(this.d.pois[+poi.dataset.poi]);
        if (t.classList.contains('g-grave')) {
          if (this.k >= this.fitK * 1.5 || e.pointerType === 'mouse' || !e.pointerType) return this.o.onGrave && this.o.onGrave(this.d.graveById[t.dataset.id]);
        }
        if (t.classList.contains('section') || t.classList.contains('g-grave')) {
          const s = this.d.sections.find((s) => s.id === (t.dataset.sec || this.d.graveById[t.dataset.id].sec));
          if (this.k < this.fitK * 1.8) this.flyTo({ x: s.x - 20, y: s.y - 20, w: s.w + 40, h: s.h + 40 });
        }
      });
    }

    zoomAt(f, px, py) {
      const k = clamp(this.k * f, this.fitK * 0.6, this.fitK * 16);
      this.x = px - (px - this.x) * (k / this.k);
      this.y = py - (py - this.y) * (k / this.k);
      this.k = k;
      this.apply();
    }

    animateZoom(f, px, py) {
      if (px == null) { px = this.c.clientWidth / 2; py = this.c.clientHeight / 2; const i = this.insets(); px = i.left + (this.c.clientWidth - i.left - i.right) / 2; py = i.top + (this.c.clientHeight - i.top - i.bottom) / 2; }
      const k = clamp(this.k * f, this.fitK * 0.6, this.fitK * 16);
      const x = px - (px - this.x) * (k / this.k), y = py - (py - this.y) * (k / this.k);
      this.animTo(k, x, y, 320);
    }

    apply() {
      this.root.setAttribute('transform', `translate(${this.x.toFixed(2)},${this.y.toFixed(2)}) scale(${this.k.toFixed(4)})`);
      const s = clamp(1 / this.k, 0.3, 1.7);
      for (const g of this.scaled) g.setAttribute('transform', `translate(${g.dataset.x},${g.dataset.y}) scale(${s.toFixed(4)})`);
      const rel = this.k / (this.fitK || this.k);
      this.svg.classList.toggle('lod-num', this.k > 2.1);
      this.svg.classList.toggle('lod-near', rel > 2.4);
      if (this.walker) this.walker.setAttribute('r', (5.5 / this.k).toFixed(3));
      if (this.o.onView) this.o.onView(this.k);
    }

    insets() {
      return (this.o.insets && this.o.insets()) || { left: 0, top: 0, right: 0, bottom: 0 };
    }

    frame(box, pad) {
      const cw = this.c.clientWidth, ch = this.c.clientHeight, i = this.insets();
      pad = pad == null ? 24 : pad;
      const aw = Math.max(80, cw - i.left - i.right - pad * 2), ah = Math.max(80, ch - i.top - i.bottom - pad * 2);
      const k = Math.min(aw / box.w, ah / box.h);
      return { k, x: i.left + pad + (aw - box.w * k) / 2 - box.x * k, y: i.top + pad + (ah - box.h * k) / 2 - box.y * k };
    }

    fit(animate = true) {
      const f = this.frame({ x: 50, y: 60, w: 1500, h: 1040 }, 12);
      this.fitK = f.k;
      if (animate) this.animTo(f.k, f.x, f.y); else { this.k = f.k; this.x = f.x; this.y = f.y; this.apply(); }
    }

    flyTo(box, maxRel) {
      const f = this.frame(box, 40);
      const k = Math.min(f.k, this.fitK * (maxRel || 6));
      const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
      const i = this.insets();
      const vx = i.left + (this.c.clientWidth - i.left - i.right) / 2, vy = i.top + (this.c.clientHeight - i.top - i.bottom) / 2;
      this.animTo(k, vx - cx * k, vy - cy * k);
    }

    animTo(k, x, y, dur) {
      this.stopAnim();
      const k0 = this.k, x0 = this.x, y0 = this.y, t0 = performance.now();
      dur = dur || 720;
      const step = (now) => {
        const t = Math.min(1, (now - t0) / dur), e = ease(t);
        this.k = k0 + (k - k0) * e; this.x = x0 + (x - x0) * e; this.y = y0 + (y - y0) * e;
        this.apply();
        if (t < 1) this._raf = requestAnimationFrame(step);
      };
      this._raf = requestAnimationFrame(step);
    }
    stopAnim() { if (this._raf) cancelAnimationFrame(this._raf); this._raf = null; }

    // ---------- Stav: výběr, trasa, zvýraznění ----------
    highlight(ids) {
      if (this._hits) for (const id of this._hits) this.graveEls[id] && this.graveEls[id].classList.remove('hit');
      this._hits = ids ? [...ids] : null;
      if (this._hits) for (const id of this._hits) this.graveEls[id] && this.graveEls[id].classList.add('hit');
      this.svg.classList.toggle('has-hits', !!(ids && ids.size));
    }

    fitTo(ids) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const id of ids) { const g = this.d.graveById[id]; x0 = Math.min(x0, g.x); y0 = Math.min(y0, g.y); x1 = Math.max(x1, g.x + g.w); y1 = Math.max(y1, g.y + g.h); }
      if (x0 === Infinity) return;
      const pad = 60;
      this.flyTo({ x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 }, 4);
    }

    select(g, label) {
      if (this._sel) this._sel.classList.remove('sel');
      this.markG.querySelectorAll('.pin').forEach((n) => { this.scaled = this.scaled.filter((s) => s !== n); n.remove(); });
      if (!g) { this._sel = null; return; }
      this._sel = this.graveEls[g.id]; this._sel.classList.add('sel');
      const m = this.marker(g.cx, g.y - 1, this.markG);
      m.classList.add('pin');
      m.innerHTML = `<g class="pin-in"><path class="pin-shape" d="M0 0C-4-9-15-14-15-25a15 15 0 1 1 30 0C15-14 4-9 0 0z"/><circle class="pin-dot" cy="-25" r="5.5"/></g>`;
      if (label) {
        const t = el('text', { class: 'pin-label', y: -50 }, m); t.textContent = label;
        const bb = t.getBBox();
        const bg = el('rect', { class: 'pin-label-bg', x: bb.x - 9, y: bb.y - 5, width: bb.width + 18, height: bb.height + 10, rx: (bb.height + 10) / 2 });
        m.insertBefore(bg, t);
      }
      this.apply();
    }

    showRoute(r, focus) {
      this.routeG.innerHTML = '';
      this.walker = null;
      if (!r) return;
      const dStr = 'M' + r.pts.map((p) => `${p.x} ${p.y}`).join('L');
      el('path', { d: dStr, class: 'route-casing' }, this.routeG);
      const p = el('path', { d: dStr, class: 'route-line', id: 'routePath' }, this.routeG);
      el('path', { d: dStr, class: 'route-dash' }, this.routeG);
      const w = el('circle', { r: 5.5 / this.k, class: 'route-walker' }, this.routeG);
      const len = p.getTotalLength();
      w.innerHTML = `<animateMotion dur="${Math.max(3, len / 140).toFixed(1)}s" repeatCount="indefinite" rotate="auto"><mpath href="#routePath"/></animateMotion>`;
      this.walker = w;
      if (focus !== false) {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const q of r.pts) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
        this.flyTo({ x: x0 - 40, y: y0 - 70, w: x1 - x0 + 80, h: y1 - y0 + 110 }, 5);
      }
    }

    focusGrave(g) {
      this.flyTo({ x: g.cx - 90, y: g.y - 80, w: 180, h: 150 }, 7);
    }

    setCandles(ids) {
      this.markG.querySelectorAll('.candle').forEach((n) => { this.scaled = this.scaled.filter((s) => s !== n); n.remove(); });
      for (const id of ids) {
        const g = this.d.graveById[id]; if (!g) continue;
        const m = this.marker(g.cx, g.y + g.h / 2, this.markG);
        m.classList.add('candle');
        m.innerHTML = '<circle class="candle-glow" r="13"/><path class="candle-flame" d="M0-8c3 3.5 4.4 6 4.4 8.2A4.4 4.4 0 0 1-4.4.2C-4.4-2 -3 -4.5 0-8z"/><rect class="candle-body" x="-3" y="2" width="6" height="7" rx="1"/>';
      }
      this.apply();
    }

    youAreHere(on) {
      this.markG.querySelectorAll('.here').forEach((n) => n.remove());
      if (!on) return;
      const g = this.d.GATES.main;
      const m = this.marker(g.x + 22, g.y - 26, this.markG);
      m.classList.add('here');
      m.innerHTML = '<circle class="here-pulse" r="11"/><circle class="here-dot" r="7"/><text class="here-t" x="14" y="4">Vy jste zde</text>';
      this.apply();
    }

    setLayer(name, on) { this.svg.classList.toggle('hide-' + name, !on); }
  }

  window.CemeteryMap = CemeteryMap;
})();
