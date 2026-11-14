"""Shared Playwright setup for dashboard captures: 1280x720 CSS px at 1.5x = 1920x1080 frames, signed in as elena.
The PIN is read from the root .env and typed into the local sign-in form only; it is never printed or saved."""
import os, re, time
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
BASE = "http://localhost:3000"


def env_pin(name):
    for line in open(os.path.join(ROOT, ".env"), encoding="utf-8"):
        m = re.match(rf"\s*DEMO_PIN_{name.upper()}\s*=\s*['\"]?([0-9]+)", line)
        if m: return m.group(1)
    raise SystemExit(f"no DEMO_PIN_{name.upper()} in .env")


def open_browser(p, headless=True):
    b = p.chromium.launch(channel="chrome", headless=headless, args=["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--hide-scrollbars"])
    ctx = b.new_context(viewport={"width": 1280, "height": 720}, device_scale_factor=1.5, color_scheme="dark", reduced_motion="no-preference")
    return b, ctx.new_page()


def sign_in(pg, who="elena"):
    pg.goto(BASE)
    pg.locator("input[autocomplete=username]").fill(who)
    pg.locator("input[autocomplete=current-password]").fill(env_pin(who))
    pg.get_by_role("button", name="Sign in").click()
    pg.get_by_role("button", name="Sign in").wait_for(state="detached", timeout=60000)
    pg.wait_for_selector("text=Crew overview", timeout=90000); pg.wait_for_timeout(1500)  # session cookie settled
