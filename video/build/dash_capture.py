"""Record the emergency + Mars scenes from the real dashboard with a CDP screencast (every painted frame, timestamped).

Writes OUT/f%05d.jpg, OUT/frames.json [[file, t], ...] and OUT/marks.json {label: t}; t is seconds from the start.
The film (video/reel) cuts the waits out by picking spans between marks. Signed in as elena; acts on Hiro.
Old, already-acknowledged alerts from earlier tests are hidden so only the new alert shows. The Earth link is
restored at the end so the shared mission is left as it was.
"""
import base64, json, os, sys, time
from playwright.sync_api import sync_playwright
from dash_common import open_browser, sign_in, BASE

OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
WHO = "hiro"
HIDE_OLD = "article[role=alert]:not(.pulse) { display: none !important; }"
frames, marks, T0 = [], {}, [None]


def mark(label):
    marks[label] = time.time() - T0[0]; print(f"{marks[label]:6.1f}s  {label}", flush=True)
    json.dump(marks, open(f"{OUT}/marks.json", "w"), indent=1)


def hold(pg, s):  # keep the event loop pumping so screencast frames are received
    end = time.time() + s
    while time.time() < end: pg.wait_for_timeout(50)


with sync_playwright() as p:
    b, pg = open_browser(p)
    sign_in(pg)
    cdp = pg.context.new_cdp_session(pg)

    def on_frame(ev):
        cdp.send("Page.screencastFrameAck", {"sessionId": ev["sessionId"]})
        if T0[0] is None: return
        name = f"f{len(frames):05d}.jpg"
        open(f"{OUT}/{name}", "wb").write(base64.b64decode(ev["data"]))
        frames.append([name, round(time.time() - T0[0], 4)])
    cdp.on("Page.screencastFrame", on_frame)

    for attempt in range(3):
        pg.goto(f"{BASE}/astronaut/{WHO}")
        try: pg.wait_for_selector("text=Hybrid watch pipeline", timeout=90000); break
        except Exception: pg.screenshot(path=f"{OUT}/fail_load{attempt}.png"); print("record did not load, retrying", flush=True)
    else: sys.exit("record never loaded")
    pg.add_style_tag(content=HIDE_OLD)
    pg.evaluate("window.scrollTo(0, 0)")
    T0[0] = time.time()
    cdp.send("Page.startScreencast", {"format": "jpeg", "quality": 92, "maxWidth": 1920, "maxHeight": 1080, "everyNthFrame": 1})
    hold(pg, 6); mark("tele")
    pg.screenshot(path=f"{OUT}/check_tele.png")
    hold(pg, 6)

    pg.locator("summary", has_text="Simulate").click(); mark("sim_open"); hold(pg, 1.2)
    pg.get_by_role("button", name="Bradycardia (tier 1)").click(); mark("sim_pick"); hold(pg, 1.2)
    pg.get_by_role("button", name="Confirm: inject bradycardia").click(); mark("confirm")
    try:
        pg.wait_for_selector("article[role=alert].pulse", timeout=150000); mark("alert")
    except Exception as e:
        mark("alert_timeout"); print(e)
    hold(pg, 6)
    pg.screenshot(path=f"{OUT}/check_alert.png")

    pg.locator("text=Hybrid watch pipeline").scroll_into_view_if_needed(); pg.evaluate("window.scrollBy(0, 200)")
    mark("pipe"); hold(pg, 7); pg.screenshot(path=f"{OUT}/check_pipe.png")

    pg.evaluate("window.scrollTo(0, 0)")
    pg.get_by_role("tab", name="Care").click(); mark("care")
    pg.wait_for_selector("text=Medication log", timeout=90000); mark("care_loaded"); hold(pg, 6)
    pg.screenshot(path=f"{OUT}/check_care.png", full_page=True)

    pg.evaluate("window.scrollTo(0, 0)")
    pg.get_by_role("tab", name="Events").click(); mark("events")
    pg.wait_for_selector("text=Crew alerts", timeout=90000); mark("events_loaded"); hold(pg, 6)
    pg.screenshot(path=f"{OUT}/check_events.png", full_page=True)

    pg.goto(BASE); pg.wait_for_selector("text=Reports are sent as they are written", timeout=120000)
    pg.add_style_tag(content=HIDE_OLD)
    pg.locator("text=Mission controls").scroll_into_view_if_needed(); mark("mission"); hold(pg, 4)
    pg.screenshot(path=f"{OUT}/check_mission.png")
    pg.get_by_role("switch", name="Earth link available").click(); mark("link_click")
    pg.wait_for_selector("text=Reports queue until the link is back", timeout=120000); mark("link_down"); hold(pg, 5)
    pg.screenshot(path=f"{OUT}/check_linkdown.png")
    cdp.send("Page.stopScreencast"); hold(pg, 0.5)
    json.dump(frames, open(f"{OUT}/frames.json", "w"))
    # leave the shared mission as we found it
    pg.get_by_role("switch", name="Earth link available").click()
    pg.wait_for_selector("text=Reports are sent as they are written", timeout=120000); print("earth link restored")
    b.close()
print(len(frames), "frames")
