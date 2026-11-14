"""Look before recording: sign in, screenshot the crew overview and each candidate's Telemetry tab once loaded."""
import os, sys, time
from playwright.sync_api import sync_playwright
from dash_common import open_browser, sign_in, BASE

OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
with sync_playwright() as p:
    b, pg = open_browser(p)
    sign_in(pg)
    t0 = time.time()
    pg.wait_for_selector("text=Earth link", timeout=90000)
    print(f"overview loaded {time.time()-t0:.0f}s")
    time.sleep(2); pg.screenshot(path=f"{OUT}/overview.png", full_page=True)
    print("links", pg.eval_on_selector_all("a[href*='/astronaut/']", "els => els.map(e => e.getAttribute('href'))"))
    for who in ["kwame", "hiro"]:
        pg.goto(f"{BASE}/astronaut/{who}"); t0 = time.time()
        try: pg.wait_for_selector("text=Hybrid watch pipeline", timeout=90000)
        except Exception as e: print(who, "no pipeline", e)
        time.sleep(4); print(f"{who} loaded {time.time()-t0:.0f}s alerts:", pg.locator("[role=alert]").count())
        pg.screenshot(path=f"{OUT}/rec_{who}.png", full_page=True)
    b.close()
