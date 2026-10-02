# **ALARMCLOCK**
ADHD-TIMER OCH VÄCKARKLOCKA MED FÄRGKODADE SYSSLOR OCH DELBAR KALENDER.

- Live (lokalt läge, sparas i webbläsaren): https://0rexin.github.io/alarmclock/
- Alla funktioner och endpoints listas i `docs/index.json` (servern svarar även på `/index.json`).

*ALSO SEE: `docs/cal.js` håller all logik — samma kod körs i webbläsaren och på servern.*

---

## **KÖR SERVERN**
`just run` STARTAR DELAT LÄGE PÅ PORT 8787 — SKRIVER UT LAN- OCH WEBCAL-ADRESSER.

- Alla på samma nätverk öppnar `http://<datorns-ip>:8787` och delar samma kalender och historik.
- Prenumerera i Kalender på iPhone/Mac via `webcal://<datorns-ip>:8787/cal.ics?cat=hem,jobb` — filtret följer med.
- Samma data som JSON på `/cal.json`; `?by=Namn` filtrerar på vem som senast ändrade.
- Tillståndet sparas i `data/db.json`, som inte checkas in.
- `just index` bygger om `docs/index.json` efter ändringar i `docs/cal.js`.

*CAREFUL: servern nekar allt utom loopback, LAN, link-local och Tailscale — ingen inloggning, så exponera den aldrig via port forwarding.*

---

## **FUNKTIONER**
SEX KATEGORIER MED FASTA FÄRGER: HEM, ÄRENDEN, MÄNNISKOR, SKOLA, JOBB, PRIVAT.

- **Snabbval** — gym, handla, sophantering, städ, disk, organisering, tvätt, dammsugning, moppa golv, torka ytor, städa badrum, byta sängkläder och väckning, var och en med standardlängd och upprepning.
- **Timer** — krympande pastellcirkel; ▶ på en syssla startar den med sysslans längd och färg.
- **Larm** — ljud, vibration och helskärm med snooze 5 min; i prenumererade kalendrar ringer `VALARM` även när sidan är stängd.
- **Claude-gräns** — tryck 25/50/75/100 % för 5-timmarsfönstret eller 50/100 % för 7 dagar; appen håller starttiden och lägger in ett larm när fönstret återställs.
- **Kalender** — filtrera, ladda ner `.ics`/`.json`, dela länk, prenumerera, slå ihop fil, delad länk eller URL.
- **Historik** — varje ändring loggas med namn och tid; en användare är bara ett namn.

*CAREFUL: på GitHub Pages finns ingen server — delning sker via data i länken (`#d=`) och prenumeration kräver `just run`.*
