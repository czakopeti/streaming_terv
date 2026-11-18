"""Napi katalógus-frissítés a Sorjában oldalhoz.

Források:
  - JustWatch (HU): címek, platformok, magyar hang/felirat, lekerülési dátum
  - RTL+: nyilvános műsortérkép (sitemap-program.xml) és műsoroldalak

Kimenet (docs/data/):
  catalog.json  – tömör címlista a keresőhöz és a tervezőhöz
  extra.json    – rövid leírás és platform-linkek (lusta betöltés)
  rtl_cache.json – RTL+ műsoroldalak gyorsítótára (csak új műsorokat kérünk le)
"""
from __future__ import annotations

import html
import json
import os
import re
import sys
import time
from datetime import datetime, timezone

import requests

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "docs", "data")
os.makedirs(DATA, exist_ok=True)

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/130.0 Safari/537.36")
S = requests.Session()
S.headers.update({"User-Agent": UA, "Accept-Language": "hu-HU,hu;q=0.9"})

JW = "https://apis.justwatch.com/graphql"

# Platformok sorrendje = index a catalog.json-ban. A kód a JustWatch rövid neve.
PLATFORMS = [
    ("nfx", "Netflix"),
    ("mxx", "HBO Max"),
    ("dnp", "Disney+"),
    ("prv", "Prime Video"),
    ("sst", "SkyShowtime"),
    ("atp", "Apple TV"),
    ("mdk", "MediaKlikk"),
    ("rtl", "RTL+"),
]
JW_CODES = [c for c, _ in PLATFORMS if c != "rtl"]
PIDX = {c: i for i, (c, _) in enumerate(PLATFORMS)}

CONTENT_FIELDS = ["title", "originalTitle", "originalReleaseYear", "shortDescription",
                  "runtime", "ageCertification", "genres { shortName }",
                  "scoring { imdbScore }", "fullPath", "posterUrl",
                  "backdrops { backdropUrl }"]
OFFER_FIELDS = ["monetizationType", "audioLanguages", "subtitleLanguages",
                "availableToTime", "availableFromTime", "standardWebURL"]


def build_query(cf, of):
    return ("query($f:[String!],$filter:TitleFilter,$after:String){ popularTitles(country: HU, first:100, "
            "after:$after, filter:$filter) { totalCount pageInfo{endCursor hasNextPage} "
            "edges { node { id objectType content(country: HU, language:\"hu\"){ "
            + " ".join(cf) + " } offers(country: HU, platform: WEB, filter:{packages:$f}) { "
            + " ".join(of) + " } } } } }")


COUNT_Q = ("query($filter:TitleFilter){ popularTitles(country: HU, first:1, filter:$filter) "
           "{ totalCount } }")
LIMIT = 1900  # a JustWatch ennél mélyebbre nem lapoz
THIS_YEAR = datetime.now(timezone.utc).year


def count(filt):
    d = jw_post(COUNT_Q, {"filter": filt})
    return ((d.get("data") or {}).get("popularTitles") or {}).get("totalCount") or 0


def slices(code):
    """Szeletek, amelyek mindegyike LIMIT alatt van: típus, aztán évtartomány szerint."""
    base = {"packages": [code]}
    if count(base) <= LIMIT:
        return [base]
    out = []
    stack = [dict(base, objectTypes=[t], releaseYear={"min": 1900, "max": THIS_YEAR + 1})
             for t in ("MOVIE", "SHOW")]
    while stack:
        f = stack.pop()
        n = count(f)
        lo, hi = f["releaseYear"]["min"], f["releaseYear"]["max"]
        if n <= LIMIT or lo >= hi:
            if n:
                out.append(f)
            continue
        mid = (lo + hi) // 2 if hi - lo > 60 else max(lo, hi - max(1, (hi - lo) // 3))
        mid = min(max(mid, lo), hi - 1)
        stack.append(dict(f, releaseYear={"min": lo, "max": mid}))
        stack.append(dict(f, releaseYear={"min": mid + 1, "max": hi}))
    return out


STATS = {"requests": 0, "retries": 0}


def jw_post(query, variables, tries=7):
    for i in range(tries):
        STATS["requests"] += 1
        try:
            r = S.post(JW, json={"query": query, "variables": variables}, timeout=40)
            if r.status_code == 200:
                d = r.json()
                if not d.get("errors") or d.get("data"):
                    time.sleep(0.6)
                    return d
                print("JW hibaüzenet", d.get("errors")[:2])
            else:
                print("JW status", r.status_code, r.headers.get("retry-after"))
        except Exception as e:  # noqa: BLE001
            print("JW hiba", repr(e)[:200])
        STATS["retries"] += 1
        time.sleep(min(90, 5 * 2 ** i))
    return {"errors": [{"message": "no response"}]}


def resolve_fields():
    """Kidobja azokat a mezőket, amelyeket a séma nem ismer."""
    cf, of = list(CONTENT_FIELDS), list(OFFER_FIELDS)
    for _ in range(12):
        d = jw_post(build_query(cf, of), {"f": ["nfx"], "filter": {"packages": ["nfx"]}, "after": None})
        errs = [e.get("message", "") for e in d.get("errors", [])]
        if not errs:
            return cf, of
        dropped = False
        for msg in errs:
            m = re.search(r'Cannot query field "(\w+)"', msg)
            if m:
                name = m.group(1)
                cf = [f for f in cf if not f.startswith(name)]
                of = [f for f in of if not f.startswith(name)]
                print("kihagyott mező:", name)
                dropped = True
        if not dropped:
            raise SystemExit("JustWatch séma hiba: " + "; ".join(errs[:3]))
    return cf, of


def img_key(url):
    """'/poster/306213318/{profile}/the-white-lotus.{format}' -> '306213318/the-white-lotus'"""
    if not url:
        return ""
    m = re.match(r"/(?:poster|backdrop)/(\d+)/\{profile\}/([^.{]+)", url)
    return f"{m.group(1)}/{m.group(2)}" if m else ""


def day_index(iso):
    """ISO dátum -> napok 1970 óta (0, ha nincs)."""
    if not iso:
        return 0
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return int(dt.timestamp() // 86400)
    except ValueError:
        return 0


def fetch_justwatch():
    cf, of = resolve_fields()
    q = build_query(cf, of)
    titles: dict[str, dict] = {}
    for code in JW_CODES:
      rank, pages = 0, 0
      parts = slices(code)
      print(f"{code}: {len(parts)} szelet")
      for filt in parts:
        after, part_pages, pos = None, 0, 0
        while True:
            d = jw_post(q, {"f": [code], "filter": filt, "after": after})
            pt = (d.get("data") or {}).get("popularTitles")
            if not pt:
                print("üres oldal", code, d.get("errors"), file=sys.stderr)
                break
            for e in pt["edges"]:
                n = e["node"]
                c = n.get("content") or {}
                offers = [o for o in (n.get("offers") or [])
                          if o.get("monetizationType") in ("FLATRATE", "FREE", "ADS")]
                if not offers:
                    continue
                rank += 1
                pos += 1
                t = titles.setdefault(n["id"], {
                    "id": n["id"], "type": n["objectType"],
                    "title": c.get("title") or "", "orig": c.get("originalTitle") or "",
                    "year": c.get("originalReleaseYear") or 0,
                    "desc": (c.get("shortDescription") or "").strip(),
                    "runtime": c.get("runtime") or 0,
                    "age": c.get("ageCertification") or "",
                    "genres": [g["shortName"] for g in (c.get("genres") or [])],
                    "imdb": ((c.get("scoring") or {}).get("imdbScore")) or 0,
                    "path": c.get("fullPath") or "",
                    "poster": img_key(c.get("posterUrl")),
                    "backdrop": img_key(((c.get("backdrops") or [{}])[0] or {}).get("backdropUrl")),
                    "rank": 10**9, "offers": {},
                })
                t["rank"] = min(t["rank"], pos)
                hu_a = any("hu" in (o.get("audioLanguages") or []) for o in offers)
                hu_s = any("hu" in (o.get("subtitleLanguages") or []) for o in offers)
                lang_known = any(o.get("audioLanguages") for o in offers)
                free = any(o["monetizationType"] in ("FREE", "ADS") for o in offers)
                ends = [day_index(o.get("availableToTime")) for o in offers]
                ends = [x for x in ends if x]
                starts = [day_index(o.get("availableFromTime")) for o in offers]
                starts = [x for x in starts if x]
                t["offers"][code] = {
                    "a": hu_a, "s": hu_s, "k": lang_known, "free": free,
                    "end": max(ends) if ends else 0,
                    "from": min(starts) if starts else 0,
                    "url": offers[0].get("standardWebURL") or "",
                }
            pages += 1
            part_pages += 1
            if not pt["pageInfo"]["hasNextPage"] or part_pages >= LIMIT // 100:
                break
            after = pt["pageInfo"]["endCursor"]
      print(f"{code}: {rank} cím, {pages} oldal")
    return list(titles.values())


# ---------------------------------------------------------------- RTL+
def fetch_rtl():
    cache_path = os.path.join(DATA, "rtl_cache.json")
    try:
        cache = json.load(open(cache_path, encoding="utf-8"))
    except (OSError, ValueError):
        cache = {}
    r = S.get("https://www.rtlplusz.hu/sitemap-program.xml", timeout=30)
    urls = re.findall(r"<loc>\s*([^<]+?)\s*</loc>", r.text)
    live = set(urls)
    fresh = 0
    for u in urls:
        if u in cache and "img" in cache[u]:
            continue
        try:
            p = S.get(u, timeout=30)
        except Exception:  # noqa: BLE001
            continue
        if p.status_code != 200:
            continue
        h = p.text

        def meta(prop):
            m = re.search(rf'property="{prop}"\s+content="([^"]*)"', h)
            return html.unescape(m.group(1)).strip() if m else ""
        og_t, og_d = meta("og:title"), meta("og:description")
        title_tag = re.search(r"<title[^>]*>(.*?)</title>", h, re.S)
        raw = html.unescape(title_tag.group(1)) if title_tag else og_t
        name = raw.split("|")[0].strip() or og_t.split("|")[0].strip()
        img = meta("og:image")
        premium = "premium" in (raw + og_t + og_d).lower()
        generic = og_d.startswith("Még több")
        cache[u] = {"title": name, "desc": "" if generic else og_d, "premium": premium, "img": img}
        fresh += 1
        time.sleep(0.4)
    cache = {k: v for k, v in cache.items() if k in live}
    json.dump(cache, open(cache_path, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    print(f"RTL+: {len(cache)} műsor, ebből {fresh} új")
    return cache


# ---------------------------------------------------------------- összefésülés
SHARDS = 32


def shard_of(key):
    return sum(ord(ch) for ch in key) % SHARDS


def norm(s):
    s = s.lower()
    for a, b in zip("áéíóöőúüű", "aeiooouuu"):
        s = s.replace(a, b)
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def main():
    jw = fetch_justwatch()
    rtl = fetch_rtl()

    # RTL+ műsorok: ha a JustWatch már ismeri a címet, hozzáadjuk ajánlatként, különben új tétel
    by_name = {}
    for t in jw:
        by_name.setdefault(norm(t["title"]), t)
    rtl_rank = len(jw) + 1
    for u, v in rtl.items():
        if not v["title"]:
            continue
        offer = {"a": True, "s": False, "k": True, "free": not v["premium"],
                 "end": 0, "from": 0, "url": u}
        hit = by_name.get(norm(v["title"]))
        if hit:
            hit["offers"]["rtl"] = offer
            continue
        rtl_rank += 1
        jw.append({"id": "rtl" + re.sub(r"\D", "", u.rsplit("p_", 1)[-1]), "type": "SHOW",
                   "title": v["title"], "orig": "", "year": 0, "desc": v["desc"],
                   "runtime": 0, "age": "", "genres": [], "imdb": 0, "path": "",
                   "poster": "", "backdrop": "", "rtl_img": v.get("img", ""),
                   "rank": rtl_rank, "offers": {"rtl": offer}})

    jw.sort(key=lambda t: t["rank"])
    genres = sorted({g for t in jw for g in t["genres"]})
    gidx = {g: i for i, g in enumerate(genres)}

    rows, extra = [], {}
    for t in jw:
        offers = []
        for code, o in t["offers"].items():
            flags = (1 if o["a"] else 0) | (2 if o["s"] else 0) | (4 if o["k"] else 0) \
                | (8 if o["free"] else 0)
            offers.append([PIDX[code], flags, o["end"], o["from"]])
        offers.sort()
        orig = t["orig"] if t["orig"] and norm(t["orig"]) != norm(t["title"]) else ""
        rows.append([t["id"], 1 if t["type"] == "SHOW" else 0, t["title"], orig,
                     t["year"], [gidx[g] for g in t["genres"]],
                     round(t["imdb"] * 10) if t["imdb"] else 0,
                     t["poster"] or (("rtl:" + t["rtl_img"]) if t.get("rtl_img") else ""), offers])
        desc = t["desc"]
        if len(desc) > 240:
            desc = desc[:240].rsplit(" ", 1)[0] + "…"
        extra[t["id"]] = [desc, {PLATFORMS[PIDX[c]][0]: o["url"] for c, o in t["offers"].items()},
                          t["path"], t.get("backdrop", "")]

    # biztosíték: ha egy platform a tegnapinál sokkal kevesebb címet ad, nem írjuk felül az adatot
    counts = {}
    for r in rows:
        for o in r[-1]:
            counts[PLATFORMS[o[0]][0]] = counts.get(PLATFORMS[o[0]][0], 0) + 1
    print("platformonként:", counts, "kérések:", STATS)
    try:
        prev = json.load(open(os.path.join(DATA, "catalog.json"), encoding="utf-8"))
        prev_counts = {}
        for r in prev["titles"]:
            for o in r[-1]:
                c = prev["platforms"][o[0]]["code"]
                prev_counts[c] = prev_counts.get(c, 0) + 1
        bad = [c for c, n in prev_counts.items() if n >= 20 and counts.get(c, 0) < 0.6 * n]
        if bad:
            raise SystemExit(f"Hiányos letöltés ({', '.join(bad)}), a tegnapi adat marad.")
    except (OSError, ValueError, KeyError):
        pass

    now = datetime.now(timezone.utc)
    catalog = {
        "updated": now.isoformat(timespec="minutes"),
        "today": int(now.timestamp() // 86400),
        "platforms": [{"code": c, "name": n} for c, n in PLATFORMS],
        "genres": genres,
        "cols": ["id", "show", "title", "orig", "year", "genres", "imdb10", "poster (JW id/slug vagy rtl:url)", "offers[platform, flags(1 hu hang,2 hu felirat,4 nyelv ismert,8 ingyenes), vege_nap, kezdete_nap]"],
        "titles": rows,
    }
    json.dump(catalog, open(os.path.join(DATA, "catalog.json"), "w", encoding="utf-8"),
              ensure_ascii=False, separators=(",", ":"))
    # leírások 32 darabban, hogy egy cím megnyitásakor csak egy kis fájl töltődjön le
    shard_dir = os.path.join(DATA, "extra")
    os.makedirs(shard_dir, exist_ok=True)
    shards = [{} for _ in range(SHARDS)]
    for k, v in extra.items():
        shards[shard_of(k)][k] = v
    for i, part in enumerate(shards):
        json.dump(part, open(os.path.join(shard_dir, f"{i:02d}.json"), "w", encoding="utf-8"),
                  ensure_ascii=False, separators=(",", ":"))
    old = os.path.join(DATA, "extra.json")
    if os.path.exists(old):
        os.remove(old)
    print(f"Kész: {len(rows)} cím, {len(genres)} műfaj")


if __name__ == "__main__":
    main()
