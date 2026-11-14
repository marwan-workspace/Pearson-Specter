"""Final cut: 00-hook + 01-problem (approved, untouched) + the Motion Reel scenes 02-05, one score under it all.
Master: -14 LUFS integrated, -1 dBTP.   python assemble.py ../final/pearson-specter-hook.mp4"""
import json, os, re, subprocess, sys
import vid

OUT = sys.argv[1]; os.makedirs(os.path.dirname(OUT), exist_ok=True)
V = os.path.abspath(os.path.join(vid.SCRATCH, ".."))
p = lambda *a: os.path.join(V, *a)
REEL0 = 16.47 + 20.61
SCORE_GAIN, SFX_GAIN = float(os.environ.get("SCORE_GAIN", 0.45)), 0.6
tmp = p("work", "premaster.wav")

# 1. the reel's sound (voices, keys, heartbeat + Motion Reel SFX) brought to the approved clips' level
reel = p("work", "reel_mix.wav")
subprocess.run([vid.FF, "-loglevel", "error", "-y", "-i", p("work", "reel_fx.wav"), "-i", p("reel", "audio", "sfx.wav"), "-filter_complex",
                f"[1:a]volume={SFX_GAIN},aformat=channel_layouts=stereo[s];[0:a][s]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-15:TP=-1.5:LRA=11,aresample=48000[a]",
                "-map", "[a]", reel], check=True)

# 2. hook + problem audio as approved, then the reel, then the score under everything
g = (f"[0:a][1:a]concat=n=2:v=0:a=1[ab];[2:a]adelay={int(REEL0 * 1000)}:all=1[r];"
     f"[ab][r]amix=inputs=2:duration=longest:normalize=0[dry];[3:a]volume={SCORE_GAIN}[sc];"
     f"[dry][sc]amix=inputs=2:duration=longest:normalize=0[a]")
subprocess.run([vid.FF, "-loglevel", "error", "-y", "-i", p("clips", "00-hook.mp4"), "-i", p("clips", "01-problem.mp4"), "-i", reel,
                "-i", p("work", "score.wav"), "-filter_complex", g, "-map", "[a]", "-ar", "48000", "-ac", "2", tmp], check=True)

# 3. measure, then one static gain to -14 LUFS and a true-peak limiter (keeps the dynamics the clips were built with)
m = subprocess.run([vid.FF, "-hide_banner", "-i", tmp, "-af", "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True).stderr
I = float(re.findall(r"I:\s+(-?[\d.]+) LUFS", m)[-1]); gain = -14.0 - I
print(f"premaster {I} LUFS -> gain {gain:+.1f} dB")

# 4. picture: the three parts back to back, 1080p30
fc = ("[0:v]setsar=1,fps=30[v0];[1:v]setsar=1,fps=30[v1];[2:v]scale=1920:1080,setsar=1,fps=30[v2];[v0][v1][v2]concat=n=3:v=1:a=0,format=yuv420p[v];"
      f"[3:a]volume={gain:.2f}dB,alimiter=limit=0.84:level=false,aresample=48000[a]")
subprocess.run([vid.FF, "-loglevel", "error", "-y", "-i", p("clips", "00-hook.mp4"), "-i", p("clips", "01-problem.mp4"), "-i", p("out", "reel", "video_16x9.mp4"),
                "-i", tmp, "-filter_complex", fc, "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "medium", "-crf", "17",
                "-c:a", "aac", "-b:a", "256k", "-movflags", "+faststart", "-shortest", OUT], check=True)
m = subprocess.run([vid.FF, "-hide_banner", "-i", OUT, "-af", "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True).stderr
print("final:", " ".join(re.findall(r"(?:I|Peak):\s+-?[\d.]+ \w+", m)[-2:]), "->", OUT)
