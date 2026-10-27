# Tichá cesta · navigace hřbitovem (prototyp)

Prezentační prototyp aplikace pro vyhledání hrobu a navigaci v areálu **hřbitova Vítkovice**.
Bez build kroku: čisté HTML, CSS a JS, mapa ve vlastním SVG.

**Online ukázka:** https://ramirroendetry.github.io/Navigace-hrbitov/
· kiosk: https://ramirroendetry.github.io/Navigace-hrbitov/?kiosk
· přímý odkaz na hrob: https://ramirroendetry.github.io/Navigace-hrbitov/#hrob=XII-28-93

## Spuštění lokálně

```bash
python -m http.server 5173 --bind 0.0.0.0
```

- Web: http://localhost:5173
- Kiosk (dotyková obrazovka u brány): http://localhost:5173/?kiosk
- Přímý odkaz na hrob (cíl QR kódu): http://localhost:5173/#hrob=XII-28-93

## Co prototyp umí

- Skutečný půdorys hřbitova: 37 sekcí, 11 547 hrobů, chodníky, zdi, ploty, budovy, stromy, voda, koše, lavičky, kříže. Posun, zoom, pinch, vrstvy, měřítko, čísla hrobů při přiblížení.
- Jedno chytré vyhledávací pole: jméno (bez diakritiky), rok úmrtí, datum `12. 4. 1987`, číslo hrobu `XII-28-93`, `sekce XIX-O`. Filtry podle sekce a rozsahu let.
- Trasa ke každému hrobu po skutečných cestách (A* na mřížce 0,4 m), ze tří vchodů, krok za krokem se vzdáleností a časem chůze.
- GPS poloha v telefonu (WGS84 → S-JTSK přes proj4).
- QR kód „Trasa do telefonu“ (kiosk → mobil), sdílení odkazu.
- Pohřby, správa hřbitova, volná místa na mapě, výhody pro registrované (ukázkový účet), virtuální svíčka.
- Panorama 360°: stanoviště na mapě, připraveno pro snímky od DigiDay.
- Kiosk režim: větší ovládání, značka „Vy jste zde“, návrat na úvod po nečinnosti.

## Data

- `data/vitkovice.js`: půdorys, sekce a hrobová místa z veřejné služby ASGIS Ostrava
  (pasport hřbitova, geodetické zaměření DIGIS, spol. s r.o., 12/2025), převedené nástrojem `tools/asgis_import.py`.
- **Jména a data zemřelých jsou fiktivní.** Evidence osob ve veřejné službě není, doplní se od správy.
- Kontakty a ceník jsou zástupné.

Obnovení dat (vyžaduje Python a `shapely`):

```bash
python tools/asgis_import.py --fetch --raw raw-data
python tools/asgis_import.py --raw raw-data --out data/vitkovice.js
```

Stejný postup jde použít pro další hřbitovy v systému HřbitovServer (DIGIS).
