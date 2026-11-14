"""End card: starfield, team title on a boom, subtitle and event line, then fade to black."""
import os, subprocess, sys
import vid

OUT = sys.argv[1]
DUR = 5.0
stars = os.path.join(vid.SCRATCH, "stars.pgm")  # made by clip_problem.py
sfx = vid.Track(DUR)
vid.drone(sfx, 0, DUR, gain=0.12)
vid.boom(sfx, 0.25, gain=0.9)
wav = os.path.join(vid.SCRATCH, "endcard_sfx.wav"); sfx.save(wav)

filters = [
    "scale=w='2112*(1+0.00012*n)':h=-2:eval=frame", "crop=1920:1080", "eq=brightness=0.02",
    f"drawtext=fontfile='{vid.TITLE}':text='PEARSON-SPECTER':fontsize=120:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2-60:alpha='min(1,(t-0.25)/0.4)':enable='gte(t,0.25)'",
    f"drawtext=fontfile='{vid.LIGHT}':text='Crew health system':fontsize=52:fontcolor=0xBFC7D5:x=(w-text_w)/2:y=h/2+50:alpha='min(1,(t-0.9)/0.6)':enable='gte(t,0.9)'",
    f"drawtext=fontfile='{vid.LIGHT}':text='Space Apps Challenge 2026 · Amman':fontsize=34:fontcolor=0x8A93A3:x=(w-text_w)/2:y=h-140:alpha='min(1,(t-1.5)/0.6)':enable='gte(t,1.5)'",
    f"fade=t=out:st={DUR - 0.8}:d=0.8",
]
graph = "[0:v]" + ",".join(filters) + ",format=yuv420p[v];[1:a]afade=t=out:st=4.2:d=0.8,loudnorm=I=-15:TP=-1.5:LRA=11[a]"
script = os.path.join(vid.SCRATCH, "endcard.filter.txt"); open(script, "w", encoding="utf-8").write(graph)
subprocess.run([vid.FF, "-loglevel", "error", "-y", "-loop", "1", "-framerate", "30", "-t", str(DUR), "-i", stars, "-i", wav,
                "-/filter_complex", script, "-map", "[v]", "-map", "[a]", "-t", str(DUR),
                "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", OUT], check=True)
print("wrote", OUT)
