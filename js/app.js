/* Tichá cesta — aplikační logika: vyhledávání, detail hrobu, trasa, QR, sekce, kiosk. */
(function () {
  'use strict';
  const D = window.CEM;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = D.norm;
  const store = {
    get(k, d) { try { const v = localStorage.getItem('tc.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('tc.' + k, JSON.stringify(v)); } catch (e) { /* bez úložiště */ } }
  };
  const MONTHS = ['ledna', 'února', 'března', 'dubna', 'května', 'června', 'července', 'srpna', 'září', 'října', 'listopadu', 'prosince'];
  const DAYS = ['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota'];
  const fmt = (isoStr) => { const [y, m, d] = isoStr.split('-').map(Number); return `${d}. ${m}. ${y}`; };
  const yearOf = (isoStr) => +isoStr.slice(0, 4);
  const ageOf = (p) => { const b = new Date(p.born), d = new Date(p.died); let a = d.getFullYear() - b.getFullYear(); if (d.getMonth() < b.getMonth() || (d.getMonth() === b.getMonth() && d.getDate() < b.getDate())) a--; return a; };
  const plural = (n, one, few, many) => (n === 1 ? one : n >= 2 && n <= 4 ? few : many);
  const graveCode = (g) => g.id;
  const TYPE = { hrob: 'Hrob', dvojhrob: 'Dvojhrob', trojhrob: 'Trojhrob', vicehrob: 'Vícehrob', hrobka: 'Hrobka', urnovy: 'Urnový hrob', kolumbarium: 'Kolumbárium', vsyp: 'Vsypové místo' };
  const SEC_IDS = D.sections.map((s) => s.id).sort((a, b) => b.length - a.length);
  const hashFor = (g, guide = GUIDE) => `#hrob=${encodeURIComponent(g.id)}${state.start !== 'auto' && state.start !== 'gps' ? '&start=' + state.start : ''}${guide ? '&p=1' : ''}`;
  // ukázkové dotazy z aktuálních dat
  const EXAMPLES = (() => {
    const cnt = {};
    for (const p of D.persons) cnt[p.last] = (cnt[p.last] || 0) + 1;
    const fem = Object.keys(cnt).filter((k) => /ová$/.test(k)).sort((a, b) => cnt[b] - cnt[a])[0];
    const pp = D.persons.find((p) => p.last === 'Kaluža') || D.persons[Math.floor(D.persons.length / 3)];
    const g = D.graves.find((x) => x.sec === 'XII' && x.status === 'obsazeno' && /^\d+$/.test(x.num)) || D.graves[0];
    return [fem, `${pp.last} ${pp.died.slice(0, 4)}`, g.id, 'sekce XIX-O'];
  })();

  const I = {
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>',
    nav: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3 20 20 12 16 4 20z"/></svg>',
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="6" y="2.5" width="12" height="19" rx="3"/><path d="M11 18.5h2"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8 6.8 19.6l1-5.8-4.3-4.1 5.9-.8z"/></svg>',
    starF: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8 6.8 19.6l1-5.8-4.3-4.1 5.9-.8z"/></svg>',
    candle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.5c2 2.3 3 3.9 3 5.3a3 3 0 0 1-6 0c0-1.4 1-3 3-5.3z"/><rect x="8.5" y="12" width="7" height="9.5" rx="1.5"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
    left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M17 20v-7a4 4 0 0 0-4-4H6M10 5 6 9l4 4"/></svg>',
    right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M7 20v-7a4 4 0 0 1 4-4h7M14 5l4 4-4 4"/></svg>',
    gate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 21V10a7 7 0 0 1 14 0v11M12 21v-8"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/></svg>',
    cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>',
    pano: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><ellipse cx="12" cy="12" rx="9.5" ry="4"/><path d="M12 8v8M2.5 12c0 3 4 5.5 9.5 5.5"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
    leaf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19c0-8 5-14 15-14 0 10-6 15-14 15M5 19l7-7"/></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 21h4"/></svg>',
    card: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M3 10h18M7 15h3"/></svg>',
    doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6"/></svg>',
    mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="m4 7 8 6 8-6"/></svg>',
    tel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></svg>',
    free: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="3 2.4"><rect x="6" y="3.5" width="12" height="17" rx="2"/></svg>'
  };

  // ---------- Stav ----------
  const params = new URLSearchParams(location.search);
  const KIOSK = params.has('kiosk');
  if (KIOSK) document.documentElement.classList.add('kiosk');
  // Průvodce: odkaz z QR / sdílení otevře jen jeden hrob a cestu k němu, bez dalších nabídek
  let GUIDE = new URLSearchParams(location.hash.slice(1)).has('p') && !KIOSK;
  const setGuide = (on) => { GUIDE = on; document.documentElement.classList.toggle('guide', on); };
  setGuide(GUIDE);
  const state = {
    view: 'home', res: null, resLimit: 40, query: '', grave: null, route: null,
    start: KIOSK ? 'main' : (D.GATES[store.get('start', 'auto')] ? store.get('start', 'auto') : 'auto'), from: null,
    favs: store.get('favs', []), candles: store.get('candles', []), user: store.get('user', null),
    filters: { sec: '', from: '', to: '' }, sheet: 'min'
  };

  const panel = $('#panel'), body = $('#panelBody'), q = $('#q');
  const mobile = () => window.matchMedia('(max-width: 680px)').matches;

  // ---------- Bottom sheet (mobil) ----------
  function sheetPx(s) {
    const h = window.innerHeight;
    if (GUIDE && s !== 'max') return Math.round(h * (s === 'min' ? 0.34 : 0.56));
    return s === 'min' ? (state.view === 'home' ? 214 : 150) : s === 'mid' ? Math.round(h * 0.5) : h - 78;
  }
  function setSheet(s, px) {
    state.sheet = s;
    const v = mobile() ? (px != null ? px : sheetPx(s)) : 0;
    document.documentElement.style.setProperty('--sheet-h', v + 'px');
  }

  function insets() {
    const cw = window.innerWidth;
    if (mobile()) return { left: 0, top: state.view === 'grave' ? 130 : 70, right: 56, bottom: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sheet-h')) || 0 };
    const r = panel.getBoundingClientRect();
    return { left: Math.min(r.right + 4, cw * 0.6), top: state.view === 'grave' ? 150 : 76, right: 70, bottom: 56 };
  }

  // ---------- Mapa ----------
  const map = new window.CemeteryMap($('#map'), D, {
    insets,
    onGrave: (g) => { if (!GUIDE) openGrave(g.id, { from: state.view === 'grave' ? state.from : state.view }); },
    onHover: showTip,
    onView: updateScale,
    onPoi: openPoi
  });
  map.setCandles(state.candles);
  if (KIOSK) map.youAreHere({ x: D.GATES.main.x + 60, y: D.GATES.main.y - 40 });

  function updateScale(k) {
    const mpp = D.M_PER_UNIT / k;
    const nice = [2, 5, 10, 20, 50, 100, 200];
    let m = nice[0];
    for (const n of nice) if (n / mpp <= 110) m = n;
    const sc = $('#scale');
    sc.querySelector('i').style.width = Math.round(m / mpp) + 'px';
    sc.querySelector('span').textContent = m + ' m';
  }

  const tip = $('#tip');
  function showTip(g, e) {
    if (!g || mobile()) { tip.hidden = true; return; }
    const ps = D.byGrave[g.id];
    const title = g.status === 'volne' ? 'Volné hrobové místo' : ps.length ? (ps.length > 1 ? `Rodina ${familyName(ps)}` : `${ps[0].first} ${ps[0].last}`) : 'Hrobové místo';
    tip.innerHTML = `<b>${esc(title)}</b><small>Sekce ${g.sec} · řada ${g.row} · hrob ${g.num} · ${TYPE[g.type]}</small>`;
    tip.style.left = e.clientX + 'px'; tip.style.top = e.clientY + 'px';
    tip.hidden = false;
  }
  function familyName(ps) {
    const m = ps.find((p) => !p.sex);
    if (!m) return ps[0].last;
    const l = m.last;
    if (/ý$/.test(l)) return l.slice(0, -1) + 'ých';
    if (/a$/.test(l)) return l.slice(0, -1) + 'ových';
    if (/ek$/.test(l)) return l.slice(0, -2) + 'kových';
    if (/ec$/.test(l)) return l.slice(0, -2) + 'cových';
    if (/ski$/.test(l)) return l.slice(0, -1) + 'ých';
    return l + 'ových';
  }

  // ---------- Vyhledávání ----------
  function parseQuery(raw) {
    const out = { tokens: [], years: [], date: null, grave: null, label: [] };
    let s = norm(raw.trim());
    // číslo hrobu: „XII-27-15“, „sekce XIX-A 16“, „UH 30“
    const up = s.toUpperCase().replace(/^(SEKCE|SEK\.?|ODDELENI|ODD\.?)\s*/, '');
    const sec = SEC_IDS.find((id) => up.startsWith(id) && (up.length === id.length || /[\s\-.,]/.test(up[id.length])));
    if (sec) {
      const rest = up.slice(sec.length).split(/[\s\-.,]+/).filter(Boolean);
      if (rest.every((t) => /^\d+[A-Z]?(\/\d+)?$/.test(t)) && rest.length <= 2) {
        out.grave = { sec, row: rest[0] || null, num: rest[1] || null };
        return out;
      }
    }
    const dm = s.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
    if (dm) { out.date = `${dm[3]}-${String(dm[2]).padStart(2, '0')}-${String(dm[1]).padStart(2, '0')}`; s = s.replace(dm[0], ' '); }
    s = s.replace(/\b(1[89]\d\d|20\d\d)\b/g, (y) => { out.years.push(+y); return ' '; });
    out.tokens = s.split(/[\s,.\-–]+/).filter((t) => t.length > 0 && !/^\d+$/.test(t));
    return out;
  }

  function runSearch() {
    const raw = q.value;
    const f = state.filters;
    $('#clearBtn').hidden = !raw;
    const hasFilter = f.sec || f.from || f.to;
    if (!raw.trim() && !hasFilter) { state.res = null; map.highlight(null); if (state.view === 'results') show('home'); return; }
    const pq = parseQuery(raw);
    let res;
    if (pq.grave) {
      const g = pq.grave;
      const graves = D.graves.filter((x) => x.sec === g.sec && (g.row == null || x.row === g.row) && (g.num == null || x.num.toUpperCase() === g.num));
      res = { kind: 'graves', items: graves, desc: g.num ? `hrob ${g.sec}-${g.row}-${g.num}` : g.row ? `sekce ${g.sec}, řada ${g.row}` : `sekce ${g.sec}` };
    } else {
      const fy = f.from ? +f.from : null, ty = f.to ? +f.to : null;
      const items = D.persons.filter((p) => {
        if (f.sec && D.graveById[p.grave].sec !== f.sec) return false;
        const dy = yearOf(p.died);
        if (fy && dy < fy) return false;
        if (ty && dy > ty) return false;
        if (pq.date && p.died !== pq.date && p.born !== pq.date) return false;
        if (pq.years.length === 1 && dy !== pq.years[0]) return false;
        if (pq.years.length >= 2) { const [a, b] = pq.years; if (!((yearOf(p.born) === a && dy === b) || (yearOf(p.born) === b && dy === a))) return false; }
        if (pq.tokens.length) {
          const words = p.n.split(' ');
          for (const t of pq.tokens) if (!words.some((w) => w.startsWith(t))) return false;
        }
        return true;
      });
      const parts = [];
      if (pq.tokens.length) parts.push(`„${esc(raw.replace(/\b(1[89]\d\d|20\d\d)\b|\d{1,2}\.\s*\d{1,2}\.\s*\d{4}/g, '').trim())}“`);
      if (pq.date) parts.push(`datum ${fmt(pq.date)}`);
      if (pq.years.length === 1) parts.push(`úmrtí ${pq.years[0]}`);
      if (pq.years.length >= 2) parts.push(`${pq.years[0]} – ${pq.years[1]}`);
      if (f.sec) parts.push(`odd. ${f.sec}`);
      if (fy || ty) parts.push(`úmrtí ${fy || '…'}–${ty || '…'}`);
      res = { kind: 'persons', items, desc: parts.join(' · '), tokens: pq.tokens };
    }
    state.res = res; state.resLimit = 40;
    const ids = new Set(res.kind === 'graves' ? res.items.map((g) => g.id) : res.items.map((p) => p.grave));
    map.highlight(ids.size && ids.size < 400 ? ids : null);
    show('results');
    if (ids.size && ids.size <= 60) map.fitTo(ids);
    if (res.kind === 'graves' && res.items.length === 1 && pq.grave.num) openGrave(res.items[0].id, { from: 'results' });
  }

  let tmr;
  q.addEventListener('input', () => { clearTimeout(tmr); tmr = setTimeout(runSearch, 160); });
  q.addEventListener('focus', () => { if (mobile() && state.sheet === 'min') setSheet('mid'); });
  $('#searchForm').addEventListener('submit', (e) => {
    e.preventDefault(); clearTimeout(tmr); runSearch(); q.blur();
    if (state.res && state.res.items.length === 1) {
      const it = state.res.items[0];
      openGrave(it.grave || it.id, { from: 'results' });
    }
  });
  const fSec = $('#fSec');
  for (const s of D.sections) fSec.insertAdjacentHTML('beforeend', `<option value="${s.id}">${s.id}</option>`);
  for (const [id, key] of [['fSec', 'sec'], ['fFrom', 'from'], ['fTo', 'to']]) {
    $('#' + id).addEventListener('input', (e) => { state.filters[key] = e.target.value; runSearch(); });
  }

  function hl(text, tokens) {
    if (!tokens || !tokens.length) return esc(text);
    const n = norm(text);
    for (const t of tokens) {
      const i = n.startsWith(t) ? 0 : -1;
      if (i === 0) return `<mark>${esc(text.slice(0, t.length))}</mark>${esc(text.slice(t.length))}`;
    }
    return esc(text);
  }

  // ---------- Pohledy ----------
  function show(view, opts) {
    state.view = view;
    document.querySelectorAll('.topnav button[data-v]').forEach((b) => b.classList.toggle('on', b.dataset.v === view));
    $('#topnav').classList.remove('open');
    let html = '';
    if (view === 'home') html = vHome();
    else if (view === 'results') html = vResults();
    else if (view === 'grave') html = vGrave();
    else if (view === 'pohrby') html = vFunerals();
    else if (view === 'sprava') html = vInfo();
    else if (view === 'ucet') html = vAccount();
    else if (view === 'panorama') html = vPano();
    body.innerHTML = `<div class="view view-${view}">${html}</div>`;
    updateChip();
    body.scrollTop = 0;
    if (view !== 'grave') {
      map.select(null); map.showRoute(null);
      if (view !== 'results') { map.highlight(null); }
      if (!opts || !opts.keepHash) history.replaceState(null, '', view === 'home' || view === 'results' ? location.pathname + location.search : `#v=${view}`);
    }
    if (mobile()) {
      if (view === 'home') setSheet('min');
      else if (view === 'results') setSheet(state.sheet === 'max' ? 'max' : 'mid');
      else if (view !== 'grave') setSheet('max');
    }
  }

  function vHome() {
    const now = new Date();
    const hrs = D.hoursFor(now);
    const hr = now.getHours() + now.getMinutes() / 60;
    const open = hr >= hrs.open && hr < hrs.close;
    const todayFun = D.funerals.filter((f) => f.date === D.iso(now)).length;
    const m = now.getMonth(), d = now.getDate();
    const dusicky = (m === 9 && d >= 15) || (m === 10 && d <= 2);
    return `
      <h1 class="display">Najděte místo,<br><em>kde vzpomínáte.</em></h1>
      <p class="lede">Vyhledejte hrob podle jména, data úmrtí nebo čísla hrobu. Mapa vás dovede až k němu, klidně i v telefonu.</p>
      <div class="examples"><span>Zkuste</span>
        ${EXAMPLES.map((e) => `<button class="chip" data-act="example" data-q="${esc(e)}">${esc(e)}</button>`).join('')}
      </div>
      <div class="today ${open ? '' : 'closed'}"><span class="dot"></span><div>
        <b>${open ? `Otevřeno · zavírá v ${hrs.close}:00` : `Zavřeno · otevírá v ${hrs.open}:00`}</b>
        <small>Dnes ${DAYS[now.getDay()]} ${now.getDate()}. ${MONTHS[now.getMonth()]} · ${hrs.open}:00 – ${hrs.close}:00</small></div></div>
      ${dusicky ? `<div class="banner">${I.candle}<div><b>Dušičky ${now.getFullYear()}</b><br>Od 31. 10. do 2. 11. prodloužená otevírací doba 7:00 – 21:00. Hlavní alej bude vyhrazena chodcům.</div></div>` : ''}
      <div class="tiles">
        <button class="tile" data-act="view" data-v="pohrby"><span class="ti">${I.cal}</span><span><b>Pohřby</b><small>${todayFun ? `Dnes ${todayFun} ${plural(todayFun, 'obřad', 'obřady', 'obřadů')}` : 'Rozpis obřadů'}</small></span></button>
        <button class="tile" data-act="view" data-v="sprava"><span class="ti">${I.info}</span><span><b>Správa hřbitova</b><small>Kontakty, ceník, řád</small></span></button>
        <button class="tile accent" data-act="view" data-v="ucet"><span class="ti">${I.star}</span><span><b>Výhody registrace</b><small>Moje hroby, upozornění</small></span></button>
        <button class="tile" data-act="view" data-v="panorama"><span class="ti">${I.pano}</span><span><b>Panorama 360°</b><small>Brzy · DigiDay</small></span></button>
      </div>
      <p class="fine">Skutečný půdorys a ${D.graves.length.toLocaleString('cs')} hrobů v ${D.sections.length} sekcích (ASGIS, zaměření DIGIS 12/2025).<br>Jména zemřelých jsou v ukázce fiktivní.</p>`;
  }

  function vResults() {
    const r = state.res;
    if (!r) return '';
    const n = r.items.length;
    const head = `<div class="res-head"><p><b>${n.toLocaleString('cs')}</b> ${plural(n, 'záznam', 'záznamy', 'záznamů')}${r.desc ? ' · ' + r.desc : ''}</p><button class="link" data-act="clear">Zrušit</button></div>`;
    if (!n) return head + `<div class="empty"><div class="h2">Nic jsme nenašli</div><p>Zkuste jen příjmení, nebo rok úmrtí bez data.<br>Diakritiku psát nemusíte.</p><button class="btn" data-act="view" data-v="sprava">Zeptat se správy hřbitova</button></div>`;
    const list = r.items.slice(0, state.resLimit).map((it) => {
      if (r.kind === 'graves') {
        const ps = D.byGrave[it.id];
        const name = it.status === 'volne' ? 'Volné hrobové místo' : ps.length ? ps.map((p) => `${p.first} ${p.last}`).join(', ') : 'Hrobové místo';
        const yrs = it.status === 'volne' ? TYPE[it.type] + ' · k pronájmu' : ps.length ? `${TYPE[it.type]} · ${ps.length} ${plural(ps.length, 'zesnulý', 'zesnulí', 'zesnulých')}` : TYPE[it.type];
        return `<li><button class="result" data-act="grave" data-id="${it.id}"><span class="r-name">${esc(name)}</span><span class="r-years">${yrs}</span><span class="r-loc ${it.status === 'volne' ? 'free' : ''}">${graveCode(it)}</span></button></li>`;
      }
      const g = D.graveById[it.grave];
      return `<li><button class="result" data-act="grave" data-id="${g.id}"><span class="r-name">${hl(it.first, r.tokens)} <b>${hl(it.last, r.tokens)}</b></span><span class="r-years">${yearOf(it.born)} – ${yearOf(it.died)} · zemř. ${fmt(it.died)}</span><span class="r-loc">${graveCode(g)}</span></button></li>`;
    }).join('');
    const more = n > state.resLimit ? `<button class="btn more" data-act="more">Zobrazit další (${n - state.resLimit})</button>` : '';
    return head + `<ul class="results">${list}</ul>` + more;
  }

  function stepIcon(kind) { return kind === 'left' ? I.left : kind === 'right' ? I.right : kind === 'start' ? I.gate : kind === 'finish' ? I.pin : I.up; }

  function vGuide() {
    const g = state.grave, ps = D.byGrave[g.id], r = state.route;
    const gps = r.gate === 'gps';
    const names = ps.length
      ? `<div class="people${ps.length > 2 ? ' many' : ''}">${ps.map((p) => `<div class="person"><div class="nm">${esc(p.first)} ${esc(p.last)}</div><div class="dt">${yearOf(p.born)} – ${yearOf(p.died)}</div></div>`).join('')}</div>`
      : `<div class="h2">Hrobové místo ${graveCode(g)}</div>`;
    return `
      <div class="eyebrow">Cesta k hrobu</div>
      ${names}
      <div class="g-loc"><div><small>Oddělení</small><b>${g.sec}</b></div><div><small>Řada</small><b>${g.row}</b></div><div><small>Hrob</small><b>${g.num}</b></div></div>
      <div class="g-sum">${I.nav}<span><b>${r.min} min chůze</b> · ${r.m} m<small>${gps ? 'Od místa, kde právě stojíte' : 'Od vchodu: ' + esc(D.GATES[r.gate].label)}</small></span></div>
      ${gps ? '' : `<button class="btn forest g-here" data-act="guide-locate">${I.pin}Jsem už na hřbitově – vést mě odsud</button>`}
      <ol class="steps g-steps">${r.steps.map((s) => `<li class="${s.kind}"><span class="si">${stepIcon(s.kind)}</span><span>${esc(s.text)}</span><span class="m">${s.m ? s.m + ' m' : ''}</span></li>`).join('')}</ol>
      <div class="g-help">${I.tel}<span>Potřebujete pomoc? <a href="tel:${D.info.phone.replace(/\s/g, '')}">${esc(D.info.phone)}</a><small>Kancelář správy hřbitova</small></span></div>
      <button class="link g-full" data-act="guide-exit">Otevřít celou aplikaci</button>`;
  }

  function vGrave() {
    if (GUIDE) return vGuide();
    const g = state.grave, ps = D.byGrave[g.id], r = state.route;
    const fav = state.favs.includes(g.id), lit = state.candles.includes(g.id);
    const backLbl = state.from === 'results' ? 'Výsledky hledání' : state.from === 'pohrby' ? 'Pohřby' : state.from === 'ucet' ? 'Můj účet' : 'Zpět';
    let people;
    if (g.status === 'volne') {
      people = `<div class="h2">Volné hrobové místo</div><p class="lede">${TYPE[g.type]} je k dispozici k pronájmu. Správa hřbitova vám připraví smlouvu a ukáže místo osobně.</p>
        <button class="btn forest wide" data-act="interest">Mám zájem o pronájem</button>`;
    } else {
      people = `<div class="people">${ps.map((p) => `<div class="person"><div class="nm">${esc(p.first)} ${esc(p.last)}</div><div class="dt">* ${fmt(p.born)} &nbsp;† ${fmt(p.died)} · ${ageOf(p)} let</div></div>`).join('')}</div>`;
    }
    const leaseCell = state.user
      ? `<b>${g.lease ? 'do ' + fmt(g.lease) : '—'}</b>`
      : `<span class="lock">${I.lock} po přihlášení</span>`;
    const actionsHtml = `
      <div class="actions">
        ${mobile() && !KIOSK
          ? `<button class="btn primary wide" data-act="${navigator.share ? 'share' : 'qr'}">${I.phone}Sdílet trasu s rodinou</button>`
          : `<button class="btn ${KIOSK ? 'accent' : 'primary'} wide" data-act="qr">${I.phone}Poslat trasu do telefonu</button>`}
        <button class="btn ${fav ? 'on' : ''}" data-act="fav">${fav ? I.starF : I.star}${fav ? 'Uloženo' : 'Uložit'}</button>
        <button class="btn ${lit ? 'on' : ''}" data-act="candle" ${g.status === 'volne' ? 'disabled' : ''}>${I.candle}${lit ? 'Svíčka hoří' : 'Zapálit svíčku'}</button>
      </div>
`;
    const routeHtml = `
      <div class="route-card">
        <div class="route-top">
          <div class="route-sum"><b>${r.m} m</b><span>≈ ${r.min} min chůze</span><small>${r.gate === 'gps' ? 'Od vaší polohy (GPS)' : (state.start === 'auto' ? 'Nejkratší trasa: ' : 'Od: ') + D.GATES[r.gate].label}</small></div>
          <div class="seg" role="group" aria-label="Výchozí místo">
            ${[...(state.here ? [['gps', 'Moje poloha']] : []), ['auto', 'Nejbližší'], ...Object.entries(D.GATES).map(([k, gt]) => [k, gt.btn])].map(([k, lbl]) => `<button class="${state.start === k ? 'on' : ''}" data-act="start" data-s="${k}">${lbl}</button>`).join('')}
          </div>
        </div>
        <ol class="steps">${r.steps.map((s) => `<li class="${s.kind}"><span class="si">${stepIcon(s.kind)}</span><span>${esc(s.text)}</span><span class="m">${s.m ? s.m + ' m' : ''}</span></li>`).join('')}</ol>
      </div>
`;
    return `
      <button class="back" data-act="back">${I.back}${backLbl}</button>
      <div class="eyebrow">Hrobové místo ${graveCode(g)}</div>
      <div class="loc-strip"><span>Sekce <b>${g.sec}</b></span><span>Řada <b>${g.row}</b></span><span>Hrob <b>${g.num}</b></span></div>
      ${people}
      ${mobile() && !KIOSK ? routeHtml + actionsHtml : actionsHtml + routeHtml}
      <div class="meta">
        <div><small>Typ</small><b>${TYPE[g.type]}</b></div>
        <div><small>Nájem</small>${g.status === 'volne' ? '<b>volné</b>' : leaseCell}</div>
      </div>`;
  }

  function vFunerals() {
    const now = new Date();
    const byDay = {};
    for (const f of D.funerals) (byDay[f.date] = byDay[f.date] || []).push(f);
    const days = Object.keys(byDay).sort();
    const label = (iso) => {
      const d = new Date(iso + 'T12:00');
      const diff = Math.round((d - new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12)) / 864e5);
      const name = diff === 0 ? 'Dnes' : diff === 1 ? 'Zítra' : DAYS[d.getDay()][0].toUpperCase() + DAYS[d.getDay()].slice(1);
      return `${diff === 0 ? '<span class="today-tag">Dnes</span>' : name} ${d.getDate()}. ${MONTHS[d.getMonth()]}`;
    };
    return `
      <button class="back" data-act="home">${I.back}Úvod</button>
      <div class="h2">Pohřby a rozloučení</div>
      <p class="lede">Rozpis smutečních obřadů v obřadní síni. Informace zveřejňujeme se souhlasem pozůstalých.</p>
      ${days.map((d) => `<div class="day"><h4>${label(d)}</h4>${byDay[d].map((f) => `
        <div class="fun"><span class="time">${f.time}</span><span class="who">${esc(f.name)}<small>${f.age} let · ${esc(f.place)}</small></span><button class="mini" data-act="fun-map" data-id="${f.grave}">Na mapě</button></div>`).join('')}</div>`).join('')}
      <h3 class="h3">Potřebujete zařídit pohřeb?</h3>
      <div class="card"><ul class="list">
        <li><span class="li-i">${I.doc}</span><span><b>Jak postupovat</b><small>Pohřební službu si zvolíte sami. Správa hřbitova zajistí hrobové místo a termín v obřadní síni.</small></span></li>
        <li><span class="li-i">${I.tel}</span><span><b>Kancelář správy</b><small>${esc(D.info.phone)} · ${esc(D.info.email)}</small></span></li>
      </ul></div>`;
  }

  function vInfo() {
    const now = new Date();
    const dow = now.getDay();
    const officeIdx = dow >= 1 && dow <= 5 ? dow - 1 : -1;
    const free = D.graves.filter((g) => g.status === 'volne').length;
    return `
      <button class="back" data-act="home">${I.back}Úvod</button>
      <div class="h2">Správa hřbitova</div>
      <p class="lede">${esc(D.info.name)} · provozovatel ${esc(D.info.owner)}</p>
      <div class="card">
        <div class="eyebrow" style="margin-bottom:10px">Otevírací doba areálu</div>
        <div class="kv">
          <span>Duben – září</span><b>7:00 – 20:00</b>
          <span>Říjen – březen</span><b>7:00 – 18:00</b>
          <span>Dušičky (31. 10. – 2. 11.)</span><b>7:00 – 21:00</b>
        </div>
      </div>
      <div class="card">
        <div class="eyebrow" style="margin-bottom:10px">Kancelář správy · úřední hodiny</div>
        <div class="kv">${D.info.office.map(([d, h], i) => `<span class="${i === officeIdx ? 'now' : ''}">${d}${i === officeIdx ? ' · dnes' : ''}</span><b class="${i === officeIdx ? 'now' : ''}">${h}</b>`).join('')}</div>
        <div class="contact-row">
          <a class="btn" href="tel:${D.info.phone.replace(/\s/g, '')}">${I.tel}Zavolat</a>
          <a class="btn" href="mailto:${D.info.email}">${I.mail}E-mail</a>
          <button class="btn" data-act="office-map">${I.pin}Kde je</button>
        </div>
      </div>
      <h3 class="h3">Služby</h3>
      <div class="card"><ul class="list">
        <li><span class="li-i">${I.doc}</span><span><b>Pronájem hrobového místa</b><small>Nová smlouva i prodloužení. Aktuálně ${free} volných míst. <button class="link" data-act="show-free">Ukázat na mapě</button></small></span></li>
        <li><span class="li-i">${I.leaf}</span><span><b>Údržba a úklid hrobů</b><small>Jednorázově nebo pravidelně, včetně výsadby a dušičkové výzdoby.</small></span></li>
        <li><span class="li-i">${I.cal}</span><span><b>Obřadní síň</b><small>Rezervace termínu smutečního obřadu přes pohřební službu.</small></span></li>
        <li><span class="li-i">${I.info}</span><span><b>Exhumace a uložení uren</b><small>Kolumbárium, urnový háj, rozptylová loučka.</small></span></li>
      </ul></div>
      <h3 class="h3">Ceník nájmu · ilustrativní</h3>
      <div class="card"><div class="kv">
        <span>Hrob (10 let)</span><b>dle ceníku</b>
        <span>Dvojhrob (10 let)</span><b>dle ceníku</b>
        <span>Urnové místo (10 let)</span><b>dle ceníku</b>
        <span>Služby spojené s nájmem</span><b>dle ceníku</b>
      </div></div>
      <h3 class="h3">Dokumenty</h3>
      <div class="card"><ul class="list">
        <li><span class="li-i">${I.doc}</span><span><b>Řád veřejného pohřebiště</b><small>PDF · doplní správa</small></span></li>
        <li><span class="li-i">${I.doc}</span><span><b>Žádost o pronájem hrobového místa</b><small>PDF · doplní správa</small></span></li>
      </ul></div>
      <p class="fine">Obsah sekce je ukázkový a doplní jej správa hřbitova.</p>`;
  }

  function vAccount() {
    if (!state.user) {
      return `
        <button class="back" data-act="home">${I.back}Úvod</button>
        <div class="hero-acc">
          <div class="eyebrow" style="color:rgba(245,240,230,.6)">Pro registrované</div>
          <div class="h2">Vzpomínky na jednom místě</div>
          <p>Uložte si hroby svých blízkých, nechte si připomínat výročí a o konci nájmu se dozvíte včas.</p>
          <button class="btn" data-act="login">Vyzkoušet ukázkový účet</button>
        </div>
        <div class="card" style="margin-top:14px"><ul class="list">
          <li><span class="li-i">${I.star}</span><span><b>Moje hroby</b><small>Rychlý přístup a navigace jedním dotykem, i v kiosku přes QR.</small></span></li>
          <li><span class="li-i">${I.bell}</span><span><b>Upozornění na konec nájmu</b><small>E-mail a SMS 90 dní předem. Prodloužení online.</small></span></li>
          <li><span class="li-i">${I.cal}</span><span><b>Připomínky výročí</b><small>Narozeniny a výročí úmrtí blízkých.</small></span></li>
          <li><span class="li-i">${I.card}</span><span><b>Platby online</b><small>Nájemné a služby bez cesty do kanceláře.</small></span></li>
          <li><span class="li-i">${I.leaf}</span><span><b>Objednávka služeb</b><small>Úklid hrobu, výsadba, dušičková svíčka, s fotkou po dokončení.</small></span></li>
          <li><span class="li-i">${I.candle}</span><span><b>Virtuální svíčka</b><small>Zapalte svíčku na dálku. Uvidí ji celá rodina.</small></span></li>
        </ul></div>
        <p class="fine">Ukázka · v ostrém provozu přihlášení přes BankID / NIA</p>`;
    }
    const own = D.graves.find((g) => g.sec === 'XII' && g.type === 'dvojhrob' && g.status === 'obsazeno') || D.graves.find((g) => g.status === 'obsazeno');
    const mine = [own.id, ...state.favs.filter((id) => id !== own.id)];
    const soon = new Date(); soon.setMonth(soon.getMonth() + 5);
    const ps = D.byGrave[own.id];
    return `
      <button class="back" data-act="home">${I.back}Úvod</button>
      <div class="eyebrow">Ukázkový účet</div>
      <div class="h2">Dobrý den</div>
      <div class="alert">${I.bell}<div><b>Nájem hrobu ${graveCode(own)} končí ${soon.getDate()}. ${soon.getMonth() + 1}. ${soon.getFullYear()}</b>Prodloužení vyřídíte online za pár minut.<br><button class="btn accent" data-act="demo" data-msg="Platební brána bude napojena na systém správy hřbitova.">Prodloužit nájem online</button></div></div>
      <h3 class="h3">Moje hroby</h3>
      <ul class="results">${mine.map((id) => {
        const g = D.graveById[id], p = D.byGrave[id];
        const nm = p.length ? p.map((x) => `${x.first} ${x.last}`).join(', ') : 'Hrobové místo';
        return `<li><button class="result" data-act="grave" data-id="${id}"><span class="r-name">${esc(nm)}</span><span class="r-years">${id === own.id ? 'Nájemce · ' : 'Uloženo · '}${TYPE[g.type]}</span><span class="r-loc">${graveCode(g)}</span></button></li>`;
      }).join('')}</ul>
      ${state.favs.length ? '' : '<p class="fine" style="text-align:left">Tip: v detailu hrobu klepněte na „Uložit“ a hrob se objeví tady.</p>'}
      <h3 class="h3">Připomínky</h3>
      <div class="card">
        ${ps.slice(0, 2).map((p) => `<label class="toggle"><span>Výročí úmrtí · ${esc(p.first)} ${esc(p.last)} (${fmt(p.died).replace(/ \d{4}$/, '')})</span><span class="switch"><input type="checkbox" checked><i></i></span></label>`).join('')}
        <label class="toggle"><span>Upozornění na konec nájmu (SMS)</span><span class="switch"><input type="checkbox" checked><i></i></span></label>
        <label class="toggle"><span>Novinky ze správy hřbitova</span><span class="switch"><input type="checkbox"><i></i></span></label>
      </div>
      <h3 class="h3">Objednat službu</h3>
      <div class="tiles" style="margin-top:0">
        <button class="tile" data-act="demo" data-msg="Objednávka úklidu odeslána (ukázka)."><span class="ti">${I.leaf}</span><span><b>Úklid hrobu</b><small>s fotkou po dokončení</small></span></button>
        <button class="tile accent" data-act="demo" data-msg="Dušičková výzdoba objednána (ukázka)."><span class="ti">${I.candle}</span><span><b>Dušičková výzdoba</b><small>věnec + svíčka</small></span></button>
      </div>
      <button class="btn wide" style="width:100%" data-act="logout">Odhlásit ukázkový účet</button>`;
  }

  const PANOS = D.pois.filter((p) => p.t === 'pano');
  function vPano() {
    return `
      <button class="back" data-act="home">${I.back}Úvod</button>
      <div class="h2">Panorama 360°</div>
      <p class="lede">Projděte si hřbitov virtuálně. Sférické snímky z klíčových míst areálu připravujeme ve spolupráci s DigiDay.</p>
      <div class="pano-hero"><span class="tag">Připravujeme</span><div class="hz"></div><div class="ring">360°</div></div>
      <h3 class="h3">Stanoviště</h3>
      <ul class="results">${PANOS.map((p) => `<li><button class="result" data-act="pano" data-i="${p.pano}"><span class="r-name">${esc(p.label)}</span><span class="r-years">Snímek bude doplněn</span><span class="r-loc">${I.pano.replace('<svg', '<svg width="16" height="16"')}</span></button></li>`).join('')}</ul>`;
  }

  // ---------- Karta s časem chůze na mapě ----------
  function updateChip() {
    const chip = $('#routeChip');
    if (state.view !== 'grave' || !state.route || !state.route.ok) { chip.hidden = true; return; }
    const r = state.route, g = state.grave;
    const from = r.gate === 'gps' ? 'od vás' : 'od ' + (D.GATES[r.gate] || {}).gen;
    chip.innerHTML = `<span class="rc-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg></span><span><b>${r.min} ${r.min === 1 ? 'MINUTA' : r.min <= 4 ? 'MINUTY' : 'MINUT'}</b><small>${r.m} m ${esc(from)} · hrob ${esc(g.id)}</small></span>`;
    chip.hidden = false;
    chip.classList.remove('pop'); void chip.offsetWidth; chip.classList.add('pop');
  }

  // ---------- Detail hrobu ----------
  function openGrave(id, opts) {
    const g = D.graveById[id];
    if (!g) return;
    state.grave = g;
    state.from = (opts && opts.from) || (state.view === 'grave' ? state.from : state.view);
    state.route = D.route(g.id, state.start, state.here);
    show('grave');
    const ps = D.byGrave[g.id];
    const label = g.status === 'volne' ? 'Volné místo' : ps.length ? (ps.length > 1 ? `Rodina ${familyName(ps)}` : `${ps[0].first} ${ps[0].last}`) : graveCode(g);
    map.select(g, label);
    if (state.from !== 'results') map.highlight(null);
    if (mobile()) setSheet('mid');
    setTimeout(() => map.showRoute(state.route), 0);
    history.replaceState(null, '', hashFor(g));
  }

  function openPoi(p) {
    if (p.t === 'pano') { openPanoModal(p.pano); return; }
    if (p.t === 'office') { show('sprava'); return; }
    if (p.t === 'chapel') { show('pohrby'); return; }
    toast(p.label);
  }

  // ---------- QR ----------
  function shareUrl() {
    const g = state.grave;
    const base = location.href.split('#')[0].replace(/[?&]kiosk[^&]*/, '').replace(/\?$/, '');
    return base + hashFor(g, true);
  }
  function openQr() {
    const url = shareUrl();
    const g = state.grave;
    modal(`
      <div class="eyebrow">Hrob ${graveCode(g)}</div>
      <div class="h2">Trasa do telefonu</div>
      <p class="lede" style="margin:0">Naskenujte kód fotoaparátem. Trasa se otevře v mobilu a povede vás krok za krokem.</p>
      <div class="qr-wrap"><div class="qr-box" id="qrBox"></div></div>
      <div class="qr-steps"><div><span>1</span>Otevřete fotoaparát</div><div><span>2</span>Namiřte na kód</div><div><span>3</span>Jděte podle mapy</div></div>
      <div class="qr-url">${esc(url)}</div>
      ${location.protocol === 'file:' ? '<div class="warn">Aplikace běží z disku. Aby QR fungoval v telefonu, nasaďte ji na web nebo spusťte místní server.</div>' : ''}
      ${navigator.share && !KIOSK ? '<button class="btn primary wide" style="width:100%;margin-top:14px" data-act="share">Sdílet odkaz</button>' : ''}`);
    const box = $('#qrBox');
    if (window.QRCode) {
      new window.QRCode(box, { text: url, width: 440, height: 440, colorDark: '#1D2620', colorLight: '#ffffff', correctLevel: window.QRCode.CorrectLevel.M });
    } else {
      box.innerHTML = '<p style="width:220px;text-align:center;color:#868B82">QR knihovna se nenačetla (offline). Použijte odkaz níže.</p>';
    }
  }

  function openPanoModal(i) {
    const p = PANOS.find((x) => x.pano === i) || PANOS[0];
    modal(`<div class="eyebrow">Panorama 360°</div><div class="h2">${esc(p.label)}</div>
      <div class="pano-hero"><span class="tag">Připravujeme · DigiDay</span><div class="hz"></div><div class="ring">360°</div></div>
      <p class="lede" style="margin-top:14px">Sférický snímek tohoto stanoviště doplníme po fotografování areálu. Prohlídka poběží přímo v mapě, bez instalace.</p>`);
  }

  // ---------- Modal, toast ----------
  const modalEl = $('#modal');
  function modal(html) { $('#modalBody').innerHTML = html; modalEl.hidden = false; }
  function closeModal() { modalEl.hidden = true; $('#modalBody').innerHTML = ''; }
  modalEl.addEventListener('click', (e) => { if (e.target === modalEl) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (!modalEl.hidden) closeModal(); else if (state.view === 'grave' && !GUIDE) back(); } });
  let toastT;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600);
  }

  function back() {
    const f = state.from;
    state.grave = null;
    if (f === 'results' && state.res) { show('results'); const ids = new Set(state.res.kind === 'graves' ? state.res.items.map((g) => g.id) : state.res.items.map((p) => p.grave)); map.highlight(ids.size < 400 ? ids : null); }
    else if (f && f !== 'grave' && f !== 'home') show(f);
    else { show('home'); map.fit(); }
  }

  // ---------- Akce ----------
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]');
    if (!a) {
      if (!e.target.closest('#layersPop') && !e.target.closest('#layersBtn')) { $('#layersPop').hidden = true; $('#layersBtn').classList.remove('on'); }
      return;
    }
    const act = a.dataset.act;
    if (a.tagName === 'A' && act === 'home') { e.preventDefault(); if (GUIDE) return; }
    switch (act) {
      case 'home': q.value = ''; state.res = null; $('#clearBtn').hidden = true; show('home'); map.fit(); break;
      case 'view': show(a.dataset.v); break;
      case 'example': q.value = a.dataset.q; runSearch(); if (mobile()) setSheet('mid'); break;
      case 'grave': openGrave(a.dataset.id, { from: state.view }); break;
      case 'back': back(); break;
      case 'clear': q.value = ''; state.filters = { sec: '', from: '', to: '' }; $('#fSec').value = ''; $('#fFrom').value = ''; $('#fTo').value = ''; runSearch(); show('home'); map.fit(); break;
      case 'more': state.resLimit += 60; show('results'); break;
      case 'filters': {
        const f = $('#filters'); f.hidden = !f.hidden; a.classList.toggle('on', !f.hidden); a.setAttribute('aria-expanded', String(!f.hidden));
        if (mobile() && !f.hidden && state.sheet === 'min') setSheet('mid');
        break;
      }
      case 'start':
        state.start = a.dataset.s; if (state.start !== 'gps') store.set('start', state.start);
        state.route = D.route(state.grave.id, state.start, state.here);
        body.querySelector('.view').innerHTML = vGrave();
        updateChip();
        map.showRoute(state.route);
        history.replaceState(null, '', hashFor(state.grave));
        break;
      case 'qr': openQr(); break;
      case 'guide-locate': {
        const lb = $('#locateBtn');
        if (watchId == null) locate(lb);
        if (state.here) { state.start = 'gps'; state.route = D.route(state.grave.id, 'gps', state.here); body.querySelector('.view').innerHTML = vGrave(); map.showRoute(state.route, true); }
        else toast('Zjišťuji vaši polohu…');
        break;
      }
      case 'guide-exit': setGuide(false); openGrave(state.grave.id, { from: 'home' }); break;
      case 'share': navigator.share({ title: 'Trasa k hrobu', url: shareUrl() }).catch(() => {}); break;
      case 'fav': {
        const id = state.grave.id, i = state.favs.indexOf(id);
        if (i >= 0) state.favs.splice(i, 1); else state.favs.push(id);
        store.set('favs', state.favs);
        body.querySelector('.view').innerHTML = vGrave();
        toast(i >= 0 ? 'Odebráno z Mých hrobů' : state.user ? 'Uloženo do Mých hrobů' : 'Uloženo v tomto zařízení · s účtem i v telefonu');
        break;
      }
      case 'candle': {
        const id = state.grave.id, i = state.candles.indexOf(id);
        if (i >= 0) state.candles.splice(i, 1); else state.candles.push(id);
        store.set('candles', state.candles);
        map.setCandles(state.candles);
        body.querySelector('.view').innerHTML = vGrave();
        if (i < 0) toast('Svíčka hoří · na mapě ji uvidí i ostatní');
        break;
      }
      case 'interest': toast('Děkujeme. Správa hřbitova se vám ozve (ukázka).'); break;
      case 'fun-map': openGrave(a.dataset.id, { from: 'pohrby' }); break;
      case 'office-map': map.flyTo({ x: 780, y: 860, w: 220, h: 150 }, 5); if (mobile()) setSheet('min'); break;
      case 'show-free': {
        const ids = new Set(D.graves.filter((g) => g.status === 'volne').map((g) => g.id));
        map.highlight(ids); map.fit(); toast(`${ids.size} volných míst zvýrazněno na mapě`);
        if (mobile()) setSheet('min');
        break;
      }
      case 'login': state.user = { demo: true }; store.set('user', state.user); $('#accLabel').textContent = 'Účet'; show('ucet'); toast('Přihlášeno do ukázkového účtu'); break;
      case 'logout': state.user = null; store.set('user', null); $('#accLabel').textContent = 'Můj účet'; show('ucet'); break;
      case 'demo': toast(a.dataset.msg || 'Ukázka funkce'); break;
      case 'pano': openPanoModal(+a.dataset.i); break;
      case 'close': closeModal(); break;
      case 'menu': $('#topnav').classList.toggle('open'); break;
      case 'zoom-in': map.animateZoom(1.7); break;
      case 'zoom-out': map.animateZoom(1 / 1.7); break;
      case 'fit': map.fit(); break;
      case 'locate': locate(a); break;
      case 'layers': { const p = $('#layersPop'); p.hidden = !p.hidden; a.classList.toggle('on', !p.hidden); break; }
    }
  });
  document.querySelectorAll('#layersPop input').forEach((inp) => inp.addEventListener('change', () => map.setLayer(inp.dataset.layer, inp.checked)));

  // ---------- GPS poloha (WGS84 -> S-JTSK -> mapa) ----------
  let watchId = null;
  const KROVAK = '+proj=krovak +lat_0=49.5 +lon_0=24.83333333333333 +alpha=30.28813972222222 +k=0.9999 +x_0=0 +y_0=0 +ellps=bessel +towgs84=570.8,85.7,462.8,4.998,1.587,5.261,3.56 +units=m +no_defs';
  function toMap(lat, lon) {
    const [x, y] = window.proj4('EPSG:4326', KROVAK, [lon, lat]);
    // proj4 vrací kladné (Y, X) Křovákovy souřadnice; EPSG:5514 = (-Y, -X)
    const ex = x > 0 ? -x : x, ny = y > 0 ? -y : y;
    return D.fromSJTSK(ex, ny);
  }
  function locate(btn) {
    if (watchId != null) { navigator.geolocation.clearWatch(watchId); watchId = null; btn.classList.remove('on'); map.youAreHere(null); state.here = null; if (state.start === 'gps') state.start = 'auto'; return; }
    if (!navigator.geolocation || !window.proj4) { toast('Poloha není v tomto zařízení dostupná'); return; }
    btn.classList.add('on');
    let first = true;
    watchId = navigator.geolocation.watchPosition((pos) => {
      const p = toMap(pos.coords.latitude, pos.coords.longitude);
      const inside = p.x > 0 && p.y > 0 && p.x < D.W && p.y < D.H;
      if (!inside) {
        if (first) toast('Jste mimo areál hřbitova. Poloha se zobrazí, až budete uvnitř.');
        first = false; return;
      }
      map.youAreHere(p, 'Vy');
      const moved = !state.here || Math.hypot(state.here.x - p.x, state.here.y - p.y) > 50;
      state.here = p;
      if (state.view === 'grave' && state.grave && (first || (state.start === 'gps' && moved))) {
        state.start = 'gps';
        state.route = D.route(state.grave.id, 'gps', p);
        body.querySelector('.view').innerHTML = vGrave();
        updateChip();
        map.showRoute(state.route, first);
      } else if (first) map.flyTo({ x: p.x - 250, y: p.y - 200, w: 500, h: 400 }, 14);
      first = false;
    }, () => { toast('Polohu se nepodařilo zjistit'); btn.classList.remove('on'); watchId = null; }, { enableHighAccuracy: true, maximumAge: 5000 });
  }

  // ---------- Táhlo bottom sheetu ----------
  (function () {
    const h = $('#handle');
    let y0 = null, h0 = 0, moved = 0;
    h.addEventListener('pointerdown', (e) => { y0 = e.clientY; h0 = panel.getBoundingClientRect().height; moved = 0; panel.classList.add('dragging'); h.setPointerCapture(e.pointerId); });
    h.addEventListener('pointermove', (e) => {
      if (y0 == null) return;
      const nh = Math.max(120, Math.min(window.innerHeight - 70, h0 + (y0 - e.clientY)));
      moved = Math.abs(e.clientY - y0);
      setSheet(state.sheet, nh);
    });
    const end = (e) => {
      if (y0 == null) return;
      panel.classList.remove('dragging');
      const cur = panel.getBoundingClientRect().height;
      y0 = null;
      if (moved < 6) { setSheet(state.sheet === 'min' ? 'mid' : state.sheet === 'mid' ? 'max' : 'min'); return; }
      const opts = ['min', 'mid', 'max'].map((s) => [s, Math.abs(sheetPx(s) - cur)]).sort((a, b) => a[1] - b[1]);
      setSheet(opts[0][0]);
    };
    h.addEventListener('pointerup', end);
    h.addEventListener('pointercancel', end);
  })();
  window.addEventListener('resize', () => setSheet(state.sheet));

  // ---------- Kiosk: návrat na úvod po nečinnosti ----------
  if (KIOSK) {
    let idleT, overlay, cd;
    const reset = () => {
      clearTimeout(idleT);
      idleT = setTimeout(() => {
        if (state.view === 'home' && !q.value) return reset();
        overlay = document.createElement('div');
        overlay.className = 'idle';
        let n = 10;
        overlay.innerHTML = `<div><div class="h2">Jste tu ještě?</div><div class="count">${n}</div><button class="btn accent" data-act="stay">Ano, pokračovat</button></div>`;
        document.body.appendChild(overlay);
        cd = setInterval(() => {
          n--; overlay.querySelector('.count').textContent = n;
          if (n <= 0) { clearInterval(cd); overlay.remove(); overlay = null; closeModal(); q.value = ''; state.res = null; show('home'); map.fit(); reset(); }
        }, 1000);
      }, 90000);
    };
    document.addEventListener('pointerdown', (e) => {
      if (overlay) { clearInterval(cd); overlay.remove(); overlay = null; e.stopPropagation(); }
      reset();
    }, true);
    document.addEventListener('keydown', reset, true);
    reset();
  }

  // ---------- Start ----------
  $('#cemName').textContent = D.info.name;
  const todayCount = D.funerals.filter((f) => f.date === D.iso(new Date())).length;
  $('#funBadge').textContent = todayCount ? todayCount : '';
  $('#funBadge').hidden = !todayCount;
  if (state.user) $('#accLabel').textContent = 'Účet';
  setSheet('min');

  function applyHash() {
    const hp = new URLSearchParams(location.hash.slice(1));
    const hrob = hp.get('hrob');
    if (D.GATES[hp.get('start')] || hp.get('start') === 'auto') state.start = hp.get('start');
    if (hrob) {
      const g = D.graveById[hrob] || D.graves.find((x) => x.id.toUpperCase() === hrob.toUpperCase());
      if (g) { setGuide(hp.has('p') && !KIOSK); openGrave(g.id, { from: 'home' }); return true; }
      setGuide(false);
    }
    const v = hp.get('v');
    setGuide(false);
    if (v && ['pohrby', 'sprava', 'ucet', 'panorama'].includes(v)) { show(v, { keepHash: true }); return true; }
    return false;
  }
  if (!applyHash()) show('home');
  window.addEventListener('hashchange', applyHash);
})();
