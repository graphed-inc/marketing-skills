#!/usr/bin/env python3
"""Check rendered chunks that were downloaded from storage (one folder per chunk with index.m3u8, init.mp4, seg_*.m4s).

For each folder: join to <name>.mp4 (no re-encode), print video frames / length, audio length, loudness, and
write a contact sheet <name>-sheet.jpg (one frame every 5 s).

  python3 scripts/check-chunks.py <dir with chunk folders>
"""
import os, re, subprocess, sys

root = os.path.abspath(sys.argv[1])
for name in sorted(os.listdir(root)):
    d = os.path.join(root, name)
    if not os.path.isfile(os.path.join(d, "index.m3u8")):
        continue
    mp4 = os.path.join(root, name + ".mp4")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", os.path.join(d, "index.m3u8"), "-c", "copy", mp4], check=True)
    probe = subprocess.check_output(["ffprobe", "-v", "error", "-count_packets", "-show_entries",
                                     "stream=codec_type,duration,nb_read_packets", "-of", "csv=p=0", mp4]).decode().split()
    vol = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", mp4, "-af", "volumedetect", "-vn", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    mean = re.search(r"mean_volume: ([-\d.]+)", vol)
    peak = re.search(r"max_volume: ([-\d.]+)", vol)
    sheet = os.path.join(root, name + "-sheet.jpg")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", mp4, "-vf", "select='not(mod(n,150))',scale=640:-1,tile=3x2",
                    "-frames:v", "1", sheet], check=True)
    print(f"{name}: {' | '.join(probe)}  mean {mean.group(1) if mean else '?'} dB, peak {peak.group(1) if peak else '?'} dB  sheet {sheet}")
