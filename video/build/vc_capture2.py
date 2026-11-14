"""VitaCuff footage, frame-exact and jitter-free (replaces vc_capture.py).

The page clock is faked (each frame = exactly 1/30 s). Each frame is placed, rendered and read back with
canvas.toDataURL inside ONE evaluate call, so the pixels always belong to that frame (the old capture used
page.screenshot, which sometimes caught the previous WebGL frame). The camera, lights, syringe loading and a
starfield are driven from here; the bare unit stage is used, which carries no NASA logos.

  python vc_capture2.py OUT        -> OUT/vc/f%04d.jpg (scene 02, 10 s) and OUT/close/f%04d.jpg (scene 05, 4.6 s)
"""
import base64, os, sys, time
from playwright.sync_api import sync_playwright

OUT = sys.argv[1]
FPS = 30
URL = "http://localhost:3000/vitacuff/index.html"

CLOCK = """(() => {
  let now = 0; let q = [];
  performance.now = () => now;
  window.requestAnimationFrame = (cb) => { q.push(cb); return q.length; };
  window.cancelAnimationFrame = () => {};
  window.__step = (ms) => { now += ms; const cbs = q; q = []; for (const cb of cbs) cb(now); };
})();"""
HIDE = "header.bar, main, footer, #loader, .hint { visibility: hidden !important; } html, body { scrollbar-width: none; } ::-webkit-scrollbar { display: none; }"

SETUP = """() => {
  const { THREE, scene, camera, stages } = window.__vitacuff, st = stages.device;
  // camera: our own position/target every frame, no sideways view offset
  const look = camera.lookAt.bind(camera);
  camera.lookAt = function (...a) {
    const c = window.__cam; if (!c) return look(...a);
    this.position.set(...c.pos); this.up.set(0, 1, 0); look(new THREE.Vector3(...c.look));
  };
  camera.setViewOffset = function (fw, fh) { THREE.PerspectiveCamera.prototype.setViewOffset.call(this, fw, fh, 0, 0, fw, fh); };
  // syringe loading driven from here
  const setLoad = st.device.userData.setLoad;
  st.device.userData.setLoad = (x) => setLoad(window.__load ?? x);
  // lights: the page's key light plus a cold rim from behind
  window.__key = st.root.children.find((o) => o.isDirectionalLight);
  const rim = new THREE.DirectionalLight(0xbfd6ff, 0); rim.position.set(-0.25, 0.35, -0.9); st.root.add(rim); window.__rim = rim;
  const rim2 = new THREE.DirectionalLight(0xbfd6ff, 0); rim2.position.set(0.9, 0.15, -0.6); st.root.add(rim2); window.__rim2 = rim2;
  // seeded starfield on a far shell
  let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const N = 2600, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u), R = 3 + rnd() * 2;
    pos.set([Math.cos(a) * r * R, u * R, Math.sin(a) * r * R], i * 3);
    const b = 0.35 + 0.65 * rnd() ** 2; col.set([b * 0.9, b * 0.95, b], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const stars = new THREE.Points(g, new THREE.PointsMaterial({ size: 2.6, sizeAttenuation: false, vertexColors: true, toneMapped: false, fog: false }));
  st.root.add(stars);
  scene.background = new THREE.Color(0x000000); scene.fog = null;
  // no NASA insignia on screen: hide the logo plates on the unit's sides
  st.device.traverse((o) => { const m = o.material; if (o.isMesh && m && m.isMeshBasicMaterial && m.transparent && m.map && m.map.image && m.map.image.height === 856) o.visible = false; });
  // stretch the training arm (and its veins with it) so its cut ends stay out of frame in close shots
  for (const o of st.spin.children) if (o.isMesh && /Cylinder|Tube/.test(o.geometry.type)) o.scale.x = 2.5;
}"""

FRAME = """([cam, yaw, key, rim, rim2, env, load]) => {
  const v = window.__vitacuff; window.__cam = cam; v.stages.device.yaw = yaw; window.__load = load;
  window.__key.intensity = key; window.__rim.intensity = rim; window.__rim2.intensity = rim2; v.scene.environmentIntensity = env;
  v.scene.background.set(0x000000);
  window.__step(1000 / 30);
  return document.getElementById('scene').toDataURL('image/jpeg', 0.95);
}"""


def lerp(a, b, k): return [x + (y - x) * k for x, y in zip(a, b)] if isinstance(a, list) else a + (b - a) * k
def ease(k): k = max(0.0, min(1.0, k)); return k * k * (3 - 2 * k)
def ramp(t, a, b): return max(0.0, min(1.0, (t - a) / (b - a)))


# scene 02 (scene-local seconds; voice starts at 0.5 s: "VitaCuff" 1.26, "Reading" 4.44, "with its own" 6.97, "board" 8.67)
def vc(t):
    load = None
    if t < 1.26:   # A: from black, the cold rim draws the silhouette
        k = t / 1.26
        cam = [lerp([0.07, 0.05, 0.28], [0.055, 0.06, 0.25], k), [0, 0.04, 0]]
        yaw, key, env = -0.25, 0.0, 0.02
        rim, rim2 = 6 * ease(ramp(t, 0.1, 1.1)), 3 * ease(ramp(t, 0.5, 1.2))
    elif t < 4.40:  # B: "VitaCuff" - lights on, hero, slow orbit
        k = (t - 1.26) / 3.14
        cam = [lerp([0.12, 0.15, 0.30], [0.05, 0.16, 0.27], k), [0, 0.058, 0]]
        yaw, key, env, rim, rim2 = lerp(-0.3, 0.15, k), 2.2, 0.45, 5, 2.5
    elif t < 6.93:  # C: "Reading the body" - the live screen from above
        k = (t - 4.40) / 2.53
        cam = [lerp([0.012, 0.40, 0.17], [0.008, 0.27, 0.09], k), [0.007, 0.07, 0]]
        yaw, key, env, rim, rim2 = 0.0, 2.0, 0.45, 4, 2
    elif t < 8.90:  # D: "its own medicine on board" - the syringe bay loads
        k = (t - 6.93) / 1.97
        cam = [lerp([-0.20, 0.13, 0.20], [-0.19, 0.10, 0.15], k), [-0.10, 0.045, -0.01]]
        yaw, key, env, rim, rim2 = 0.0, 2.2, 0.45, 5, 2
        load = 1.15 * ease(ramp(t, 7.0, 8.45))
    else:           # E: pull back, the light dies, the rim stays
        k = (t - 8.90) / 1.1
        cam = [lerp([0.06, 0.12, 0.25], [0.09, 0.11, 0.32], k), [0, 0.045, 0]]
        yaw, key, env, rim, rim2 = lerp(0.2, 0.32, k), 2.2 * (1 - ease(ramp(t, 9.3, 10.0))), 0.45 * (1 - ease(ramp(t, 9.3, 10.0))), 5, 2.5
    return cam, yaw, key, rim, rim2, env, load


# scene 05: low hero, slow turn, rim-lit ("They carry the doctor... with them.")
def close(t):
    k = t / 4.6
    cam = [lerp([0.10, 0.13, 0.30], [0.07, 0.14, 0.27], k), [0, 0.05, 0]]
    return cam, lerp(-0.6, -0.1, k), 1.3, 6, 3, 0.25, None


with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome", headless=True, args=["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--hide-scrollbars"])
    pg = b.new_page(viewport={"width": 1920, "height": 1080}, device_scale_factor=1)
    pg.add_init_script(CLOCK)
    pg.goto(URL)
    for _ in range(600):
        if pg.evaluate("() => { window.__step(16); const l = document.getElementById('loader'); return !!window.__vitacuff && l && getComputedStyle(l).display === 'none'; }"): break
        time.sleep(0.1)
    else:
        sys.exit("models never finished loading")
    pg.add_style_tag(content=HIDE)
    pg.evaluate("() => { window.scrollTo(0, 0); window.dispatchEvent(new Event('scroll')); }")
    for _ in range(10): pg.evaluate("() => window.__step(1000/30)")
    pg.evaluate(SETUP)
    print("gl:", pg.evaluate("() => { const g = document.getElementById('scene').getContext('webgl2'); const e = g && g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?'; }"))
    for name, fn, dur in [("vc", vc, 10.0), ("close", close, 4.6)]:
        d = os.path.join(OUT, name); os.makedirs(d, exist_ok=True)
        cam, yaw, key, rim, rim2, env, load = fn(0)
        for _ in range(45): pg.evaluate(FRAME, [{"pos": cam[0], "look": cam[1]}, yaw, key, rim, rim2, env, load])  # settle shadows/AO
        n = int(round(dur * FPS)); t0 = time.time()
        for i in range(n):
            cam, yaw, key, rim, rim2, env, load = fn(i / FPS)
            url = pg.evaluate(FRAME, [{"pos": cam[0], "look": cam[1]}, yaw, key, rim, rim2, env, load])
            open(os.path.join(d, f"f{i:04d}.jpg"), "wb").write(base64.b64decode(url.split(",", 1)[1]))
            if i % 60 == 0: print(f"{name} {i}/{n} {time.time() - t0:.0f}s", flush=True)
    b.close()
print("done")
