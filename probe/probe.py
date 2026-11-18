"""Adatforrás-próba: mely magyar streaming-kínálatok gyűjthetők automatikusan.

Kimenet: results/summary.json + results/<forrás>_*.txt|json minták.
Futtatás: python probe/probe.py
"""
import json
import os
import re
import time
from urllib.parse import urljoin

import requests

OUT = os.path.join(os.path.dirname(__file__), "..", "results")
os.makedirs(OUT, exist_ok=True)

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/130.0 Safari/537.36")
S = requests.Session()
S.headers.update({"User-Agent": UA, "Accept-Language": "hu-HU,hu;q=0.9,en;q=0.8"})

summary = {"generated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}


def save(name, content):
    path = os.path.join(OUT, name)
    mode = "w"
    if not isinstance(content, str):
        content = json.dumps(content, ensure_ascii=False, indent=1)
    with open(path, mode, encoding="utf-8") as f:
        f.write(content[:200_000])


def get(url, **kw):
    try:
        r = S.get(url, timeout=25, allow_redirects=True, **kw)
        return r
    except Exception as e:  # noqa: BLE001
        return e


# ---------------------------------------------------------------- JustWatch
JW = "https://apis.justwatch.com/graphql"


def jw(query, variables=None):
    try:
        r = S.post(JW, json={"query": query, "variables": variables or {}}, timeout=30)
        return r.status_code, r.json()
    except Exception as e:  # noqa: BLE001
        return None, {"error": repr(e)}


def probe_justwatch():
    res = {}
    code, data = jw("""query { packages(country: HU, platform: WEB) {
        packageId clearName shortName technicalName monetizationTypes } }""")
    res["packages_status"] = code
    pk = (data.get("data") or {}).get("packages") or []
    res["packages_count"] = len(pk)
    res["packages"] = [f'{p["clearName"]} [{p["shortName"]}]' for p in pk]
    save("justwatch_packages.json", data)

    hu_words = ["rtl", "tv2", "filmio", "mediaklikk", "telekom", "magenta", "skyshowtime", "max", "filmbox"]
    res["hungarian_relevant"] = [p for p in res["packages"]
                                 if any(w in p.lower() for w in hu_words)]

    # Címek + ajánlatok, nyelvi mezőkkel (ha a séma tudja)
    q_lang = """query($first:Int!){ popularTitles(country: HU, first:$first) {
      totalCount edges { node { objectType
        content(country: HU, language: "hu") { title originalReleaseYear
          externalIds { imdbId tmdbId } }
        offers(country: HU, platform: WEB) { monetizationType presentationType
          package { clearName shortName } standardWebURL
          audioLanguages subtitleLanguages availableToTime } } } } }"""
    code, data = jw(q_lang, {"first": 40})
    res["titles_with_lang_status"] = code
    res["titles_with_lang_errors"] = [e.get("message") for e in data.get("errors", [])][:5]
    if data.get("errors"):
        q = q_lang.replace("audioLanguages subtitleLanguages availableToTime", "")
        code, data = jw(q, {"first": 40})
        res["titles_status"] = code
        res["lang_fields_supported"] = False
    else:
        res["lang_fields_supported"] = True
    save("justwatch_titles_sample.json", data)
    pt = ((data.get("data") or {}).get("popularTitles") or {})
    res["hu_total_titles"] = pt.get("totalCount")
    edges = pt.get("edges") or []
    n_hu_audio = n_offers = 0
    for e in edges:
        for o in e["node"].get("offers") or []:
            n_offers += 1
            if "hu" in (o.get("audioLanguages") or []):
                n_hu_audio += 1
    res["sample_titles"] = len(edges)
    res["sample_offers"] = n_offers
    res["sample_offers_with_hu_audio"] = n_hu_audio

    # Csomagonkénti címszám a magyar platformokra
    per = {}
    for p in pk:
        name = p["clearName"].lower()
        if not any(w in name for w in hu_words + ["netflix", "disney", "prime", "apple tv"]):
            continue
        q = """query($f:[String!]){ popularTitles(country: HU, first:1,
               filter:{packages:$f}) { totalCount } }"""
        c, d = jw(q, {"f": [p["shortName"]]})
        per[p["clearName"]] = ((d.get("data") or {}).get("popularTitles") or {}).get("totalCount")
        time.sleep(0.3)
    res["titles_per_package"] = per
    return res


# ------------------------------------------------------------ Magyar platformok
SITES = {
    "rtl_plus": ["https://rtlplusz.hu", "https://www.rtlplusz.hu"],
    "tv2_play": ["https://tv2play.hu"],
    "filmio": ["https://filmio.hu"],
    "mediaklikk": ["https://mediaklikk.hu"],
    "nava_mtva_archivum": ["https://nava.hu"],
}


def probe_site(key, bases):
    res = {"tried": []}
    for base in bases:
        r = get(base)
        if isinstance(r, Exception):
            res["tried"].append({"url": base, "error": repr(r)[:200]})
            continue
        info = {"url": base, "status": r.status_code, "final_url": r.url,
                "bytes": len(r.content), "server": r.headers.get("server"),
                "content_type": r.headers.get("content-type")}
        html = r.text
        info["has_next_data"] = "__NEXT_DATA__" in html
        info["has_nuxt"] = "__NUXT__" in html or "_nuxt/" in html
        info["json_ld"] = html.count("application/ld+json")
        info["api_hints"] = sorted(set(re.findall(r'https?://[a-z0-9.-]*api[a-z0-9.-]*\.[a-z]{2,}[^"\'\s<>]{0,60}', html)))[:15]
        save(f"{key}_home.html", html)
        res["tried"].append(info)
        if r.status_code < 400:
            res["home_ok"] = True
            # robots + sitemap
            rb = get(urljoin(r.url, "/robots.txt"))
            if not isinstance(rb, Exception):
                res["robots_status"] = rb.status_code
                save(f"{key}_robots.txt", rb.text)
                sm = re.findall(r"(?im)^sitemap:\s*(\S+)", rb.text)
            else:
                sm = []
            sm = sm or [urljoin(r.url, "/sitemap.xml")]
            res["sitemaps"] = []
            for u in sm[:4]:
                s = get(u)
                if isinstance(s, Exception):
                    res["sitemaps"].append({"url": u, "error": repr(s)[:150]})
                    continue
                locs = re.findall(r"<loc>\s*([^<]+?)\s*</loc>", s.text)
                entry = {"url": u, "status": s.status_code, "locs": len(locs),
                         "sample": locs[:8]}
                # ha index: nézzünk bele az első 3 al-sitemapbe
                if "<sitemapindex" in s.text:
                    entry["children"] = []
                    for cu in locs[:6]:
                        c = get(cu)
                        if isinstance(c, Exception):
                            continue
                        cl = re.findall(r"<loc>\s*([^<]+?)\s*</loc>", c.text)
                        entry["children"].append({"url": cu, "status": c.status_code,
                                                  "locs": len(cl), "sample": cl[:5]})
                res["sitemaps"].append(entry)
                save(f"{key}_sitemap_{len(res['sitemaps'])}.xml", s.text)
            break
    return res


def main():
    try:
        summary["justwatch"] = probe_justwatch()
    except Exception as e:  # noqa: BLE001
        summary["justwatch"] = {"error": repr(e)}
    ip = get("https://ipinfo.io/json")
    summary["runner_location"] = ip.json() if not isinstance(ip, Exception) and ip.ok else None
    for k, v in SITES.items():
        try:
            summary[k] = probe_site(k, v)
        except Exception as e:  # noqa: BLE001
            summary[k] = {"error": repr(e)}
    save("summary.json", summary)
    print(json.dumps(summary, ensure_ascii=False, indent=1)[:6000])


if __name__ == "__main__":
    main()
