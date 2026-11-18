# Sorjában

Havi beosztás a streaming-előfizetésekhez: felírod, mit néznél meg, az oldal megmondja, melyik hónapban melyik szolgáltatásra fizess elő, és mikor mondd le.

- Oldal: `docs/` (statikus, GitHub Pages szolgálja ki)
- Adatfrissítés: `pipeline/fetch.py`, naponta fut a `napi-frissites` workflow-ban
- Árak: `docs/data/prices.json`, kézzel karbantartva

## Adatforrások

| Forrás | Mit ad | Megjegyzés |
| --- | --- | --- |
| JustWatch (HU) | címek, platformok, magyar hang és felirat, lekerülési dátum | nem hivatalos felület; fizetős termékhez hivatalos adat kell |
| RTL+ műsortérkép | RTL+ műsorok, Premium-jelölés | `sitemap-program.xml`, a robots.txt engedi |

A Netflix és a SkyShowtime hangsáv-adatait a JustWatch nem adja meg. A Netflix robots.txt-je az általános robotokat kitiltja, ezért a címoldalait nem gyűjtjük. A TV2 Play adatfelületét (`/api/`) szintén tiltja a robots.txt.

`probe/` – az első adatforrás-próbák, csak kézzel indíthatók.
