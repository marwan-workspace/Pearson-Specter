"""Capture the VitaCuff page frame by frame at exactly 30 fps.

The page's clock (performance.now) and requestAnimationFrame are replaced before its scripts run, so each
output frame advances time by exactly 1/30 s no matter how slow the screenshot is. Scroll and model yaw follow
a keyframed timeline; the header, text panels and footer are hidden and the camera's sideways offset is removed
so the model sits centred.
"""
import math, os, sys, time
from playwright.sync_api import sync_playwright

OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
FPS, DUR = 30, 10.8
URL = "http://localhost:3000/vitacuff/index.html"

CLOCK = """(() => {
  let now = 0; let q = [];
  performance.now = () => now;
  window.requestAnimationFrame = (cb) => { q.push(cb); return q.length; };
  window.cancelAnimationFrame = () => {};
  window.__step = (ms) => { now += ms; const cbs = q; q = []; for (const cb of cbs) cb(now); };
})();"""
HIDE = "header.bar, main, footer, #loader, .hint { visibility: hidden !important; } html, body { scrollbar-width: none; } ::-webkit-scrollbar { display: none; }"

# keyframes (seconds -> value); eased with smoothstep between keys
SCROLL = [(0, 0), (4.1, 560), (4.6, 1728), (6.6, 2148), (7.0, 3456), (10.0, 4096), (DUR, 4096)]
YAW = [(0, -0.6), (4.1, 0.2), (6.6, 0.0), (DUR, -0.25)]


def at(keys, t):
    for (t0, v0), (t1, v1) in zip(keys, keys[1:]):
        if t <= t1:
            u = 0 if t1 == t0 else max(0.0, min(1.0, (t - t0) / (t1 - t0)))
            u = u * u * (3 - 2 * u)
            return v0 + (v1 - v0) * u
    return keys[-1][1]


with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome", headless=True, args=["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--hide-scrollbars"])
    pg = b.new_page(viewport={"width": 1920, "height": 1080}, device_scale_factor=1)
    pg.add_init_script(CLOCK)
    pg.goto(URL)
    # models load in real time; keep the fake clock ticking until the page says all four are in
    for _ in range(600):
        ready = pg.evaluate("() => { window.__step(16); const l = document.getElementById('loader'); return !!window.__vitacuff && l && getComputedStyle(l).display === 'none'; }")
        if ready: break
        time.sleep(0.1)
    else:
        sys.exit("models never finished loading")
    pg.add_style_tag(content=HIDE)
    pg.evaluate("""() => { const { THREE, camera } = window.__vitacuff;
      camera.setViewOffset = function (fw, fh, x, y, w, h) { THREE.PerspectiveCamera.prototype.setViewOffset.call(this, fw, fh, 0, y, w, h); }; }""")

    def place(t):
        pg.evaluate("([y, yaw]) => { window.scrollTo(0, y); window.dispatchEvent(new Event('scroll')); window.__vitacuff.stages.device.yaw = yaw; }",
                    [at(SCROLL, t), at(YAW, t)])

    place(0)
    for _ in range(90): pg.evaluate("() => window.__step(1000/30)")  # let the camera settle on the first shot
    n = int(round(DUR * FPS)); t0 = time.time()
    for i in range(n):
        place(i / FPS)
        pg.evaluate("() => window.__step(1000/30)")
        pg.screenshot(path=os.path.join(OUT, f"f{i:04d}.jpg"), type="jpeg", quality=93)
        if i % 30 == 0: print(f"frame {i}/{n}  {time.time() - t0:.0f}s", flush=True)
    b.close()
print("done", n, "frames")
