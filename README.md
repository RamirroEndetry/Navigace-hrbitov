# Tichá cesta · navigace hřbitovem (prototyp)

Prezentační prototyp aplikace pro vyhledání hrobu a navigaci v areálu hřbitova.
Bez build kroku: čisté HTML, CSS a JS, mapa ve vlastním SVG.

**Online ukázka:** https://ramirroendetry.github.io/Navigace-hrbitov/
· kiosk: https://ramirroendetry.github.io/Navigace-hrbitov/?kiosk
· přímý odkaz na hrob: https://ramirroendetry.github.io/Navigace-hrbitov/#hrob=C-2-5

## Spuštění lokálně

```bash
python -m http.server 5173 --bind 0.0.0.0
```

- Web: http://localhost:5173
- Kiosk (dotyková obrazovka u brány): http://localhost:5173/?kiosk
- Přímý odkaz na hrob (cíl QR kódu): http://localhost:5173/#hrob=C-2-5

Aby QR kód fungoval v telefonu, musí telefon na adresu dosáhnout. Buď nasaďte aplikaci na web,
nebo otevřete `http://<IP-počítače>:5173` na stejné Wi-Fi.

## Co prototyp umí

- Mapa hřbitova: oddělení, řady, hroby, aleje, stromy, budovy, voda, kontejnery, WC, lavičky. Posun, zoom, pinch, vrstvy, měřítko.
- Jedno chytré vyhledávací pole: jméno (bez diakritiky), rok úmrtí, datum `12. 4. 1987`, roky `1921 1998`, číslo hrobu `C-2-5`, `oddělení K`. Filtry podle oddělení a rozsahu let.
- Detail hrobu s trasou krok za krokem a názvy alejí, z hlavního nebo bočního vchodu, se vzdáleností a časem chůze.
- QR kód „Trasa do telefonu“ (kiosk → mobil), sdílení odkazu.
- Pohřby: rozpis obřadů na dnešek a další dny.
- Správa hřbitova: otevírací doba, úřední hodiny, služby, ceník, dokumenty, volná místa na mapě.
- Výhody pro registrované (ukázkový účet): moje hroby, upozornění na konec nájmu, připomínky výročí, objednání služeb, virtuální svíčka.
- Panorama 360°: stanoviště na mapě, připraveno pro snímky od DigiDay.
- Kiosk režim: větší ovládání, značka „Vy jste zde“, návrat na úvod po nečinnosti.

## Data

`js/data.js` generuje **fiktivní** demonstrační data (jména, data, hroby) a obsahuje trasovací graf.
Kontakty a ceník jsou zástupné. Pro ostrý provoz se tato vrstva napojí na evidenci hrobů
(export z ASGIS / DIGIS) a mapový podklad se převezme z jejich geometrie.
