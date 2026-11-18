(() => {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const NAP = 86400000;
  const MA = Math.floor(Date.now() / NAP);
  const IDOSZAK = 30;
  const MAX_HONAP = 12;

  const HONAP = ["január", "február", "március", "április", "május", "június", "július",
    "augusztus", "szeptember", "október", "november", "december"];
  const HONAP_ROVID = ["jan.", "febr.", "márc.", "ápr.", "máj.", "jún.", "júl.", "aug.",
    "szept.", "okt.", "nov.", "dec."];
  // a nap utáni rag: 1-jén, 2-án, 5-én ...
  const RAG = ["", "jén", "án", "án", "én", "én", "án", "én", "án", "én", "én",
    "én", "én", "án", "én", "én", "án", "én", "án", "én", "án",
    "én", "én", "án", "én", "én", "án", "én", "án", "én", "án", "én"];
  const MUFAJ = {
    act: "akció", ani: "animáció", cmy: "vígjáték", crm: "krimi", doc: "dokumentum",
    drm: "dráma", eur: "európai", fml: "családi", fnt: "fantasy", hst: "történelmi",
    hrr: "horror", msc: "zenés", rma: "romantikus", scf: "sci-fi", spt: "sport",
    trl: "thriller", war: "háborús", wsn: "western", rly: "valóságshow",
  };

  let KAT = null;       // catalog.json
  let ARAK = {};        // kód -> {price, plan}
  let PL = [];          // platform kódok index szerint
  let NEV = {};         // kód -> név
  let SOR = new Map();  // id -> cím objektum
  let EXTRA = null;     // lusta: leírás + linkek

  const allapot = { lista: [], estek: 8, csakMagyar: false, megvan: [] };

  /* ------------------------------------------------------------ segédek */
  const datum = (n) => new Date(n * NAP);
  const EV = new Date().getFullYear();
  const evvel = (d) => (d.getUTCFullYear() !== EV ? `${d.getUTCFullYear()}. ` : "");
  const rovid = (n, ev = true) => { const d = datum(n); return `${ev ? evvel(d) : ""}${HONAP_ROVID[d.getUTCMonth()]} ${d.getUTCDate()}.`; };
  const ragos = (n) => { const d = datum(n); const nap = d.getUTCDate(); return `${evvel(d)}${HONAP_ROVID[d.getUTCMonth()]} ${nap}-${RAG[nap]}`; };
  const SZAM = ["", "egy", "két", "három", "négy", "öt", "hat", "hét", "nyolc"];
  const ig = (n) => { const d = datum(n); return `${HONAP_ROVID[d.getUTCMonth()]} ${d.getUTCDate()}-ig`; };
  const ft = (x) => `${String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0")}\u00a0Ft`;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const ar = (kod) => (ARAK[kod] ? ARAK[kod].price : 0);
  const felsorol = (t) => t.length < 2 ? t.join("") : `${t.slice(0, -1).join(", ")} és ${t[t.length - 1]}`;

  function uzen(szoveg) {
    const u = $("#uzenet");
    u.textContent = szoveg;
    u.classList.add("latszik");
    clearTimeout(uzen.t);
    uzen.t = setTimeout(() => u.classList.remove("latszik"), 2600);
  }

  function ment() {
    try { localStorage.setItem("sorjaban", JSON.stringify(allapot)); } catch (_) { /* privát mód */ }
  }
  function betolt() {
    try {
      const m = JSON.parse(localStorage.getItem("sorjaban") || "null");
      if (m) Object.assign(allapot, m);
    } catch (_) { /* nincs tároló */ }
    const h = new URLSearchParams(location.hash.slice(1));
    if (h.has("l")) {
      allapot.lista = h.get("l").split(",").filter(Boolean);
      allapot.estek = Math.min(30, Math.max(2, +h.get("e") || 8));
      allapot.csakMagyar = h.get("h") === "1";
      allapot.megvan = (h.get("o") || "").split(",").filter(Boolean);
      history.replaceState(null, "", location.pathname);
    }
  }

  /* ------------------------------------------------------------ adatok */
  function feldolgoz(kat) {
    PL = kat.platforms.map((p) => p.code);
    kat.platforms.forEach((p) => { NEV[p.code] = p.name; });
    kat.titles.forEach((r, i) => {
      const [id, show, cim, eredeti, ev, mufajok, imdb, , , ajanlatok] = r;
      SOR.set(id, {
        id, show: !!show, cim, eredeti, ev, rang: i, imdb,
        mufaj: mufajok.map((g) => MUFAJ[kat.genres[g]]).filter(Boolean),
        kulcs: norm(`${cim} ${eredeti}`),
        aj: ajanlatok.map(([p, f, vege, kezd]) => ({
          kod: PL[p], hang: !!(f & 1), felirat: !!(f & 2), ismert: !!(f & 4), ingyen: !!(f & 8) || ar(PL[p]) === 0, vege, kezd,
        })),
      });
    });
  }

  function nyelv(c) {
    const ism = c.aj.filter((a) => a.ismert);
    if (!ism.length) return "";
    if (ism.some((a) => a.hang)) return "magyar hanggal";
    if (ism.some((a) => a.felirat)) return "magyar felirattal";
    return "csak eredeti nyelven";
  }
  const nincsMagyarHang = (c) => {
    const ism = c.aj.filter((a) => a.ismert);
    return ism.length > 0 && ism.length === c.aj.length && !ism.some((a) => a.hang);
  };

  /* ------------------------------------------------------------ tervező */
  function tervez(ids, estek, megvan) {
    const birtok = new Set(megvan);
    const barmikor = [];
    let marad = [];
    ids.forEach((id) => {
      const c = SOR.get(id);
      if (!c) return;
      const ingyenes = c.aj.find((a) => a.ingyen || birtok.has(a.kod));
      if (ingyenes) { barmikor.push({ c, kod: ingyenes.kod }); return; }
      const fizetos = c.aj.filter((a) => ar(a.kod) > 0);
      if (!fizetos.length) return;
      const utolso = fizetos.some((a) => !a.vege) ? Infinity : Math.max(...fizetos.map((a) => a.vege));
      marad.push({ c, egyseg: c.show ? 4 : 1, fizetos, utolso });
    });

    const honapok = [];
    const kimaradt = [];
    for (let k = 0; k < MAX_HONAP && marad.length; k++) {
      const kezd = MA + k * IDOSZAK;
      const vege = kezd + IDOSZAK - 1;
      // ami már lekerült, mielőtt sorra került volna
      marad = marad.filter((t) => {
        if (t.utolso < kezd) { kimaradt.push(t); return false; }
        return true;
      });
      if (!marad.length) break;

      let legjobb = null;
      const kodok = new Set(marad.flatMap((t) => t.fizetos.map((a) => a.kod)));
      kodok.forEach((kod) => {
        const jelolt = marad
          .map((t) => ({ t, a: t.fizetos.find((a) => a.kod === kod && (!a.vege || a.vege >= kezd)) }))
          .filter((x) => x.a)
          .sort((x, y) => (x.a.vege || Infinity) - (y.a.vege || Infinity)
            || x.t.fizetos.length - y.t.fizetos.length || x.t.c.rang - y.t.c.rang);
        let hely = 0;
        const fer = [];
        for (const x of jelolt) {
          if (hely + x.t.egyseg <= estek || !fer.length) { fer.push(x); hely += x.t.egyseg; }
        }
        const surgos = fer.filter((x) => x.t.utolso <= vege + IDOSZAK).length;
        const egyedi = fer.filter((x) => x.t.fizetos.length === 1).length;
        const pont = hely + 3 * surgos + egyedi;
        if (!legjobb || pont > legjobb.pont || (pont === legjobb.pont && ar(kod) < ar(legjobb.kod))) {
          legjobb = { kod, pont, fer };
        }
      });
      if (!legjobb) break;
      const elozo = honapok[honapok.length - 1];
      const tetelek = legjobb.fer.map((x) => ({ c: x.t.c, vege: x.a.vege && x.a.vege <= vege ? x.a.vege : 0 }));
      if (elozo && elozo.kod === legjobb.kod && elozo.vege === kezd - 1) {
        elozo.vege = vege; elozo.db += 1; elozo.tetelek.push(...tetelek);
      } else {
        honapok.push({ kod: legjobb.kod, kezd, vege, db: 1, tetelek });
      }
      const kesz = new Set(legjobb.fer.map((x) => x.t.c.id));
      marad = marad.filter((t) => !kesz.has(t.c.id));
    }

    const ossz = honapok.reduce((s, h) => s + ar(h.kod) * h.db, 0);
    const hossz = honapok.reduce((s, h) => s + h.db, 0);
    const hasznalt = [...new Set(honapok.map((h) => h.kod))];
    const egyszerre = hasznalt.reduce((s, k) => s + ar(k), 0) * hossz;
    return { honapok, barmikor, kimaradt, nemfer: marad, ossz, hossz, hasznalt, egyszerre };
  }

  function peldaLista() {
    const kell = { mxx: 2, nfx: 2, dnp: 2, sst: 1, rtl: 1 };
    const ki = [];
    for (const c of SOR.values()) {
      const fiz = c.aj.filter((a) => ar(a.kod) > 0 && !a.ingyen);
      if (fiz.length !== 1) continue;
      const k = fiz[0].kod;
      if (kell[k] > 0 && !nincsMagyarHang(c)) { ki.push(c.id); kell[k] -= 1; }
      if (Object.values(kell).every((v) => v <= 0)) break;
    }
    return ki;
  }

  /* ------------------------------------------------------------ jegyek */
  let utolsoTerv = null;

  function jegyHTML(h, i) {
    const kozep = datum(h.kezd + Math.floor((IDOSZAK * h.db) / 2));
    const honapNev = h.db > 1
      ? `${HONAP[datum(h.kezd + 15).getUTCMonth()].slice(0, 3)}.–${HONAP[datum(h.vege - 15).getUTCMonth()].slice(0, 3)}.`
      : HONAP[kozep.getUTCMonth()];
    const fejlec = honapNev.charAt(0).toUpperCase() + honapNev.slice(1);
    const lathato = h.tetelek.slice(0, 5);
    const tobb = h.tetelek.length - lathato.length;
    const arSzoveg = h.db > 1 ? `${h.db} hónap, ${ft(ar(h.kod) * h.db)}` : ft(ar(h.kod));
    return `<li class="jegy" style="--c: var(--j-${h.kod}); --i: ${i}">
      <div class="jegy__fej">
        <div><div class="jegy__honap">${esc(fejlec)}</div>
        <div class="jegy__datum">${rovid(h.kezd, false)} – ${rovid(h.vege, false)}</div></div>
        <div class="jegy__sorszam" aria-label="${i + 1}. hónap">${i + 1}.</div>
      </div>
      <div class="jegy__platform">${esc(NEV[h.kod])}</div>
      <div class="jegy__ar">${arSzoveg}</div>
      <div class="jegy__perf" aria-hidden="true"></div>
      <ul class="jegy__cimek">${lathato.map((t) => `<li${t.vege ? ' class="surgos"' : ""}>${esc(t.c.cim)}${t.vege ? `, ${rovid(t.vege)} lekerül` : ""}</li>`).join("")}</ul>
      ${tobb > 0 ? `<p class="jegy__tobb">és még ${tobb} cím</p>` : ""}
      <p class="jegy__lab">Lemondás: ${ig(h.vege)}</p>
    </li>`;
  }

  function barmikorHTML(lista, i) {
    const kodok = [...new Set(lista.map((x) => x.kod))].map((k) => NEV[k]);
    const lathato = lista.slice(0, 5);
    return `<li class="jegy jegy--ingyen" style="--i: ${i}">
      <div class="jegy__fej"><div><div class="jegy__honap">Bármikor</div>
      <div class="jegy__datum">nem kell külön fizetni</div></div></div>
      <div class="jegy__platform">${esc(felsorol(kodok))}</div>
      <div class="jegy__ar">${lista.length} cím</div>
      <div class="jegy__perf" aria-hidden="true"></div>
      <ul class="jegy__cimek">${lathato.map((x) => `<li>${esc(x.c.cim)}</li>`).join("")}</ul>
      ${lista.length > 5 ? `<p class="jegy__tobb">és még ${lista.length - 5} cím</p>` : ""}
    </li>`;
  }

  function rajzolTerv(animal = true) {
    const sajat = allapot.lista.length > 0;
    const ids = sajat ? allapot.lista : peldaLista();
    const t = tervez(ids, allapot.estek, sajat ? allapot.megvan : []);
    utolsoTerv = sajat ? t : null;

    $("#terv-felirat").textContent = sajat
      ? `A te terved, havi ${allapot.estek} estével számolva.`
      : "Egy példa a most legnézettebb címekből. Ha felírsz valamit a listádra, ez lecserélődik a saját tervedre.";

    const ol = $("#jegyek");
    ol.innerHTML = t.honapok.map(jegyHTML).join("")
      + (t.barmikor.length ? barmikorHTML(t.barmikor, t.honapok.length) : "");
    if (animal && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      ol.classList.remove("uj"); void ol.offsetWidth; ol.classList.add("uj");
    }

    const o = $("#osszeg");
    if (!t.honapok.length) {
      o.innerHTML = t.barmikor.length
        ? `<p class="osszeg__mellek">Mindent megnézhetsz abból, amire már előfizetsz, vagy ami ingyenes.</p>` : "";
    } else {
      let mellek;
      if (t.hasznalt.length > 1 && t.egyszerre > t.ossz) {
        const db = SZAM[t.hasznalt.length] || t.hasznalt.length;
        mellek = `Ha mind ${/^[aáeéiíoóöőuúüű]/.test(String(db)) ? "az" : "a"} ${db} szolgáltatásra (${t.hasznalt.map((k) => NEV[k]).join(", ")}) egyszerre fizetnél ugyanennyi ideig, <strong>${ft(t.egyszerre)}</strong> lenne. Így <strong>${ft(t.egyszerre - t.ossz)}</strong> marad nálad.`;
      } else {
        mellek = "Ehhez egyetlen szolgáltatás is elég.";
      }
      o.innerHTML = `<p class="osszeg__fo">${t.hossz} hónap, ${ft(t.ossz)}</p><p class="osszeg__mellek">${mellek}</p>`;
    }

    const km = [];
    t.kimaradt.forEach((x) => {
      const a = x.fizetos.reduce((m, y) => (y.vege > m.vege ? y : m));
      km.push(`<p>A(z) <strong>${esc(x.c.cim)}</strong> ${ragos(a.vege)} lekerül (${esc(NEV[a.kod])}), addig nem fér bele a tervbe. Ha fontos, vegyél ki valamit a listádból, vagy szánj rá több estét.</p>`);
    });
    if (t.nemfer.length) {
      km.push(`<p>${t.nemfer.length} cím már nem fér bele egy évbe havi ${allapot.estek} estével.</p>`);
    }
    $("#kimarad").innerHTML = sajat ? km.join("") : "";
    $("#terv-gombok").hidden = !(sajat && t.honapok.length);
  }

  /* ------------------------------------------------------------ sorok */
  function sorHTML(c, mod) {
    const meta = [c.ev || null, c.show ? "sorozat" : "film", c.mufaj[0], c.imdb ? `IMDb ${(c.imdb / 10).toFixed(1).replace(".", ",")}` : null]
      .filter(Boolean).join(", ");
    const hol = c.aj.map((a) => `<span class="cimke" style="--c: var(--j-${a.kod})">${esc(NEV[a.kod])}${a.ingyen && ar(a.kod) === 0 ? ", ingyen" : a.ingyen ? ", ingyenes rész" : ""}</span>`).join("");
    const vege = c.aj.filter((a) => a.vege && a.vege >= MA).map((a) => a.vege);
    const vegeTxt = vege.length ? `<span class="cimke cimke--vege">${ragos(Math.max(...vege))} lekerül</span>` : "";
    const ny = nyelv(c);
    const rajta = allapot.lista.includes(c.id);
    const gomb = mod === "lista"
      ? `<button type="button" class="sor__gomb" data-ki="${esc(c.id)}">Kiveszem</button>`
      : `<button type="button" class="sor__gomb" data-be="${esc(c.id)}" aria-pressed="${rajta}">${rajta ? "Felírva" : "Felírom"}</button>`;
    return `<li class="sor" data-id="${esc(c.id)}">
      <div>
        <div class="sor__cim"><button type="button" data-reszlet="${esc(c.id)}" aria-expanded="false">${esc(c.cim)}</button></div>
        <div class="sor__meta">${esc(c.eredeti ? `${c.eredeti}, ${meta}` : meta)}</div>
        <div class="sor__hol">${hol}${ny ? `<span class="cimke cimke--nyelv">${ny}</span>` : ""}${vegeTxt}</div>
      </div>
      ${gomb}
    </li>`;
  }

  function rajzolLista() {
    const ul = $("#listam");
    const elemek = allapot.lista.map((id) => SOR.get(id)).filter(Boolean);
    ul.innerHTML = elemek.map((c) => sorHTML(c, "lista")).join("");
    $("#listam-ures").hidden = elemek.length > 0;
  }

  /* ------------------------------------------------------------ kereső */
  function keres(q) {
    const ul = $("#talalatok");
    const k = norm(q);
    if (k.length < 2) { ul.innerHTML = ""; return; }
    const elol = [], kozben = [];
    for (const c of SOR.values()) {
      if (allapot.csakMagyar && nincsMagyarHang(c)) continue;
      const i = c.kulcs.indexOf(k);
      if (i === -1) continue;
      (i === 0 || c.kulcs.includes(` ${k}`) ? elol : kozben).push(c);
      if (elol.length >= 8) break;
    }
    const ki = elol.concat(kozben).slice(0, 8);
    ul.innerHTML = ki.length
      ? ki.map((c) => sorHTML(c, "talalat")).join("")
      : `<li class="talalat-ures">Erre nincs találat a hazai kínálatban. Lehet, hogy most egyik szolgáltatónál sincs fent, vagy más címen fut itthon.</li>`;
  }

  /* ------------------------------------------------------------ részletek */
  async function reszlet(gomb) {
    const id = gomb.dataset.reszlet;
    const li = gomb.closest(".sor");
    const nyitva = gomb.getAttribute("aria-expanded") === "true";
    li.querySelector(".sor__leiras")?.remove();
    if (nyitva) { gomb.setAttribute("aria-expanded", "false"); return; }
    gomb.setAttribute("aria-expanded", "true");
    const p = document.createElement("div");
    p.className = "sor__leiras";
    p.textContent = "Töltöm…";
    li.appendChild(p);
    try {
      if (!EXTRA) EXTRA = await (await fetch("data/extra.json")).json();
      const [leiras, linkek] = EXTRA[id] || ["", {}];
      const l = Object.entries(linkek).filter(([, u]) => u)
        .map(([k, u]) => `<a href="${esc(u)}" rel="noopener" target="_blank">Megnyitom: ${esc(NEV[k])}</a>`).join(", ");
      p.innerHTML = `${leiras ? `<p>${esc(leiras)}</p>` : ""}${l ? `<p style="margin-top:.4rem">${l}</p>` : ""}` || "Ehhez nincs leírásunk.";
    } catch (_) {
      p.textContent = "A leírást most nem sikerült betölteni.";
    }
  }

  /* ------------------------------------------------------------ hamarosan lekerül */
  let lekerulSzuro = "";
  let lekerulDb = 12;
  function rajzolLekerul() {
    const hat = MA + 42;
    const lista = [];
    for (const c of SOR.values()) {
      const a = c.aj.filter((x) => x.vege >= MA && x.vege <= hat && (!lekerulSzuro || x.kod === lekerulSzuro));
      if (!a.length) continue;
      if (allapot.csakMagyar && nincsMagyarHang(c)) continue;
      lista.push({ c, nap: Math.min(...a.map((x) => x.vege)) });
    }
    lista.sort((x, y) => x.nap - y.nap || x.c.rang - y.c.rang);
    const resz = lista.slice(0, lekerulDb);
    let html = "", nap = null;
    resz.forEach((x) => {
      if (x.nap !== nap) { nap = x.nap; html += `<li class="nap">${esc(ragos(nap).replace(/-(.+)$/, "-$1"))}</li>`; }
      html += sorHTML(x.c, "talalat");
    });
    $("#lekerul").innerHTML = html || `<li class="talalat-ures">Ennél a szolgáltatónál most semmi nem kerül le a következő hat hétben.</li>`;
    $("#lekerul-tobb").hidden = lista.length <= lekerulDb;

    const kodok = [...new Set([...SOR.values()].flatMap((c) => c.aj.filter((x) => x.vege >= MA && x.vege <= hat).map((x) => x.kod)))];
    $("#lekerul-szuro").innerHTML = [["", "Mind"], ...kodok.map((k) => [k, NEV[k]])]
      .map(([k, n]) => `<button type="button" data-szuro="${k}" aria-pressed="${k === lekerulSzuro}">${esc(n)}</button>`).join("");
  }

  /* ------------------------------------------------------------ naptár és megosztás */
  function naptar() {
    if (!utolsoTerv) return;
    const d = (n) => datum(n).toISOString().slice(0, 10).replace(/-/g, "");
    const most = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
    const ev = [];
    const t = utolsoTerv.honapok;
    t.forEach((h, i) => {
      const cimek = h.tetelek.map((x) => x.c.cim).join(", ");
      ev.push(["Előfizetés: " + NEV[h.kod], h.kezd, `Erre a ${h.db > 1 ? `${h.db} hónapra` : "hónapra"}: ${cimek}`]);
      const kov = t[i + 1];
      ev.push(["Lemondás: " + NEV[h.kod], h.vege - 1,
        kov ? `Holnaptól ${NEV[kov.kod]} jön. Mondd le most, hogy ne vonjon le még egy havidíjat.` : "A terv itt véget ér. Mondd le, hogy ne vonjon le még egy havidíjat."]);
    });
    const sorok = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Sorjaban//HU", "CALSCALE:GREGORIAN"];
    ev.forEach(([cim, nap, leiras], i) => {
      sorok.push("BEGIN:VEVENT", `UID:sorjaban-${MA}-${i}@sorjaban`, `DTSTAMP:${most}`,
        `DTSTART;VALUE=DATE:${d(nap)}`, `DTEND;VALUE=DATE:${d(nap + 1)}`,
        `SUMMARY:${cim.replace(/[,;]/g, "\\$&")}`, `DESCRIPTION:${leiras.replace(/[,;]/g, "\\$&")}`,
        "BEGIN:VALARM", "TRIGGER:PT9H", "ACTION:DISPLAY", `DESCRIPTION:${cim}`, "END:VALARM", "END:VEVENT");
    });
    sorok.push("END:VCALENDAR");
    const blob = new Blob([sorok.join("\r\n")], { type: "text/calendar;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "sorjaban-emlekezteto.ics";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    uzen("A naptárfájl letöltődött. Nyisd meg, és a naptárad felveszi az emlékeztetőket.");
  }

  async function megoszt() {
    const p = new URLSearchParams({ l: allapot.lista.join(","), e: allapot.estek, h: allapot.csakMagyar ? "1" : "0", o: allapot.megvan.join(",") });
    const url = `${location.origin}${location.pathname}#${p.toString().replace(/%2C/g, ",")}`;
    try {
      if (navigator.share && matchMedia("(pointer: coarse)").matches) {
        await navigator.share({ title: "A streaming-tervem", url });
        return;
      }
      await navigator.clipboard.writeText(url);
      uzen("A link a vágólapon van.");
    } catch (_) {
      window.prompt("Másold ki a linket:", url);
    }
  }

  /* ------------------------------------------------------------ események */
  function frissit(animal = true) { ment(); rajzolLista(); rajzolTerv(animal); }

  function bekot() {
    let idozito;
    $("#q").addEventListener("input", (e) => {
      clearTimeout(idozito);
      idozito = setTimeout(() => keres(e.target.value), 110);
    });

    document.addEventListener("click", (e) => {
      const be = e.target.closest("[data-be]");
      const ki = e.target.closest("[data-ki]");
      const rsz = e.target.closest("[data-reszlet]");
      const sz = e.target.closest("[data-szuro]");
      if (be) {
        const id = be.dataset.be;
        const i = allapot.lista.indexOf(id);
        if (i === -1) allapot.lista.push(id); else allapot.lista.splice(i, 1);
        document.querySelectorAll(`[data-be="${CSS.escape(id)}"]`).forEach((g) => {
          const rajta = allapot.lista.includes(id);
          g.setAttribute("aria-pressed", rajta); g.textContent = rajta ? "Felírva" : "Felírom";
        });
        frissit();
      } else if (ki) {
        allapot.lista = allapot.lista.filter((x) => x !== ki.dataset.ki);
        document.querySelectorAll(`[data-be="${CSS.escape(ki.dataset.ki)}"]`).forEach((g) => { g.setAttribute("aria-pressed", "false"); g.textContent = "Felírom"; });
        frissit();
      } else if (rsz) {
        reszlet(rsz);
      } else if (sz) {
        lekerulSzuro = sz.dataset.szuro; lekerulDb = 12; rajzolLekerul();
      }
    });

    const estek = $("#estek");
    estek.value = allapot.estek;
    $("#estek-ki").textContent = allapot.estek;
    estek.addEventListener("input", () => {
      allapot.estek = +estek.value; $("#estek-ki").textContent = estek.value; frissit(false);
    });

    const cs = $("#csakmagyar");
    cs.checked = allapot.csakMagyar;
    cs.addEventListener("change", () => {
      allapot.csakMagyar = cs.checked; ment(); keres($("#q").value); rajzolLekerul();
    });

    $("#megvan").innerHTML = PL.filter((k) => ar(k) > 0).map((k) => `<label><input type="checkbox" value="${k}"${allapot.megvan.includes(k) ? " checked" : ""}> ${esc(NEV[k])}</label>`).join("");
    $("#megvan").addEventListener("change", () => {
      allapot.megvan = [...document.querySelectorAll("#megvan input:checked")].map((x) => x.value);
      frissit();
    });

    $("#naptar").addEventListener("click", naptar);
    $("#megosztas").addEventListener("click", megoszt);
    $("#lekerul-tobb").addEventListener("click", () => { lekerulDb += 24; rajzolLekerul(); });
  }

  /* ------------------------------------------------------------ indulás */
  async function indul() {
    betolt();
    try {
      const [kat, arak] = await Promise.all([
        fetch("data/catalog.json").then((r) => r.json()),
        fetch("data/prices.json").then((r) => r.json()),
      ]);
      KAT = kat; ARAK = arak.plans;
      $("#ar-datum").textContent = `${arak.checked}ban`;
      feldolgoz(kat);
    } catch (_) {
      $("#terv-felirat").textContent = "Nem sikerült betölteni a kínálatot. Frissítsd az oldalt, vagy nézz vissza pár perc múlva.";
      return;
    }
    allapot.lista = allapot.lista.filter((id) => SOR.has(id));
    const fr = $("#frissult");
    fr.textContent = `Kínálat frissítve: ${rovid(Math.floor(new Date(KAT.updated).getTime() / NAP))}`;
    fr.hidden = false;
    bekot();
    rajzolLista();
    rajzolTerv();
    rajzolLekerul();
  }

  indul();
})();
