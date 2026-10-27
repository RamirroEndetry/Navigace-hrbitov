/* Tichá cesta — datová vrstva a trasování.
   Všechna jména, data a hrobová místa jsou GENEROVANÁ a FIKTIVNÍ (demonstrační data).
   V ostrém provozu se tato vrstva nahradí napojením na evidenci hrobů (ASGIS / DIGIS export). */
(function () {
  'use strict';

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

  // ---------- Geometrie areálu (1 jednotka ≈ 0,45 m) ----------
  const M_PER_UNIT = 0.45;
  const W = 1600, H = 1120;
  const XS = [170, 480, 800, 1120, 1430];
  const YS = [210, 460, 710, 880];
  const WALL = { x: 70, y: 70, w: 1460, h: 890 };
  const GATES = {
    main: { x: 800, y: 968, label: 'Hlavní vchod', short: 'hlavním vchodem' },
    side: { x: 60, y: 460, label: 'Boční vchod', short: 'bočním vchodem' }
  };
  const ALLEY_X = {
    170: { nom: 'Západní cesta', acc: 'na Západní cestu', ins: 'Západní cestou' },
    480: { nom: 'Lipová alej', acc: 'do Lipové aleje', ins: 'Lipovou alejí' },
    800: { nom: 'Hlavní alej', acc: 'do Hlavní aleje', ins: 'Hlavní alejí' },
    1120: { nom: 'Javorová alej', acc: 'do Javorové aleje', ins: 'Javorovou alejí' },
    1430: { nom: 'Východní cesta', acc: 'na Východní cestu', ins: 'Východní cestou' }
  };
  const ALLEY_Y = {
    210: { nom: 'Horní alej', acc: 'do Horní aleje', ins: 'Horní alejí' },
    460: { nom: 'Příčná alej', acc: 'do Příčné aleje', ins: 'Příčnou alejí' },
    710: { nom: 'Březová alej', acc: 'do Březové aleje', ins: 'Březovou alejí' },
    880: { nom: 'Dolní cesta', acc: 'na Dolní cestu', ins: 'Dolní cestou' }
  };

  // ---------- Jména ----------
  const MALE = ['Jan', 'Josef', 'Jiří', 'Karel', 'Václav', 'František', 'Miroslav', 'Zdeněk', 'Ladislav', 'Antonín', 'Stanislav', 'Jaroslav', 'Milan', 'Vladimír', 'Bohumil', 'Oldřich', 'Rudolf', 'Emil', 'Ludvík', 'Vojtěch', 'Pavel', 'Petr', 'Leoš', 'Bedřich', 'Alois', 'Otakar', 'Radek', 'Tomáš', 'Martin', 'Lumír', 'Bohuslav', 'Vilém'];
  const FEMALE = ['Marie', 'Anna', 'Jana', 'Věra', 'Ludmila', 'Božena', 'Jarmila', 'Zdeňka', 'Helena', 'Libuše', 'Milada', 'Dagmar', 'Eva', 'Hana', 'Vlasta', 'Jiřina', 'Olga', 'Irena', 'Alžběta', 'Růžena', 'Emilie', 'Drahomíra', 'Květoslava', 'Jaroslava', 'Blanka', 'Ilona', 'Renata', 'Kamila', 'Taťána', 'Pavla', 'Anežka', 'Hedvika'];
  const SURN = [['Novák', 'Nováková'], ['Dvořák', 'Dvořáková'], ['Černý', 'Černá'], ['Procházka', 'Procházková'], ['Kučera', 'Kučerová'], ['Veselý', 'Veselá'], ['Horák', 'Horáková'], ['Němec', 'Němcová'], ['Pokorný', 'Pokorná'], ['Mareček', 'Marečková'], ['Pospíšil', 'Pospíšilová'], ['Hájek', 'Hájková'], ['Jelínek', 'Jelínková'], ['Král', 'Králová'], ['Růžička', 'Růžičková'], ['Beneš', 'Benešová'], ['Fiala', 'Fialová'], ['Sedláček', 'Sedláčková'], ['Doležal', 'Doležalová'], ['Zeman', 'Zemanová'], ['Kolář', 'Kolářová'], ['Navrátil', 'Navrátilová'], ['Čermák', 'Čermáková'], ['Vaněk', 'Vaňková'], ['Urban', 'Urbanová'], ['Blažek', 'Blažková'], ['Kříž', 'Křížová'], ['Kovář', 'Kovářová'], ['Bartoš', 'Bartošová'], ['Vlček', 'Vlčková'], ['Polák', 'Poláková'], ['Musil', 'Musilová'], ['Kopecký', 'Kopecká'], ['Šimek', 'Šimková'], ['Konečný', 'Konečná'], ['Malý', 'Malá'], ['Holub', 'Holubová'], ['Štěpánek', 'Štěpánková'], ['Kadlec', 'Kadlecová'], ['Dostál', 'Dostálová'], ['Sýkora', 'Sýkorová'], ['Wagner', 'Wagnerová'], ['Kubíček', 'Kubíčková'], ['Matějka', 'Matějková'], ['Ondruš', 'Ondrušová'], ['Mlčoch', 'Mlčochová'], ['Bednář', 'Bednářová'], ['Kaluža', 'Kalužová'], ['Lipina', 'Lipinová'], ['Ševčík', 'Ševčíková'], ['Gajdoš', 'Gajdošová'], ['Sikora', 'Sikorová'], ['Kocur', 'Kocurová'], ['Lasota', 'Lasotová'], ['Kantor', 'Kantorová'], ['Hrabal', 'Hrabalová'], ['Žurek', 'Žurková'], ['Pustka', 'Pustková'], ['Mrózek', 'Mrózková'], ['Szotkowski', 'Szotkowská']];

  const NOW = new Date();
  const CUTOFF = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - 12);
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  function randDate(year) {
    let d = new Date(year, ri(0, 11), ri(1, 28));
    if (d > CUTOFF) d = new Date(CUTOFF.getTime() - ri(1, 300) * 864e5);
    return d;
  }

  // ---------- Oddělení a hroby ----------
  const LETTERS = 'ABCDEFGHIJKL';
  const DEATH_RANGE = [[1932, 1992], [1958, 2016], [1984, NOW.getFullYear()]];
  const sections = [], graves = [], persons = [];
  const graveById = {}, byGrave = {};
  let pid = 0;

  for (let band = 0; band < 3; band++) {
    for (let c = 0; c < 4; c++) {
      const id = LETTERS[band * 4 + c];
      const mL = XS[c] === 800 ? 24 : 20, mR = XS[c + 1] === 800 ? 24 : 20;
      const x0 = XS[c] + mL, x1 = XS[c + 1] - mR, y0 = YS[band] + 20, y1 = YS[band + 1] - 20;
      const sec = { id, x: x0, y: y0, w: x1 - x0, h: y1 - y0, band, col: c, rows: Math.floor((y1 - y0 - 6) / 38), graves: [] };
      for (let r = 0; r < sec.rows; r++) {
        const top = y0 + 6 + r * 38, gapY = top + 30;
        let x = x0 + 6, n = 1;
        for (;;) {
          const t = rnd();
          let type = 'hrob', w = 14, h = 22, ty = top;
          if (t < 0.14) { type = 'dvojhrob'; w = 30; }
          else if (t < 0.19) { type = 'hrobka'; w = 34; }
          else if (t < (band === 2 ? 0.33 : 0.25)) { type = 'urna'; w = 12; h = 12; ty = top + 10; }
          if (x + w > x1 - 6) break;
          const gid = `${id}-${r + 1}-${n}`;
          const g = { id: gid, sec: id, row: r + 1, num: n, type, x, y: ty, w, h, gapY, cx: x + w / 2, band };
          g.ax = (g.cx - x0 < x1 - g.cx) ? XS[c] : XS[c + 1];
          const s = rnd();
          g.status = s < 0.07 ? 'volne' : s < 0.11 ? 'obnova' : 'obsazeno';
          g.lease = g.status === 'obsazeno' ? `${ri(NOW.getFullYear(), NOW.getFullYear() + 10)}-${pad(ri(1, 12))}-${pad(ri(1, 28))}` : null;
          byGrave[gid] = [];
          if (g.status !== 'volne') {
            const fam = pick(SURN);
            const count = type === 'hrobka' ? ri(2, 5) : type === 'dvojhrob' ? ri(2, 3) : rnd() < 0.6 ? 1 : 2;
            const [lo, hi] = DEATH_RANGE[band];
            const d0 = ri(lo, hi);
            let sex = rnd() < 0.5 ? 0 : 1;
            for (let i = 0; i < count; i++) {
              const dy = i === 0 ? d0 : Math.min(hi, d0 + ri(-3, 28));
              const died = randDate(dy);
              const age = rnd() < 0.06 ? ri(19, 47) : ri(52, 97);
              const born = new Date(died.getFullYear() - age, ri(0, 11), ri(1, 28));
              const first = sex ? pick(FEMALE) : pick(MALE);
              const last = fam[sex];
              const p = { id: 'p' + (++pid), first, last, sex, born: iso(born), died: iso(died), grave: gid };
              p.n = norm(first + ' ' + last);
              persons.push(p); byGrave[gid].push(p);
              sex = 1 - sex;
            }
            byGrave[gid].sort((a, b) => a.died.localeCompare(b.died));
          }
          graves.push(g); graveById[gid] = g; sec.graves.push(gid);
          x += w + 6; n++;
        }
      }
      sections.push(sec);
    }
  }
  persons.sort((a, b) => a.last.localeCompare(b.last, 'cs') || a.first.localeCompare(b.first, 'cs') || a.died.localeCompare(b.died));

  // ---------- Stromy (aleje + okraje) ----------
  const trees = [];
  const nearAny = (v, arr, d) => arr.some((a) => Math.abs(a - v) < d);
  for (const y of YS) for (let x = XS[0] + 30; x < XS[4] - 20; x += 44) {
    if (nearAny(x, XS, 34)) continue;
    for (const o of [-17, 17]) if (rnd() < 0.86) trees.push({ x: x + ri(-5, 5), y: y + o + ri(-2, 2), r: ri(7, 10) });
  }
  for (const x of XS) for (let y = YS[0] + 30; y < YS[3] - 20; y += 44) {
    if (nearAny(y, YS, 34)) continue;
    const off = x === 800 ? [-21, 21] : [-17, 17];
    for (const o of off) if (x === 800 || rnd() < 0.8) trees.push({ x: x + o + ri(-2, 2), y: y + ri(-5, 5), r: x === 800 ? 10 : ri(7, 10) });
  }
  // zeleň v horním pásu a u zdi
  for (let i = 0; i < 70; i++) {
    const x = ri(95, 1505), y = ri(88, 188);
    if (Math.abs(x - 800) < 110 || (x > 230 && x < 470 && y > 100) || (x > 1160 && x < 1400)) continue;
    trees.push({ x, y, r: ri(8, 13) });
  }
  for (let i = 0; i < 26; i++) { const y = ri(240, 860); trees.push({ x: ri(84, 100), y, r: ri(7, 11) }); trees.push({ x: ri(1500, 1516), y: ri(240, 860), r: ri(7, 11) }); }

  // ---------- Body zájmu ----------
  const pois = [
    { t: 'chapel', x: 800, y: 150, label: 'Obřadní síň' },
    { t: 'office', x: 905, y: 925, label: 'Správa hřbitova' },
    { t: 'wc', x: 700, y: 925, label: 'WC' },
    { t: 'parking', x: 1010, y: 1062, label: 'Parkoviště' },
    { t: 'memorial', x: 1030, y: 140, label: 'Pietní místo' },
    { t: 'water', x: XS[1] + 18, y: YS[1] + 18, label: 'Voda' },
    { t: 'water', x: XS[3] - 18, y: YS[1] + 18, label: 'Voda' },
    { t: 'water', x: XS[2] + 24, y: YS[2] - 18, label: 'Voda' },
    { t: 'water', x: XS[0] + 18, y: YS[2] + 18, label: 'Voda' },
    { t: 'water', x: XS[4] - 18, y: YS[0] + 18, label: 'Voda' },
    { t: 'water', x: XS[2] - 24, y: YS[0] + 18, label: 'Voda' },
    { t: 'bin', x: XS[1] - 18, y: YS[2] + 18, label: 'Kontejner' },
    { t: 'bin', x: XS[3] + 18, y: YS[2] + 18, label: 'Kontejner' },
    { t: 'bin', x: XS[2] + 24, y: YS[3] - 2, label: 'Kontejner' },
    { t: 'bin', x: XS[0] + 18, y: YS[0] + 18, label: 'Kontejner' },
    { t: 'bench', x: XS[2] - 24, y: YS[1] + 34, label: 'Lavička' },
    { t: 'bench', x: XS[2] + 24, y: YS[1] - 34, label: 'Lavička' },
    { t: 'bench', x: XS[1] + 34, y: YS[2] - 18, label: 'Lavička' },
    { t: 'bench', x: XS[3] - 34, y: YS[0] + 18, label: 'Lavička' },
    { t: 'bench', x: 1270, y: 175, label: 'Lavička' },
    { t: 'pano', x: 800, y: 935, label: 'Hlavní brána', pano: 0 },
    { t: 'pano', x: 800, y: 215, label: 'Před obřadní síní', pano: 1 },
    { t: 'pano', x: 800, y: 460, label: 'Křížení alejí', pano: 2 },
    { t: 'pano', x: 1270, y: 140, label: 'Rozptylová loučka', pano: 3 }
  ];
  const places = [
    { x: 330, y: 160, label: 'Urnový háj' },
    { x: 330, y: 103, label: 'Kolumbárium' },
    { x: 1270, y: 112, label: 'Rozptylová loučka' }
  ];

  // ---------- Trasování ----------
  const nodes = {};
  const node = (x, y) => nodes[x + ',' + y] || (nodes[x + ',' + y] = { x, y, adj: [] });
  const edge = (a, b) => { a.adj.push(b); b.adj.push(a); };
  for (const y of YS) for (let i = 0; i < XS.length - 1; i++) edge(node(XS[i], y), node(XS[i + 1], y));
  for (const x of XS) for (let j = 0; j < YS.length - 1; j++) edge(node(x, YS[j]), node(x, YS[j + 1]));
  edge(node(GATES.main.x, GATES.main.y), node(800, YS[3]));
  edge(node(GATES.side.x, GATES.side.y), node(XS[0], 460));
  edge(node(800, 175), node(800, YS[0]));

  function dijkstra(start) {
    const dist = new Map(), prev = new Map(), open = new Set(Object.values(nodes));
    for (const n of open) dist.set(n, Infinity);
    dist.set(start, 0);
    while (open.size) {
      let u = null;
      for (const n of open) if (!u || dist.get(n) < dist.get(u)) u = n;
      open.delete(u);
      for (const v of u.adj) {
        const alt = dist.get(u) + Math.hypot(u.x - v.x, u.y - v.y);
        if (alt < dist.get(v)) { dist.set(v, alt); prev.set(v, u); }
      }
    }
    return { dist, prev };
  }
  const cache = {};
  function pathTo(startKey, target) {
    const g = GATES[startKey];
    const tree = cache[startKey] || (cache[startKey] = dijkstra(node(g.x, g.y)));
    const out = [];
    for (let n = target; n; n = tree.prev.get(n)) out.unshift({ x: n.x, y: n.y });
    return { pts: out, d: tree.dist.get(target) };
  }

  function simplify(pts) {
    const out = [];
    for (const p of pts) {
      const last = out[out.length - 1];
      if (last && last.x === p.x && last.y === p.y) continue;
      if (out.length >= 2) {
        const a = out[out.length - 2], b = last;
        const cross = (b.x - a.x) * (p.y - b.y) - (b.y - a.y) * (p.x - b.x);
        const dot = (b.x - a.x) * (p.x - b.x) + (b.y - a.y) * (p.y - b.y);
        if (Math.abs(cross) < 0.01 && dot > 0) { out[out.length - 1] = p; continue; }
      }
      out.push(p);
    }
    return out;
  }

  const meters = (u) => Math.max(5, Math.round(u * M_PER_UNIT / 5) * 5);

  function route(graveId, startKey) {
    const g = graveById[graveId];
    startKey = GATES[startKey] ? startKey : 'main';
    let j = 0;
    while (j < YS.length - 2 && g.gapY > YS[j + 1]) j++;
    const A = node(g.ax, YS[j]), B = node(g.ax, YS[j + 1]);
    const pa = pathTo(startKey, A), pb = pathTo(startKey, B);
    const da = pa.d + Math.abs(g.gapY - A.y), db = pb.d + Math.abs(B.y - g.gapY);
    const base = da <= db ? pa.pts : pb.pts;
    const pts = simplify(base.concat([{ x: g.ax, y: g.gapY }, { x: g.cx, y: g.gapY }, { x: g.cx, y: g.y + g.h + 1 }]));

    let total = 0;
    const steps = [{ kind: 'start', text: `Vstupte ${GATES[startKey].short}` }];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      total += len;
      const isLast = i === pts.length - 1;
      if (isLast) break;
      let name;
      if (a.x === b.x && ALLEY_X[a.x] && a.y !== g.gapY) name = ALLEY_X[a.x];
      else if (a.y === b.y && ALLEY_Y[a.y]) name = ALLEY_Y[a.y];
      else name = { acc: `do uličky ${g.row}. řady (oddělení ${g.sec})`, ins: `uličkou ${g.row}. řady` };
      let kind = 'straight', text;
      if (i === 1) text = `Jděte rovně ${name.ins}`;
      else {
        const p = pts[i - 2];
        const cross = (a.x - p.x) * (b.y - a.y) - (a.y - p.y) * (b.x - a.x);
        kind = cross > 0 ? 'right' : 'left';
        text = `Odbočte ${kind === 'right' ? 'vpravo' : 'vlevo'} ${name.acc}`;
      }
      steps.push({ kind, text, m: meters(len) });
    }
    // Hrob leží nad uličkou (sever). Při chůzi na východ je vlevo, na západ vpravo.
    const a = pts[pts.length - 3], b = pts[pts.length - 2];
    const side = b.x >= a.x ? 'levé' : 'pravé';
    steps.push({ kind: 'finish', text: `Hrob č. ${g.num} je po vaší ${side} straně` });
    const m = meters(total);
    return { pts, steps, m, min: Math.max(1, Math.round(m / 70)) };
  }

  // ---------- Pohřby (relativně k dnešku) ----------
  const funerals = [];
  (function () {
    const slots = [[0, '10:00'], [0, '12:30'], [0, '14:00'], [1, '9:30'], [1, '11:00'], [1, '13:30'], [2, '10:30'], [3, '9:00'], [3, '12:00'], [4, '10:00']];
    const recent = graves.filter((g) => g.band === 2 && g.status === 'obsazeno');
    for (const [day, time] of slots) {
      const d = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + day);
      if (d.getDay() === 0) continue;
      const sex = rnd() < 0.5 ? 0 : 1;
      const fam = pick(SURN);
      const age = ri(61, 96);
      const g = pick(recent);
      const urn = rnd() < 0.4;
      funerals.push({
        date: iso(d), time, name: `${sex ? pick(FEMALE) : pick(MALE)} ${fam[sex]}`, age, sex,
        place: urn ? 'Obřadní síň · poté uložení urny' : 'Obřadní síň · poté do hrobu',
        grave: g.id
      });
    }
  })();

  // ---------- Informace o hřbitově (ukázkový obsah) ----------
  const info = {
    name: 'Hřbitov Vítkovice',
    owner: 'Statutární město Ostrava',
    admin: 'Správa hřbitova',
    address: 'Adresa hřbitova · doplní správa',
    phone: '+420 000 000 000',
    email: 'sprava@hrbitov.example',
    office: [['Pondělí', '8:00 – 17:00'], ['Úterý', '8:00 – 14:00'], ['Středa', '8:00 – 17:00'], ['Čtvrtek', '8:00 – 14:00'], ['Pátek', '8:00 – 12:00']]
  };
  function hoursFor(d) {
    const m = d.getMonth(), day = d.getDate();
    if ((m === 9 && day >= 31) || (m === 10 && day <= 2)) return { open: 7, close: 21, note: 'Dušičky – prodloužená doba' };
    if (m >= 3 && m <= 8) return { open: 7, close: 20 };
    return { open: 7, close: 18 };
  }

  window.CEM = {
    W, H, XS, YS, WALL, GATES, ALLEY_X, ALLEY_Y, M_PER_UNIT,
    sections, graves, persons, graveById, byGrave, trees, pois, places, funerals, info,
    route, hoursFor, norm, iso
  };
})();
