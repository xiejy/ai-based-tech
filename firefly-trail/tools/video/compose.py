#!/usr/bin/env python3
"""Cut the recorded shots together (crossfades, captions, title cards) and encode the demo video.

    python3 compose.py <shotsDir> <overlaysDir> <soundtrack.wav> <out.mp4> [landscape|vertical] [--preview N]

landscape: 1920x1080, the game full frame with lower-third captions.
vertical:  1080x1920 for phone feeds: blurred backdrop, the game in a rounded window, title above, captions below.
"""
import json, os, subprocess, sys
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter
import numpy as np

shots_dir, ov_dir, wav, out = sys.argv[1:5]
mode = sys.argv[5] if len(sys.argv) > 5 else 'landscape'
preview = int(sys.argv[sys.argv.index('--preview') + 1]) if '--preview' in sys.argv else 0

edit = json.load(open(os.path.join(os.path.dirname(__file__), 'edit.json'), encoding='utf-8'))
FPS, XF = edit['fps'], edit['crossfade']

# ---- timeline (same rule as timeline.js) ----
clips, end = [], 0.0
for i, s in enumerate(edit['shots']):
    meta = json.load(open(os.path.join(shots_dir, s['id'], 'meta.json')))
    xf = s.get('xf', XF)  # crossfade into this shot
    start = 0.0 if i == 0 else end - xf
    end = start + meta['dur']
    clips.append(dict(s, xf=xf, start=start, dur=meta['dur'], frames=meta['frames'], idx=i))
TOTAL = end
NFRAMES = int(round(TOTAL * FPS))

_cache = {}
def shot_frame(c, t):
    k = min(c['frames'] - 1, max(0, int(round((t - c['start']) * FPS))))
    key = (c['id'], k)
    if key not in _cache:
        if len(_cache) > 8:
            _cache.clear()
        _cache[key] = Image.open(os.path.join(shots_dir, c['id'], 'f%05d.jpg' % k)).convert('RGB')
    return _cache[key]

def frame_at(t):
    """(image, outgoing shot, incoming shot, blend 0..1) — during a crossfade both shots are live."""
    live = [c for c in clips if c['start'] - 1e-6 <= t < c['start'] + c['dur'] - 1e-6] or [clips[-1]]
    if len(live) == 1:
        return shot_frame(live[0], t), live[0], live[0], 0.0
    a, b = live[0], live[1]
    k = min(1.0, max(0.0, (t - b['start']) / b['xf']))
    k = k * k * (3 - 2 * k)
    return Image.blend(shot_frame(a, t), shot_frame(b, t), k), a, b, k

def crop_x(c, t):
    """Horizontal centre of the 9:16 window crop; 'cropKeys' animate it on the shot's own clock."""
    keys = c.get('cropKeys')
    if not keys:
        x = c.get('cropX', 960)
    else:
        lt = t - c['start']
        x = keys[-1][1]
        if lt <= keys[0][0]:
            x = keys[0][1]
        else:
            for (t0, x0), (t1, x1) in zip(keys, keys[1:]):
                if t0 <= lt <= t1:
                    u = (lt - t0) / (t1 - t0)
                    x = x0 + (x1 - x0) * u * u * (3 - 2 * u)
                    break
    return min(1320, max(600, x))

def ramp(t, t0, t1, fade=0.45):
    """0 → 1 → 0 window with soft edges."""
    if t < t0 or t > t1:
        return 0.0
    v = min(1.0, (t - t0) / fade, (t1 - t) / fade)
    return v * v * (3 - 2 * v)

ov = {}
def overlay(name):
    if name not in ov:
        ov[name] = Image.open(os.path.join(ov_dir, name + '.png')).convert('RGBA')
    return ov[name]

def paste(base, im, x, y, alpha):
    if alpha <= 0.003:
        return
    if alpha < 0.997:
        a = np.asarray(im).copy()
        a[..., 3] = (a[..., 3].astype(np.float32) * alpha).astype(np.uint8)
        im = Image.fromarray(a, 'RGBA')
    base.alpha_composite(im, (int(x), int(y)))

def caption_window(c):
    if 'cap' not in c:
        return None
    t0 = c['start'] + c.get('capFrom', (0.55 if c['idx'] else 0.3) + c['xf'] * 0.4)
    nxt = clips[c['idx'] + 1]['xf'] if c['idx'] + 1 < len(clips) else 0
    t1 = c['start'] + c.get('capUntil', c['dur'] - nxt - 0.35)
    return t0, t1

def master_fade(t):
    fi = 1.0 if edit['fadeIn'] <= 0 else t / edit['fadeIn']
    return min(1.0, fi, (TOTAL - t) / edit['fadeOut'])

def quote_alpha(t):
    """The opening quote stays up through the hook and fades as the second shot takes over."""
    if not clips[0].get('quote') or len(clips) < 2:
        return 0.0
    return min(1.0, max(0.0, (clips[1]['start'] + clips[1]['xf'] - t) / 0.45))

# ---- vertical layout pieces ----
VW, VH = 1080, 1920
WIN_W, WIN_H, WIN_X, WIN_Y = 1000, 750, 40, 590
CAP_Y = WIN_Y + WIN_H + 34
mask = Image.new('L', (WIN_W, WIN_H), 0)
ImageDraw.Draw(mask).rounded_rectangle((0, 0, WIN_W - 1, WIN_H - 1), radius=30, fill=255)
shadow = Image.new('RGBA', (VW, VH), (0, 0, 0, 0))
ImageDraw.Draw(shadow).rounded_rectangle((WIN_X, WIN_Y + 14, WIN_X + WIN_W, WIN_Y + WIN_H + 14), radius=34, fill=(18, 12, 36, 150))
shadow = shadow.filter(ImageFilter.GaussianBlur(26))
rim = Image.new('RGBA', (VW, VH), (0, 0, 0, 0))
ImageDraw.Draw(rim).rounded_rectangle((WIN_X - 2, WIN_Y - 2, WIN_X + WIN_W + 1, WIN_Y + WIN_H + 1), radius=32, outline=(255, 255, 255, 70), width=2)

def compose_landscape(t):
    img, a_, b_, k_ = frame_at(t)
    base = img.convert('RGBA')
    qa = quote_alpha(t)
    if qa > 0:
        im = overlay('quote')
        paste(base, im, (1920 - im.width) / 2, 1080 - im.height + 10, qa)
    for c in clips:
        w = caption_window(c)
        if w:
            a = ramp(t, *w)
            if a > 0:
                im = overlay('cap-' + c['id'])
                rise = (1 - min(1, (t - w[0]) / 0.45)) * 14
                paste(base, im, (1920 - im.width) / 2, 1080 - im.height - 6 + rise, a)
    last = clips[-1]
    if 'endCardFrom' in last and t >= last['start'] + last['endCardFrom']:
        a = min(1.0, (t - last['start'] - last['endCardFrom']) / 0.9)
        a = a * a * (3 - 2 * a)
        dim = Image.new('RGBA', base.size, (14, 10, 34, int(95 * a)))
        base.alpha_composite(dim)
        im = overlay('end')
        paste(base, im, (1920 - im.width) / 2, (1080 - im.height) / 2 - 30, a)
    return base.convert('RGB')

def compose_vertical(t):
    img, a_, b_, k_ = frame_at(t)
    cx = crop_x(a_, t) + (crop_x(b_, t) - crop_x(a_, t)) * k_
    # blurred backdrop from the same frame
    bg = img.crop((960 - 304, 0, 960 + 304, 1080)).resize((54, 96), Image.BILINEAR)
    bg = bg.filter(ImageFilter.GaussianBlur(2.2)).resize((VW, VH), Image.BICUBIC)
    bg = ImageEnhance.Brightness(bg).enhance(0.5).convert('RGBA')
    bg.alpha_composite(Image.new('RGBA', (VW, VH), (30, 20, 60, 50)))
    bg.alpha_composite(shadow)
    # 4:3 window, 1.2x closer than the full height, which also leaves the HUD row out
    win = img.crop((int(round(cx)) - 600, 90, int(round(cx)) + 600, 990)).resize((WIN_W, WIN_H), Image.BICUBIC)
    bg.paste(win, (WIN_X, WIN_Y), mask)
    bg.alpha_composite(rim)
    # header: the commenter's request during the hook, then the game's title
    qa = quote_alpha(t)
    head = overlay('vhead')
    paste(bg, head, (VW - head.width) / 2, WIN_Y - head.height + 20, 1 - qa)
    if qa > 0:
        q = overlay('vquote')
        paste(bg, q, (VW - q.width) / 2, WIN_Y - q.height + 20, qa)
        qs = overlay('vquote-sub')
        paste(bg, qs, (VW - qs.width) / 2, CAP_Y - 70, qa)
    for c in clips:
        w = caption_window(c)
        if w:
            a = ramp(t, *w)
            if a > 0:
                im = overlay('vcap-' + c['id'])
                rise = (1 - min(1, (t - w[0]) / 0.45)) * 16
                paste(bg, im, (VW - im.width) / 2, CAP_Y + rise - 70, a)
    last = clips[-1]
    if 'endCardFrom' in last and t >= last['start'] + last['endCardFrom']:
        a = min(1.0, (t - last['start'] - last['endCardFrom']) / 0.9)
        a = a * a * (3 - 2 * a)
        # dim the game window and set the end card inside it, clear of the apps' bottom overlays
        dim = Image.new('RGBA', (WIN_W, WIN_H), (14, 10, 34, 0))
        dim.putalpha(mask.point(lambda v: int(v * 110 / 255 * a)))
        bg.alpha_composite(dim, (WIN_X, WIN_Y))
        im = overlay('vend')
        paste(bg, im, (VW - im.width) / 2, WIN_Y + (WIN_H - im.height) // 2, a)
    return bg.convert('RGB')

W, H = (1920, 1080) if mode == 'landscape' else (VW, VH)
compose = compose_landscape if mode == 'landscape' else compose_vertical

if preview:
    # write N evenly spaced stills instead of a video
    os.makedirs(out, exist_ok=True)
    for i in range(preview):
        t = (i + 0.5) * TOTAL / preview
        compose(t).save(os.path.join(out, '%s-%05.1fs.jpg' % (mode, t)), quality=86)
    print('preview stills in', out, 'total %.2fs' % TOTAL)
    sys.exit(0)

cmd = ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
       '-i', wav, '-c:v', 'libx264', '-preset', 'slow', '-crf', '18',
       '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
       '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
       '-profile:v', 'high', '-level:v', '4.1',
       '-g', str(FPS * 2), '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest', '-movflags', '+faststart', out]
proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
black = np.zeros((H, W, 3), np.float32)
for g in range(NFRAMES):
    t = g / FPS
    fr = compose(t)
    m = master_fade(t)
    if m < 1:
        fr = Image.fromarray((np.asarray(fr).astype(np.float32) * max(0.0, m)).astype(np.uint8))
    proc.stdin.write(fr.tobytes())
    if g % 150 == 0:
        print(f'{mode}: frame {g}/{NFRAMES}', flush=True)
proc.stdin.close()
proc.wait()
print('wrote', out, 'duration %.2fs' % TOTAL)
