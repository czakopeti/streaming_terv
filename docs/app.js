(() => {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const NAP = 86400000;
  const MA = Math.floor(Date.now() / NAP);
  const IDOSZAK = 30;
  const MAX_HONAP = 12;
  const EV = new Date().getFullYear();

  const HONAP = ["január", "február", "március", "április", "május", "június", "július",
    "augusztus", "szeptember", "október", "november", "december"];
  const HONAP_ROVID = ["jan.", "febr.", "márc.", "ápr.", "máj.", "jún.", "júl.", "aug.",
    "szept.", "okt.", "nov.", "dec."];
  const RAG = ["", "jén", "án", "án", "én", "én", "án", "én", "án", "én", "én",
    "én", "én", "án", "én", "én", "án", "én", "án", "én", "án",
    "én", "én", "án", "én", "én", "án", "én", "án", "én", "án", "én"];
  const SZAM = ["", "egy", "két", "három", "négy", "öt", "hat", "hét", "nyolc"];
  const MUFAJ = {
    act: "akció", ani: "animáció", cmy: "vígjáték", crm: "krimi", doc: "dokumentum",
    drm: "dráma", eur: "európai", fml: "családi", fnt: "fantasy", hst: "történelmi",
    hrr: "horror", msc: "zenés", rma: "romantikus", scf: "sci-fi", spt: "sport",
    trl: "thriller", war: "háborús", wsn: "western", rly: "valóságshow",
  };

  let KAT = null;
  let ARAK = {};
  let PL = [];
  const NEV = {};
  const SOR = new Map();
  const EXTRA = {};

  const allapot = { lista: [], estek: 8, csakMagyar: false, megvan: [] };

  /* ------------------------------------------------------------ segédek */
  const datum = (n) => new Date(n * NAP);
  const evvel = (d) => (d.getUTCFullYear() !== EV ? `${d.getUTCFullYear()}. ` : "");
  const rovid = (n, ev = true) => { const d = datum(n); return `${ev ? evvel(d) : ""}${HONAP_ROVID[d.getUTCMonth()]} ${d.getUTCDate()}.`; };
  const ragos = (n) => { const d = datum(n); const nap = d.getUTCDate(); return `${evvel(d)}${HONAP_ROVID[d.getUTCMonth()]} ${nap}-${RAG[nap]}`; };
  const ig = (n) => { const d = datum(n); return `${HONAP_ROVID[d.getUTCMonth()]} ${d.getUTCDate()}-ig`; };
  const ft = (x) => `${String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} Ft`;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const ar = (kod) => (ARAK[kod] ? ARAK[kod].price : 0);
  const nevelo = (szo) => (/^[aáeéiíoóöőuúüű5]/i.test(String(szo)) ? "az" : "a");
  const mozgas = () => !matchMedia("(prefers-reduced-motion: reduce)").matches;

  function kep(c, meret = "s276") {
    if (!c || !c.plakat) return "";
    if (c.plakat.startsWith("rtl:")) return c.plakat.slice(4);
    const [id, slug] = c.plakat.split("/");
    return `https://images.justwatch.com/poster/${id}/${meret}/${slug}.webp`;
  }
  const hatterKep = (k) => {
    if (!k) return "";
    const [id, slug] = k.split("/");
    return `https://images.justwatch.com/backdrop/${id}/s1440/${slug}.webp`;
  };
  const elsoPlatform = (c) => (c.aj[0] ? c.aj[0].kod : "");
  function plakatHTML(c, meret) {
    const u = kep(c, meret);
    const tartalek = `<span class="nincs" style="--c: var(--j-${elsoPlatform(c)})">${esc(c.cim)}</span>`;
    return u ? `<img src="${esc(u)}" alt="" loading="lazy" decoding="async" data-tartalek="${esc(c.cim)}" data-kod="${elsoPlatform(c)}">` : tartalek;
  }
  // ha egy kép nem töltődik be, a cím jelenik meg a platform színén
  document.addEventListener("error", (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.dataset.tartalek) return;
    const s = document.createElement("span");
    s.className = "nincs";
    s.style.setProperty("--c", `var(--j-${img.dataset.kod})`);
    s.textContent = img.dataset.tartalek;
    img.replaceWith(s);
  }, true);

  function uzen(szoveg) {
    const u = $("#uzenet");
    u.textContent = szoveg;
    u.classList.add("latszik");
    clearTimeout(uzen.t);
    uzen.t = setTimeout(() => u.classList.remove("latszik"), 2800);
  }

  function ment() { try { localStorage.setItem("sorjaban", JSON.stringify(allapot)); } catch (_) { /* privát mód */ } }
  function betolt() {
    try { const m = JSON.parse(localStorage.getItem("sorjaban") || "null"); if (m) Object.assign(allapot, m); } catch (_) { /* nincs tároló */ }
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
      const [id, show, cim, eredeti, ev, mufajok, imdb] = r;
      const plakat = r.length >= 9 ? r[7] : "";
      const ajanlatok = r[r.length - 1];
      SOR.set(id, {
        id, show: !!show, cim, eredeti, ev, rang: i, imdb, plakat,
        mufaj: mufajok.map((g) => MUFAJ[kat.genres[g]]).filter(Boolean),
        kulcs: norm(`${cim} ${eredeti}`),
        aj: ajanlatok.map(([p, f, vege, kezd]) => ({
          kod: PL[p], hang: !!(f & 1), felirat: !!(f & 2), ismert: !!(f & 4),
          ingyen: !!(f & 8) || ar(PL[p]) === 0, vege, kezd,
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
  const metaSzoveg = (c) => [c.ev || null, c.show ? "sorozat" : "film", c.mufaj[0], c.imdb ? `IMDb ${(c.imdb / 10).toFixed(1).replace(".", ",")}` : null].filter(Boolean).join(", ");
  const vegeNap = (c) => { const v = c.aj.filter((a) => a.vege >= MA).map((a) => a.vege); return v.length ? Math.max(...v) : 0; };
  const hatravan = (n) => { const d = n - MA; return d <= 0 ? "ma lekerül" : d === 1 ? "holnap lekerül" : d < 15 ? `${d} nap múlva lekerül` : `${rovid(n)} lekerül`; };

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
      marad = marad.filter((t) => { if (t.utolso < kezd) { kimaradt.push(t); return false; } return true; });
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
        for (const x of jelolt) if (hely + x.t.egyseg <= estek || !fer.length) { fer.push(x); hely += x.t.egyseg; }
        const surgos = fer.filter((x) => x.t.utolso <= vege + IDOSZAK).length;
        const egyedi = fer.filter((x) => x.t.fizetos.length === 1).length;
        const pont = hely + 3 * surgos + egyedi;
        if (!legjobb || pont > legjobb.pont || (pont === legjobb.pont && ar(kod) < ar(legjobb.kod))) legjobb = { kod, pont, fer };
      });
      if (!legjobb) break;
      const elozo = honapok[honapok.length - 1];
      const tetelek = legjobb.fer.map((x) => ({ c: x.t.c, vege: x.a.vege && x.a.vege <= vege ? x.a.vege : 0 }));
      if (elozo && elozo.kod === legjobb.kod && elozo.vege === kezd - 1) { elozo.vege = vege; elozo.db += 1; elozo.tetelek.push(...tetelek); }
      else honapok.push({ kod: legjobb.kod, kezd, vege, db: 1, tetelek });
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
      if (!c.plakat) continue;
      const fiz = c.aj.filter((a) => ar(a.kod) > 0 && !a.ingyen);
      if (fiz.length !== 1) continue;
      const k = fiz[0].kod;
      if (kell[k] > 0 && !nincsMagyarHang(c)) { ki.push(c.id); kell[k] -= 1; }
      if (Object.values(kell).every((v) => v <= 0)) break;
    }
    return ki;
  }

  /* ------------------------------------------------------------ plakátfal */
  function rajzolFal() {
    const kepesek = [...SOR.values()].filter((c) => c.plakat && !c.plakat.startsWith("rtl:")).slice(0, 54);
    if (kepesek.length < 12) return;
    const sorok = [0, 1, 2].map((s) => kepesek.filter((_, i) => i % 3 === s));
    $("#fal").innerHTML = sorok.map((sor) => {
      const egy = sor.map((c) => `<img src="${esc(kep(c, "s166"))}" alt="" decoding="async">`).join("");
      return `<div class="fal__sor">${egy}${egy}</div>`;
    }).join("");
    $("#fal").addEventListener("error", (e) => { if (e.target.tagName === "IMG") e.target.style.visibility = "hidden"; }, true);
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
    const musor = h.tetelek.slice(0, 3).map((t) => plakatHTML(t.c, "s166")).join("");
    return `<li class="jegy" style="--c: var(--j-${h.kod}); --i: ${i}">
      <div class="jegy__musor" aria-hidden="true">${musor}<span class="jegy__sorszam">${i + 1}.</span></div>
      <div class="jegy__honap">${esc(fejlec)}</div>
      <div class="jegy__datum">${rovid(h.kezd, false)} – ${rovid(h.vege, false)}</div>
      <div class="jegy__platform">${esc(NEV[h.kod])}</div>
      <div class="jegy__ar">${arSzoveg}</div>
      <div class="jegy__perf" aria-hidden="true"></div>
      <ul class="jegy__cimek">${lathato.map((t) => `<li${t.vege ? ' class="surgos"' : ""}><button type="button" data-nyit="${esc(t.c.id)}">${esc(t.c.cim)}${t.vege ? `, ${rovid(t.vege)} lekerül` : ""}</button></li>`).join("")}</ul>
      ${tobb > 0 ? `<p class="jegy__tobb">és még ${tobb} cím</p>` : ""}
      <p class="jegy__lab">Lemondás: ${ig(h.vege)}</p>
    </li>`;
  }

  function barmikorHTML(lista, i) {
    const kodok = [...new Set(lista.map((x) => x.kod))].map((k) => NEV[k]);
    const lathato = lista.slice(0, 5);
    return `<li class="jegy jegy--ingyen" style="--i: ${i}">
      <div class="jegy__musor" aria-hidden="true">${lista.slice(0, 3).map((x) => plakatHTML(x.c, "s166")).join("")}</div>
      <div class="jegy__honap">Bármikor</div>
      <div class="jegy__datum">nem kell külön fizetni</div>
      <div class="jegy__platform">${esc(kodok.join(", "))}</div>
      <div class="jegy__ar">${lista.length} cím</div>
      <div class="jegy__perf" aria-hidden="true"></div>
      <ul class="jegy__cimek">${lathato.map((x) => `<li><button type="button" data-nyit="${esc(x.c.id)}">${esc(x.c.cim)}</button></li>`).join("")}</ul>
      ${lista.length > 5 ? `<p class="jegy__tobb">és még ${lista.length - 5} cím</p>` : ""}
    </li>`;
  }

  function rajzolTerv(animal = true) {
    const sajat = allapot.lista.length > 0;
    const ids = sajat ? allapot.lista : peldaLista();
    const t = tervez(ids, allapot.estek, sajat ? allapot.megvan : []);
    utolsoTerv = sajat ? t : null;

    $("#terv-felirat").textContent = sajat
      ? `${t.honapok.length ? "Így osztanám be." : ""} Egy jegy egy hónap: arra az egy szolgáltatásra fizess elő, a végén mondd le.`.trim()
      : "Ez most egy példa a legnézettebb címekből. Ha felírsz valamit, a saját terved jelenik meg helyette.";

    const ol = $("#jegyek");
    ol.innerHTML = t.honapok.map(jegyHTML).join("") + (t.barmikor.length ? barmikorHTML(t.barmikor, t.honapok.length) : "");
    if (animal && mozgas()) { ol.classList.remove("uj"); void ol.offsetWidth; ol.classList.add("uj"); }

    const o = $("#osszeg");
    if (!t.honapok.length) {
      o.innerHTML = t.barmikor.length ? `<p class="osszeg__mellek">Mindent megnézhetsz abból, amire már előfizetsz, vagy ami ingyenes.</p>` : "";
    } else {
      let mellek;
      if (t.hasznalt.length > 1 && t.egyszerre > t.ossz) {
        const db = SZAM[t.hasznalt.length] || t.hasznalt.length;
        mellek = `Ha mind ${nevelo(db)} ${db} szolgáltatásra egyszerre fizetnél ugyanennyi ideig, <strong>${ft(t.egyszerre)}</strong> lenne. Így <strong>${ft(t.egyszerre - t.ossz)}</strong> marad nálad.`;
      } else mellek = "Ehhez egyetlen szolgáltatás is elég.";
      o.innerHTML = `<p class="osszeg__fo">${t.hossz} hónap, ${ft(t.ossz)}</p><p class="osszeg__mellek">${mellek}</p>`;
    }

    const km = [];
    if (t.kimaradt.length) {
      const nevek = t.kimaradt.map((x) => {
        const a = x.fizetos.reduce((m, y) => (y.vege > m.vege ? y : m));
        return `<strong>${esc(x.c.cim)}</strong> (${esc(NEV[a.kod])}, ${rovid(a.vege)})`;
      });
      km.push(`<p>${t.kimaradt.length > 1 ? "Ezek lekerülnek, mielőtt sorra kerülnének" : "Ez lekerül, mielőtt sorra kerülne"}: ${nevek.join(", ")}. Ha fontos, vegyél ki mást a listádból, vagy szánj rá több estét.</p>`);
    }
    if (t.nemfer.length) km.push(`<p>${t.nemfer.length} cím már nem fér bele egy évbe havi ${allapot.estek} estével.</p>`);
    $("#kimarad").innerHTML = sajat ? km.join("") : "";
    $("#terv-gombok").hidden = !(sajat && t.honapok.length);

    const zseb = $("#zsebterv");
    zseb.hidden = !(sajat && t.honapok.length);
    document.body.classList.toggle("van-zsebterv", !zseb.hidden);
    if (!zseb.hidden) $("#zsebterv-link").textContent = `A terved: ${t.hossz} hónap, ${ft(t.ossz)}`;
  }

  /* ------------------------------------------------------------ kártyák és sínek */
  function kartyaHTML(c, jelveny = "") {
    const rajta = allapot.lista.includes(c.id);
    const platformok = c.aj.slice(0, 2).map((a) => `<span class="jelveny" style="--c: var(--j-${a.kod})">${esc(NEV[a.kod])}</span>`).join("");
    return `<li class="kartya">
      <button type="button" class="kartya__nyit" data-nyit="${esc(c.id)}">
        <div class="plakat">${plakatHTML(c)}<div class="jelvenyek">${jelveny || platformok}</div></div>
        <div class="kartya__cim">${esc(c.cim)}</div>
        <div class="kartya__meta">${esc([c.ev || null, c.show ? "sorozat" : "film"].filter(Boolean).join(", "))}</div>
      </button>
      <button type="button" class="kartya__gomb" data-be="${esc(c.id)}" aria-pressed="${rajta}" aria-label="${rajta ? "Levétel a listáról" : "Felírás a listára"}: ${esc(c.cim)}">${rajta ? "✓" : "+"}</button>
    </li>`;
  }

  function rajzolLista() {
    const elemek = allapot.lista.map((id) => SOR.get(id)).filter(Boolean);
    $("#listam").innerHTML = elemek.map((c) => kartyaHTML(c)).join("");
    $("#listam-ures").hidden = elemek.length > 0;
    $("#lista-info").textContent = elemek.length ? `${elemek.length} cím. A kártyán a pipával veheted le.` : "";
  }

  let lekerulSzuro = "";
  function rajzolLekerul() {
    const hat = MA + 42;
    const lista = [];
    for (const c of SOR.values()) {
      const a = c.aj.filter((x) => x.vege >= MA && x.vege <= hat && (!lekerulSzuro || x.kod === lekerulSzuro));
      if (!a.length || (allapot.csakMagyar && nincsMagyarHang(c))) continue;
      lista.push({ c, nap: Math.min(...a.map((x) => x.vege)), kod: a[0].kod });
    }
    lista.sort((x, y) => x.nap - y.nap || x.c.rang - y.c.rang);
    $("#lekerul").innerHTML = lista.slice(0, 40).map((x) => kartyaHTML(x.c,
      `<span class="jelveny jelveny--vege">${esc(hatravan(x.nap))}</span>`)).join("");

    const kodok = [...new Set([...SOR.values()].flatMap((c) => c.aj.filter((x) => x.vege >= MA && x.vege <= hat).map((x) => x.kod)))];
    $("#lekerul-szuro").innerHTML = [["", "Mind"], ...kodok.map((k) => [k, NEV[k]])]
      .map(([k, n]) => `<button type="button" data-szuro="${k}" aria-pressed="${k === lekerulSzuro}">${esc(n)}</button>`).join("");
  }

  function rajzolUjak() {
    const lista = [];
    for (const c of SOR.values()) {
      if (!c.plakat) continue;
      const a = c.aj.find((x) => x.kezd && x.kezd >= MA - 21 && x.kezd <= MA);
      if (!a || (allapot.csakMagyar && nincsMagyarHang(c))) continue;
      lista.push({ c, kod: a.kod });
      if (lista.length >= 30) break;
    }
    $("#ujak").innerHTML = lista.map((x) => kartyaHTML(x.c,
      `<span class="jelveny" style="--c: var(--j-${x.kod})">${esc(NEV[x.kod])}</span>`)).join("");
    $("#ujak").closest("section").hidden = lista.length === 0;
  }

  /* ------------------------------------------------------------ kereső */
  let talalatok = [];
  let kijelolt = -1;
  function keres(q) {
    const ul = $("#talalatok");
    const inp = $("#q");
    const k = norm(q);
    if (k.length < 2) { ul.hidden = true; inp.setAttribute("aria-expanded", "false"); talalatok = []; return; }
    const elol = [], kozben = [];
    for (const c of SOR.values()) {
      if (allapot.csakMagyar && nincsMagyarHang(c)) continue;
      const i = c.kulcs.indexOf(k);
      if (i === -1) continue;
      (i === 0 || c.kulcs.includes(` ${k}`) ? elol : kozben).push(c);
      if (elol.length >= 8) break;
    }
    talalatok = elol.concat(kozben).slice(0, 8);
    kijelolt = -1;
    ul.innerHTML = talalatok.length
      ? talalatok.map((c, i) => {
        const rajta = allapot.lista.includes(c.id);
        const hol = c.aj.map((a) => NEV[a.kod]).join(", ");
        const ny = nyelv(c);
        const v = vegeNap(c);
        return `<li class="talalat" role="option" id="t-${i}" aria-selected="false" data-nyit="${esc(c.id)}">
          <div class="talalat__kep">${plakatHTML(c, "s166")}</div>
          <div><div class="talalat__cim">${esc(c.cim)}</div>
          <div class="talalat__meta"><b>${esc(hol)}</b>${ny ? `, ${ny}` : ""}${v ? `, ${esc(rovid(v))} lekerül` : ""}</div>
          <div class="talalat__meta">${esc(c.eredeti ? `${c.eredeti}, ${metaSzoveg(c)}` : metaSzoveg(c))}</div></div>
          <button type="button" class="felir" data-be="${esc(c.id)}" aria-pressed="${rajta}">${rajta ? "Felírva" : "Felírom"}</button>
        </li>`;
      }).join("")
      : `<li class="talalat-ures">Erre nincs találat a hazai kínálatban. Lehet, hogy most egyik szolgáltatónál sincs fent, vagy más címen fut itthon.</li>`;
    ul.hidden = false;
    inp.setAttribute("aria-expanded", "true");
  }
  function jelol(i) {
    const elemek = [...document.querySelectorAll("#talalatok .talalat")];
    if (!elemek.length) return;
    kijelolt = (i + elemek.length) % elemek.length;
    elemek.forEach((el, j) => el.setAttribute("aria-selected", j === kijelolt));
    elemek[kijelolt].scrollIntoView({ block: "nearest" });
    $("#q").setAttribute("aria-activedescendant", elemek[kijelolt].id);
  }

  /* ------------------------------------------------------------ címlap-ablak */
  async function nyit(id) {
    const c = SOR.get(id);
    if (!c) return;
    const lap = $("#lap");
    $("#lap-cim").textContent = c.cim;
    $("#lap-meta").textContent = c.eredeti ? `${c.eredeti}, ${metaSzoveg(c)}` : metaSzoveg(c);
    $("#lap-plakat").innerHTML = `<div class="plakat">${plakatHTML(c, "s332")}</div>`;
    $("#lap-hatter").style.backgroundImage = "";
    $("#lap-leiras").textContent = "";
    const hol = () => c.aj.map((a) => {
      const ny = a.ismert ? (a.hang ? "magyar hanggal" : a.felirat ? "magyar felirattal" : "csak eredeti nyelven") : "";
      const arTxt = a.ingyen ? "ingyen nézhető" : `${ft(ar(a.kod))}/hó`;
      const link = EXTRA.linkek && EXTRA.linkek[a.kod] ? `<a href="${esc(EXTRA.linkek[a.kod])}" target="_blank" rel="noopener">megnyitom</a>` : "";
      return `<li><span class="jelveny" style="--c: var(--j-${a.kod})">${esc(NEV[a.kod])}</span><span>${arTxt}${ny ? `, ${ny}` : ""}</span>${a.vege >= MA ? `<span class="vege">${esc(ragos(a.vege))} lekerül</span>` : ""}${link}</li>`;
    }).join("");
    EXTRA.linkek = null;
    $("#lap-hol").innerHTML = hol();
    const gomb = $("#lap-felir");
    const frissGomb = () => { const rajta = allapot.lista.includes(id); gomb.textContent = rajta ? "Leveszem a listámról" : "Felírom a listámra"; gomb.dataset.be = id; };
    frissGomb();
    lap.dataset.id = id;
    if (!lap.open) lap.showModal();
    try {
      const darab = [...id].reduce((s, ch) => s + ch.charCodeAt(0), 0) % 32;
      if (!EXTRA[darab]) EXTRA[darab] = await (await fetch(`data/extra/${String(darab).padStart(2, "0")}.json`)).json();
      if (lap.dataset.id !== id) return;
      const [leiras, linkek, , hatter] = EXTRA[darab][id] || ["", {}, "", ""];
      $("#lap-leiras").textContent = leiras || "";
      EXTRA.linkek = linkek;
      $("#lap-hol").innerHTML = hol();
      const h = hatterKep(hatter);
      if (h) $("#lap-hatter").style.backgroundImage = `url("${h}")`;
    } catch (_) { /* leírás nélkül is működik */ }
  }

  /* ------------------------------------------------------------ naptár és megosztás */
  function naptar() {
    if (!utolsoTerv) return;
    const d = (n) => datum(n).toISOString().slice(0, 10).replace(/-/g, "");
    const most = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
    const ev = [];
    const t = utolsoTerv.honapok;
    t.forEach((h, i) => {
      ev.push([`Előfizetés: ${NEV[h.kod]}`, h.kezd, `Erre a ${h.db > 1 ? `${h.db} hónapra` : "hónapra"}: ${h.tetelek.map((x) => x.c.cim).join(", ")}`]);
      const kov = t[i + 1];
      ev.push([`Lemondás: ${NEV[h.kod]}`, h.vege - 1, kov ? `Holnaptól ${NEV[kov.kod]} jön. Mondd le most, hogy ne vonjon le még egy havidíjat.` : "A terv itt véget ér. Mondd le, hogy ne vonjon le még egy havidíjat."]);
    });
    const kesz = (s) => s.replace(/[\\,;]/g, "\\$&");
    const sorok = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Sorjaban//HU", "CALSCALE:GREGORIAN"];
    ev.forEach(([cim, nap, leiras], i) => {
      sorok.push("BEGIN:VEVENT", `UID:sorjaban-${MA}-${i}@sorjaban`, `DTSTAMP:${most}`,
        `DTSTART;VALUE=DATE:${d(nap)}`, `DTEND;VALUE=DATE:${d(nap + 1)}`, `SUMMARY:${kesz(cim)}`, `DESCRIPTION:${kesz(leiras)}`,
        "BEGIN:VALARM", "TRIGGER:PT9H", "ACTION:DISPLAY", `DESCRIPTION:${kesz(cim)}`, "END:VALARM", "END:VEVENT");
    });
    sorok.push("END:VCALENDAR");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([sorok.join("\r\n")], { type: "text/calendar;charset=utf-8" }));
    a.download = "sorjaban-emlekezteto.ics";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    uzen("Letöltődött a naptárfájl. Nyisd meg, és a naptárad felveszi az emlékeztetőket.");
  }

  async function megoszt() {
    const p = new URLSearchParams({ l: allapot.lista.join(","), e: allapot.estek, h: allapot.csakMagyar ? "1" : "0", o: allapot.megvan.join(",") });
    const url = `${location.origin}${location.pathname}#${p.toString().replace(/%2C/g, ",")}`;
    try {
      if (navigator.share && matchMedia("(pointer: coarse)").matches) { await navigator.share({ title: "A streaming-tervem", url }); return; }
      await navigator.clipboard.writeText(url);
      uzen("A link a vágólapon van.");
    } catch (_) { window.prompt("Másold ki a linket:", url); }
  }

  /* ------------------------------------------------------------ események */
  function rajzolMind(animal = true) { ment(); rajzolLista(); rajzolTerv(animal); }
  function valt(id) {
    const i = allapot.lista.indexOf(id);
    if (i === -1) allapot.lista.push(id); else allapot.lista.splice(i, 1);
    const rajta = allapot.lista.includes(id);
    document.querySelectorAll(`[data-be="${CSS.escape(id)}"]`).forEach((g) => {
      g.setAttribute("aria-pressed", rajta);
      if (g.classList.contains("felir")) g.textContent = rajta ? "Felírva" : "Felírom";
      if (g.classList.contains("kartya__gomb")) g.textContent = rajta ? "✓" : "+";
      if (g.id === "lap-felir") g.textContent = rajta ? "Leveszem a listámról" : "Felírom a listámra";
    });
    rajzolMind();
    rajzolLekerul(); rajzolUjak();
    const c = SOR.get(id);
    if (c) uzen(rajta ? `Felírtam: ${c.cim}` : `Levettem: ${c.cim}`);
  }

  function bekot() {
    let idozito;
    const q = $("#q");
    q.addEventListener("input", () => { clearTimeout(idozito); idozito = setTimeout(() => keres(q.value), 110); });
    q.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); jelol(kijelolt + 1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); jelol(kijelolt - 1); }
      else if (e.key === "Enter" && talalatok.length) { e.preventDefault(); valt(talalatok[Math.max(0, kijelolt)].id); }
      else if (e.key === "Escape") { $("#talalatok").hidden = true; q.setAttribute("aria-expanded", "false"); }
    });
    q.addEventListener("focus", () => { if (q.value.trim().length >= 2) keres(q.value); });
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".kereso")) { $("#talalatok").hidden = true; q.setAttribute("aria-expanded", "false"); }
    });

    document.addEventListener("click", (e) => {
      const be = e.target.closest("[data-be]");
      if (be) { e.stopPropagation(); valt(be.dataset.be); return; }
      const ny = e.target.closest("[data-nyit]");
      if (ny) { nyit(ny.dataset.nyit); return; }
      const sz = e.target.closest("[data-szuro]");
      if (sz) { lekerulSzuro = sz.dataset.szuro; rajzolLekerul(); }
    });

    const lap = $("#lap");
    $("#lap-bezar").addEventListener("click", () => lap.close());
    lap.addEventListener("click", (e) => { if (e.target === lap) lap.close(); });

    const ki = $("#estek-ki");
    ki.textContent = allapot.estek;
    const lep = (d) => { allapot.estek = Math.min(30, Math.max(2, allapot.estek + d)); ki.textContent = allapot.estek; rajzolMind(false); };
    $("#estek-le").addEventListener("click", () => lep(-1));
    $("#estek-fel").addEventListener("click", () => lep(1));

    const cs = $("#csakmagyar");
    cs.setAttribute("aria-pressed", allapot.csakMagyar);
    cs.addEventListener("click", () => {
      allapot.csakMagyar = !allapot.csakMagyar; cs.setAttribute("aria-pressed", allapot.csakMagyar);
      ment(); if (q.value) keres(q.value); rajzolLekerul(); rajzolUjak();
    });

    $("#megvan").innerHTML = PL.filter((k) => ar(k) > 0)
      .map((k) => `<button type="button" data-megvan="${k}" aria-pressed="${allapot.megvan.includes(k)}">${esc(NEV[k])}</button>`).join(" ");
    $("#megvan").addEventListener("click", (e) => {
      const b = e.target.closest("[data-megvan]");
      if (!b) return;
      const k = b.dataset.megvan;
      allapot.megvan = allapot.megvan.includes(k) ? allapot.megvan.filter((x) => x !== k) : [...allapot.megvan, k];
      b.setAttribute("aria-pressed", allapot.megvan.includes(k));
      rajzolMind();
    });

    $("#naptar").addEventListener("click", naptar);
    $("#megosztas").addEventListener("click", megoszt);
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
    const db = SOR.size.toLocaleString("hu-HU").replace(/\s/g, " ");
    $("#platformszam").textContent = `${db} film és sorozat a Netflix, HBO Max, Disney+, Prime Video, SkyShowtime, Apple TV, RTL+ és MediaKlikk mai kínálatából.`;
    rajzolFal();
    bekot();
    rajzolLista();
    rajzolTerv();
    rajzolLekerul();
    rajzolUjak();
  }

  indul();
})();
