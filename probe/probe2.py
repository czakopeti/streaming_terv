"""2. kör: mélyebb próba RTL+, TV2 Play, Filmio és a JustWatch magyar hangsáv-adatai."""
import json
import os
import re
import ssl
import socket
import subprocess
import time
from collections import Counter

import requests
import urllib3

OUT = os.path.join(os.path.dirname(__file__), "..", "results")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/130.0 Safari/537.36")
S = requests.Session()
S.headers.update({"User-Agent": UA, "Accept-Language": "hu-HU,hu;q=0.9"})
R = {}


def get(url, **kw):
    try:
        return S.get(url, timeout=25, **kw)
    except Exception as e:  # noqa: BLE001
        return e


def locs(xml):
    return re.findall(r"<loc>\s*([^<]+?)\s*</loc>", xml)


def meta(html):
    def m(p):
        x = re.search(p, html, re.I | re.S)
        return x.group(1).strip()[:200] if x else None
    return {
        "title": m(r"<title[^>]*>(.*?)</title>"),
        "og_title": m(r'property="og:title"\s+content="([^"]*)"'),
        "og_desc": m(r'property="og:description"\s+content="([^"]*)"'),
        "jsonld_types": re.findall(r'"@type"\s*:\s*"([A-Za-z]+)"', html)[:12],
        "premium_words": sorted({w.lower() for w in re.findall(
            r"(prémium|premium|előfizet\w*|ingyenes|free)", html, re.I)}),
        "bytes": len(html),
    }


# ---------------------------------------------------------------- RTL+
def rtl():
    res = {}
    r = get("https://www.rtlplusz.hu/sitemap-program.xml")
    progs = locs(r.text) if not isinstance(r, Exception) else []
    res["program_sitemap_status"] = getattr(r, "status_code", repr(r)[:100])
    res["programs"] = len(progs)
    res["program_sample"] = progs[:15]
    res["program_pages"] = []
    for u in progs[:4]:
        p = get(u)
        if isinstance(p, Exception):
            continue
        res["program_pages"].append({"url": u, "status": p.status_code, **meta(p.text)})
        if len(res["program_pages"]) == 1:
            open(os.path.join(OUT, "rtl_program_page.html"), "w").write(p.text[:300_000])
        time.sleep(0.5)
    return res


# ---------------------------------------------------------------- TV2 Play
def tv2():
    res = {}
    idx = get("https://tv2play.hu/sitemap.xml")
    maps = locs(idx.text)
    slugs = Counter()
    total = 0
    for u in maps:
        s = get(u)
        if isinstance(s, Exception):
            continue
        for loc in locs(s.text):
            total += 1
            seg = loc.replace("https://tv2play.hu/", "").split("/")[0]
            if seg:
                slugs[seg] += 1
    res["sitemaps"] = len(maps)
    res["video_urls"] = total
    res["unique_shows"] = len(slugs)
    res["top_shows"] = slugs.most_common(40)
    res["show_pages"] = []
    for slug, _ in slugs.most_common(60)[::20][:3]:
        p = get(f"https://tv2play.hu/{slug}")
        if isinstance(p, Exception):
            continue
        res["show_pages"].append({"slug": slug, "status": p.status_code, **meta(p.text)})
    # Googlebot-szerű kérés: kap-e előrenderelt HTML-t?
    p = get(f"https://tv2play.hu/{slugs.most_common(1)[0][0]}",
            headers={"User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"})
    if not isinstance(p, Exception):
        res["googlebot_view"] = {"status": p.status_code, **meta(p.text)}
    return res


# ---------------------------------------------------------------- Filmio
def filmio():
    res = {}
    try:
        out = subprocess.run(
            "echo | openssl s_client -connect filmio.hu:443 -servername filmio.hu -showcerts 2>&1 | "
            "grep -E 's:|i:|Verify return code' | head -12",
            shell=True, capture_output=True, text=True, timeout=30)
        res["tls_chain"] = out.stdout
    except Exception as e:  # noqa: BLE001
        res["tls_chain"] = repr(e)
    for u in ["https://www.filmio.hu", "http://filmio.hu"]:
        r = get(u)
        res[u] = getattr(r, "status_code", repr(r)[:150])
    # Diagnosztika: csak nyilvános oldalak olvasása, a hiányos tanúsítványlánc miatt
    urllib3.disable_warnings()
    r = get("https://filmio.hu", verify=False)
    if not isinstance(r, Exception):
        res["home_unverified"] = {"status": r.status_code, "final": r.url, **meta(r.text)}
        open(os.path.join(OUT, "filmio_home.html"), "w").write(r.text[:300_000])
        for path in ["/robots.txt", "/sitemap.xml"]:
            x = get("https://filmio.hu" + path, verify=False)
            if not isinstance(x, Exception):
                res[path] = {"status": x.status_code, "head": x.text[:600],
                             "locs": len(locs(x.text))}
        res["api_hints"] = sorted(set(re.findall(
            r'https?://[a-z0-9.-]+/(?:api|graphql|v\d)[^"\'\s<>]{0,60}', r.text)))[:15]
    return res


# ------------------------------------------------- JustWatch: magyar hang arány
JW = "https://apis.justwatch.com/graphql"
Q = """query($f:[String!],$after:String){ popularTitles(country: HU, first:100, after:$after,
  filter:{packages:$f}) { totalCount pageInfo{endCursor hasNextPage}
  edges { node { objectType content(country: HU, language:"hu"){ title }
    offers(country: HU, platform: WEB, filter:{packages:$f}) {
      audioLanguages subtitleLanguages availableToTime } } } } }"""


def jw_lang():
    res = {}
    for name, code in [("Netflix", "nfx"), ("HBO Max", "mxx"), ("Disney+", "dnp"),
                       ("Prime Video", "prv"), ("SkyShowtime", "sst"), ("Apple TV+", "atp"),
                       ("FilmBox+", "flb")]:
        n = hu_a = hu_s = leaving = 0
        after = None
        for _ in range(3):  # 300 legnépszerűbb cím
            try:
                d = S.post(JW, json={"query": Q, "variables": {"f": [code], "after": after}},
                           timeout=30).json()
            except Exception:  # noqa: BLE001
                break
            pt = (d.get("data") or {}).get("popularTitles") or {}
            for e in pt.get("edges") or []:
                offs = e["node"].get("offers") or []
                if not offs:
                    continue
                n += 1
                if any("hu" in (o.get("audioLanguages") or []) for o in offs):
                    hu_a += 1
                if any("hu" in (o.get("subtitleLanguages") or []) for o in offs):
                    hu_s += 1
                if any(o.get("availableToTime") for o in offs):
                    leaving += 1
            if not (pt.get("pageInfo") or {}).get("hasNextPage"):
                break
            after = pt["pageInfo"]["endCursor"]
            time.sleep(0.3)
        res[name] = {"checked": n, "hu_audio": hu_a, "hu_subs": hu_s, "has_end_date": leaving}
    return res


for key, fn in [("rtl_plus", rtl), ("tv2_play", tv2), ("filmio", filmio), ("justwatch_hu_lang", jw_lang)]:
    try:
        R[key] = fn()
    except Exception as e:  # noqa: BLE001
        R[key] = {"error": repr(e)}
with open(os.path.join(OUT, "summary2.json"), "w") as f:
    json.dump(R, f, ensure_ascii=False, indent=1)
print(json.dumps(R, ensure_ascii=False, indent=1)[:5000])
