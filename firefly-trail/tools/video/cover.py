#!/usr/bin/env python3
"""Export cover images from the finished videos.

    python3 cover.py <16x9.mp4> <9x16.mp4> <outDir> <t16x9> <t9x16>

Writes cover-16x9.jpg (1920x1080) and cover-3x4.jpg (1080x1440, the vertical layout's title + game window,
which is what 小红书 shows in the feed).
"""
import os, subprocess, sys
from PIL import Image

l, v, out, tl, tv = sys.argv[1:6]
os.makedirs(out, exist_ok=True)

def grab(mp4, t, path):
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-ss', str(t), '-i', mp4, '-frames:v', '1', '-q:v', '2', path], check=True)
    return Image.open(path).convert('RGB')

a = grab(l, tl, os.path.join(out, '_l.jpg'))
a.save(os.path.join(out, 'cover-16x9.jpg'), quality=92)
b = grab(v, tv, os.path.join(out, '_v.jpg'))
# 3:4 window around the title block + game window (see compose.py layout)
top = 200
b.crop((0, top, 1080, top + 1440)).save(os.path.join(out, 'cover-3x4.jpg'), quality=92)
for f in ('_l.jpg', '_v.jpg'):
    os.remove(os.path.join(out, f))
print('covers written to', out)
