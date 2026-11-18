"""Képernyőképek a GitHub szerverén (ahol a plakátképek elérhetők)."""
import asyncio, os
from playwright.async_api import async_playwright

OUT = "elonezet"
os.makedirs(OUT, exist_ok=True)
URL = "http://localhost:8765/"
CIMEK = ["feher lotusz", "andor", "the last of us", "kameleon", "dune", "wednesday", "shrek"]


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        naplo = []
        for nev, vp, dpr in [("asztal", {"width": 1440, "height": 900}, 1), ("mobil", {"width": 390, "height": 844}, 2)]:
            ctx = await b.new_context(viewport=vp, device_scale_factor=dpr, locale="hu-HU")
            pg = await ctx.new_page()
            pg.on("pageerror", lambda e: naplo.append(f"{nev} HIBA: {e}"))
            pg.on("console", lambda m: naplo.append(f"{nev} console {m.type}: {m.text}") if m.type in ("error", "warning") else None)
            await pg.goto(URL, wait_until="networkidle")
            await pg.wait_for_timeout(2500)
            await pg.screenshot(path=f"{OUT}/{nev}_1_nyito.png")
            await pg.screenshot(path=f"{OUT}/{nev}_2_teljes_ures.png", full_page=True)
            await pg.fill("#q", "harry")
            await pg.wait_for_timeout(1500)
            await pg.screenshot(path=f"{OUT}/{nev}_3_kereso.png")
            for q in CIMEK:
                await pg.fill("#q", q)
                await pg.wait_for_timeout(400)
                g = pg.locator("#talalatok [data-be]").first
                if await g.count():
                    await g.click()
                    await pg.wait_for_timeout(200)
            await pg.fill("#q", "")
            await pg.mouse.click(5, 5)
            await pg.locator("#terv-cim").scroll_into_view_if_needed()
            await pg.wait_for_timeout(2000)
            await pg.screenshot(path=f"{OUT}/{nev}_4_terv.png")
            await pg.screenshot(path=f"{OUT}/{nev}_5_teljes_lista.png", full_page=True)
            await pg.locator("#listam [data-nyit]").first.click()
            await pg.wait_for_timeout(2500)
            await pg.screenshot(path=f"{OUT}/{nev}_6_cimlap.png")
            await ctx.close()
        open(f"{OUT}/naplo.txt", "w").write("\n".join(naplo) or "nincs hiba")
        await b.close()

asyncio.run(main())
