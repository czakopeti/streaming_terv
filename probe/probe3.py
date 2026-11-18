"""3. kör: Netflix és SkyShowtime magyar szinkron pótlása a nyilvános címoldalakról.

JustWatch adja a címet és a platform-linket, a platform nyilvános oldala a hangsávokat.
"""
import json
import os
import re
import time

import requests

OUT = os.path.join(os.path.dirname(__file__), "..", "results")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/130.0 Safari/537.36")
S = requests.Session()
S.headers.update({"User-Agent": UA, "Accept-Language": "hu-HU,hu;q=0.9"})
JW = "https://apis.justwatch.com/graphql"
Q = """query($f:[String!],$after:String){ popularTitles(country: HU, first:100, after:$after,
  filter:{packages:$f}) { pageInfo{endCursor hasNextPage}
  edges { node { objectType content(country: HU, language:"hu"){ title originalReleaseYear }
    offers(country: HU, platform: WEB, filter:{packages:$f}) { standardWebURL } } } } }"""

R = {}


def jw_titles(code, pages=1):
    out, after = [], None
    for _ in range(pages):
        d = S.post(JW, json={"query": Q, "variables": {"f": [code], "after": after}}, timeout=30).json()
        pt = d["data"]["popularTitles"]
        for e in pt["edges"]:
            urls = [o["standardWebURL"] for o in e["node"]["offers"] or [] if o.get("standardWebURL")]
            if urls:
                out.append({"title": e["node"]["content"]["title"],
                            "year": e["node"]["content"]["originalReleaseYear"],
                            "type": e["node"]["objectType"], "url": urls[0]})
        if not pt["pageInfo"]["hasNextPage"]:
            break
        after = pt["pageInfo"]["endCursor"]
    return out


def robots(base):
    try:
        return S.get(base + "/robots.txt", timeout=20).text[:3000]
    except Exception as e:  # noqa: BLE001
        return repr(e)


# Netflix: a nyilvános oldal JSON-LD-t és "Hang"/"Feliratok" blokkot tartalmaz
LANG_PAT = re.compile(r'"(?:audio|subtitle)[A-Za-z]*"\s*:\s*\[[^\]]{0,800}\]', re.I)


def netflix_page(url):
    m = re.search(r"/title/(\d+)", url)
    if not m:
        return None
    u = f"https://www.netflix.com/hu/title/{m.group(1)}"
    r = S.get(u, timeout=25)
    html = r.text
    info = {"status": r.status_code, "final": r.url, "bytes": len(html)}
    # Magyar oldal: "Hang" és "Feliratok" címkék után nyelvek listája
    blocks = re.findall(r"(Hang|Audio|Feliratok|Subtitles)\s*</[^>]+>\s*(?:<[^>]+>\s*)*([^<]{2,400})", html)
    info["label_blocks"] = blocks[:6]
    info["json_lang"] = LANG_PAT.findall(html)[:4]
    low = html.lower()
    info["mentions_magyar"] = low.count("magyar")
    return info, html


def netflix():
    res = {"robots": robots("https://www.netflix.com")}
    titles = jw_titles("nfx", pages=1)[:40]
    res["checked"] = 0
    res["hu_audio_found"] = 0
    res["samples"] = []
    for i, t in enumerate(titles):
        try:
            got = netflix_page(t["url"])
        except Exception as e:  # noqa: BLE001
            res["samples"].append({"title": t["title"], "error": repr(e)[:120]})
            continue
        if not got:
            continue
        info, html = got
        if i == 0:
            open(os.path.join(OUT, "netflix_title_page.html"), "w").write(html[:400_000])
        res["checked"] += 1
        text = " ".join(b[1] for b in info["label_blocks"] if b[0] in ("Hang", "Audio"))
        hu = "magyar" in text.lower() or "hungarian" in text.lower()
        res["hu_audio_found"] += int(hu)
        if len(res["samples"]) < 12:
            res["samples"].append({"title": t["title"], "hu_audio": hu, **info})
        time.sleep(0.8)
    return res


def skyshowtime():
    res = {"robots": robots("https://www.skyshowtime.com")}
    titles = jw_titles("sst", pages=1)[:5]
    res["samples"] = []
    for t in titles:
        try:
            r = S.get(t["url"], timeout=25)
        except Exception as e:  # noqa: BLE001
            res["samples"].append({"url": t["url"], "error": repr(e)[:120]})
            continue
        h = r.text
        res["samples"].append({
            "title": t["title"], "url": t["url"], "status": r.status_code, "final": r.url,
            "bytes": len(h), "magyar": h.lower().count("magyar"),
            "audio_hint": re.findall(r'"(?:audio|languages?)[A-Za-z]*"\s*:\s*[\[{][^\]}]{0,300}', h, re.I)[:3]})
        if len(res["samples"]) == 1:
            open(os.path.join(OUT, "skyshowtime_title_page.html"), "w").write(h[:400_000])
        time.sleep(0.8)
    return res


for k, fn in [("netflix", netflix), ("skyshowtime", skyshowtime)]:
    try:
        R[k] = fn()
    except Exception as e:  # noqa: BLE001
        R[k] = {"error": repr(e)}
json.dump(R, open(os.path.join(OUT, "summary3.json"), "w"), ensure_ascii=False, indent=1)
print(json.dumps(R, ensure_ascii=False, indent=1)[:5000])
