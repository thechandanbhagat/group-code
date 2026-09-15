"""Render the narrated Group Code walkthrough from actual VS Code captures.

Requires Pillow, NumPy, ffmpeg and ffprobe. No network or API calls are made.
"""
import argparse
import bisect
import json
import math
from pathlib import Path
import subprocess
import textwrap

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / 'artifacts/demo'
W, H, FPS = 1920, 1080, 30
LEAD = 1.5
ACCENT = (114, 218, 255)
WHITE = (240, 245, 252)
MUTED = (161, 179, 200)
FONT_DIR = Path('/System/Library/Fonts/Supplemental')


def font(size, bold=False):
    candidates = [FONT_DIR / ('Arial Bold.ttf' if bold else 'Arial.ttf'),
                  Path('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' if bold else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')]
    return ImageFont.truetype(str(next(p for p in candidates if p.exists())), size)


def background():
    y, x = np.mgrid[0:H, 0:W]
    glow = np.exp(-(((x - W * .72) / 1100) ** 2 + ((y - H * .25) / 800) ** 2))
    pixels = np.zeros((H, W, 3), dtype=np.uint8)
    for channel, (base, scale) in enumerate([(9, 8), (16, 16), (27, 26)]):
        pixels[:, :, channel] = base + glow * scale
    return Image.fromarray(pixels)


def lines(draw, text, xy, size, color=WHITE, bold=False, spacing=12):
    draw.multiline_text(xy, text, font=font(size, bold), fill=color, spacing=spacing)


def rounded_label(draw, text, xy, color=ACCENT):
    x, y = xy
    length = draw.textlength(text, font=font(20, True))
    draw.rounded_rectangle((x, y, x + length + 28, y + 38), radius=9, fill=(22, 47, 63))
    draw.text((x + 14, y + 8), text, font=font(20, True), fill=color)


def capture(name):
    path = next((OUTPUT / 'frames').glob(name + '.*'))
    image = Image.open(path).convert('RGB')
    # Keep the real editor and extension; remove only the macOS window title/status bands.
    return image.crop((0, 29, image.width, image.height - 20))


SCENES = [
    # Starts are relative to speech; the title starts before narration.
    (-LEAD, None, 'YOUR CODE.\nYOUR FEATURES.', 'A clearer way to find your way around.', 'intro'),
    (4.17, '06-annotated', 'Group Code', 'Organize your codebase\nby what it does.', 'brand'),
    (10.98, '02-select-code', 'Start with\nyour code.', 'Select a function or place\nyour cursor on a line.', '01 / ADD'),
    (13.11, '03-add-dialog', 'Add a\ngroup.', 'Choose an existing group\nor create a new one.', '01 / ADD'),
    (16.20, '05-description', 'Give it\na purpose.', 'A name and a short\ndescription make code\neasier to find.', '01 / ADD'),
    (19.31, '04-name-hierarchy', 'Make it\na hierarchy.', 'Checkout > Payments\n\nA parent feature, with\nfocused child groups.', '02 / ORGANIZE'),
    (23.2, '06-annotated', 'One comment.\nA useful map.', 'Your annotations become\na navigable feature tree.', '02 / ORGANIZE'),
    (27.61, '07-sql-navigation', 'Across\nyour files.', 'TypeScript. SQL. HTML.\n\nRelated code stays\nunder the same feature.', '03 / EXPLORE'),
    (31.0, '08-html-navigation', 'One feature.\nMany places.', 'Follow Payments from\nthe data layer to the UI.', '03 / EXPLORE'),
    (34.96, '09-by-file', 'Prefer the\nfile view?', 'Explore each file and\nthe groups inside it.', '03 / EXPLORE'),
    (38.71, '10-jump-to-code', 'Jump straight\nto the code.', 'Select a location in\neither tree to navigate.', '04 / FIND'),
    (41.52, '11-search-input', 'Find your\nfocus.', 'Search by group name,\nfile type or description.', '04 / FIND'),
    (42.9, '12-search-results', 'Keep the\nrelevant code.', 'A focused feature view,\nready to explore.', '04 / FIND'),
    (44.1, '13-favorite', 'Keep favorites\nclose.', 'Star the groups\nyou return to most.', '04 / FIND'),
    (46.20, '14-rename-input', 'Reorganize\nwith a rename.', 'Rename the parent.\nIts descendants follow.', '05 / REFACTOR'),
    (49.5, '15-renamed-hierarchy', 'Checkout\nbecomes\nCommerce.', 'Four annotations updated\nacross three files.', '05 / REFACTOR'),
    (52.41, '15-renamed-hierarchy', 'Review.\nUndo.\nThen save.', 'Source edits stay in\nyour normal editor flow.', '05 / REFACTOR'),
    (56.13, '16-ai-command', 'Start with\na suggestion.', 'Copilot integration can\nsuggest group annotations.', '06 / AI ASSISTANCE'),
    (61.99, '16-ai-command', 'You choose\nwhat to keep.', 'Review proposed changes\nbefore you apply and save.', '06 / AI ASSISTANCE'),
    (66.57, '17-live-update', 'An index that\nfollows you.', 'New annotations appear\nas eligible files change.\nWorkspace ignore rules\nkeep the scope focused.', '07 / STAY CURRENT'),
    (74.22, None, 'Group Code', 'A map of your features.\nInside Visual Studio Code.', 'outro'),
]


def make_scene(base, scene):
    _, shot, title, body, step = scene
    canvas = base.copy()
    draw = ImageDraw.Draw(canvas)
    draw.text((56, 42), 'GROUP CODE', font=font(22, True), fill=ACCENT)
    draw.text((1590, 45), 'VISUAL STUDIO CODE', font=font(18), fill=MUTED)
    draw.line((56, 90, 1864, 90), fill=(48, 69, 88), width=1)
    if step in ('intro', 'outro'):
        draw.rounded_rectangle((1240, 230, 1750, 740), radius=58, fill=(20, 42, 61), outline=(53, 93, 118), width=2)
        # A code-native hierarchy illustration for the title/end cards.
        points = [(1320, 335), (1430, 445), (1430, 585)]
        draw.line((1320, 335, 1320, 585, 1430, 585), fill=ACCENT, width=5)
        draw.line((1320, 445, 1430, 445), fill=ACCENT, width=5)
        for (x, y), label in zip(points, ['FEATURE', 'PAYMENTS', 'ORDERS']):
            draw.rounded_rectangle((x - 10, y - 22, x + 230, y + 40), radius=12, fill=(33, 64, 84))
            draw.text((x + 10, y - 3), label, font=font(24, True), fill=WHITE)
        if step == 'intro':
            rounded_label(draw, 'CODE ORGANIZATION, MADE VISIBLE', (60, 220))
            lines(draw, title, (58, 325), 91, bold=True, spacing=22)
            lines(draw, body, (64, 620), 32, color=MUTED)
        else:
            rounded_label(draw, 'FOR VISUAL STUDIO CODE', (60, 220))
            lines(draw, title, (58, 315), 112, bold=True)
            lines(draw, body, (64, 485), 40, color=MUTED, spacing=18)
            rounded_label(draw, 'FIND IT IN THE VS CODE MARKETPLACE', (64, 675))
            draw.text((64, 744), 'by thechandanbhagat', font=font(25), fill=MUTED)
        return canvas
    rounded_label(draw, 'MEET GROUP CODE' if step == 'brand' else step, (56, 137))
    lines(draw, title, (55, 228), 48 if step != 'brand' else 58, bold=True, spacing=14)
    title_lines = title.count('\n') + 1
    lines(draw, body, (57, 252 + title_lines * 64), 26, color=MUTED, spacing=12)
    shot_image = capture(shot)
    shot_image = shot_image.resize((1414, 827), Image.Resampling.LANCZOS)
    draw.rounded_rectangle((434, 117, 1868, 964), radius=14, fill=(8, 13, 21), outline=(67, 92, 113), width=2)
    canvas.paste(shot_image, (444, 127))
    draw.text((57, 891), 'REAL EXTENSION WORKFLOW', font=font(17, True), fill=ACCENT)
    return canvas


def cues_from_alignment():
    alignment = json.loads((OUTPUT / 'alignment.json').read_text())
    text = ''.join(alignment['characters'])
    starts = alignment['character_start_times_seconds']
    ends = alignment['character_end_times_seconds']
    import re
    cues, words = [], []
    for match in re.finditer(r'\S+', text):
        words.append(match)
        duration = ends[match.end() - 1] - starts[words[0].start()]
        if len(words) >= 10 or duration >= 4.5 or re.search(r'[.!?]$', match.group()):
            cues.append((starts[words[0].start()] + LEAD, ends[words[-1].end() - 1] + LEAD,
                         ' '.join(w.group() for w in words)))
            words = []
    if words:
        cues.append((starts[words[0].start()] + LEAD, ends[words[-1].end() - 1] + LEAD,
                     ' '.join(w.group() for w in words)))
    return cues


def subtitle(draw, cue):
    wrapped = textwrap.wrap(cue, width=87)
    y = 989 if len(wrapped) == 1 else 974
    for line in wrapped:
        text_width = draw.textlength(line, font=font(30))
        x = (W - text_width) / 2
        draw.rounded_rectangle((x - 19, y - 6, x + text_width + 19, y + 41), radius=9, fill=(7, 12, 21))
        draw.text((x, y), line, font=font(30), fill=WHITE)
        y += 43


def compose(t, bases, starts, cues, duration):
    index = max(0, bisect.bisect_right(starts, t) - 1)
    image = bases[index].copy()
    elapsed = t - starts[index]
    if index and elapsed < .3:
        image = Image.blend(bases[index - 1], image, max(0, elapsed / .3))
    draw = ImageDraw.Draw(image)
    # A quiet progress rail gives still captures an explicit temporal structure.
    draw.rectangle((0, H - 4, int(W * t / duration), H), fill=ACCENT)
    # Pulse a guidance line alongside the active step, without simulating a mouse click.
    if SCENES[index][4] not in ('intro', 'outro'):
        strength = 150 + int(50 * (1 + math.sin(elapsed * 2)) / 2)
        draw.rounded_rectangle((30, 226, 35, 390), radius=2, fill=(72, strength, 232))
    for start, end, text in cues:
        if start <= t <= end + .07:
            subtitle(draw, text)
            break
    if t < .5:
        image = Image.blend(Image.new('RGB', (W, H), (9, 16, 27)), image, t / .5)
    if t > duration - .7:
        image = Image.blend(image, Image.new('RGB', (W, H), (9, 16, 27)), (t - duration + .7) / .7)
    return image


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--preview', action='store_true')
    args = parser.parse_args()
    audio = OUTPUT / 'narration.mp3'
    duration = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', str(audio)])) + LEAD + 2.5
    base = background()
    bases = [make_scene(base, scene) for scene in SCENES]
    starts = [max(0, scene[0] + LEAD) for scene in SCENES]
    cues = cues_from_alignment()
    def stamp(time):
        value = round(time * 1000)
        hours, value = divmod(value, 3600000)
        minutes, value = divmod(value, 60000)
        seconds, milliseconds = divmod(value, 1000)
        return f'{hours:02}:{minutes:02}:{seconds:02},{milliseconds:03}'
    (OUTPUT / 'group-code-demo.srt').write_text('\n\n'.join(
        f'{i+1}\n{stamp(start)} --> {stamp(end)}\n{textwrap.fill(text, width=70)}'
        for i, (start, end, text) in enumerate(cues)) + '\n')
    qa = OUTPUT / 'qa'
    qa.mkdir(exist_ok=True)
    preview_times = [3, 9, 16, 23, 30, 37, 44.7, 51, 59, 65, 71, 80]
    thumbs = Image.new('RGB', (1920, 810), (9, 16, 27))
    for i, time in enumerate(preview_times):
        frame = compose(time, bases, starts, cues, duration)
        frame.save(qa / f'preview-{time:05.1f}.jpg', quality=94)
        thumbs.paste(frame.resize((480, 270), Image.Resampling.LANCZOS), ((i % 4) * 480, (i // 4) * 270))
    thumbs.save(qa / 'storyboard.jpg', quality=94)
    (OUTPUT / 'timeline.json').write_text(json.dumps({'duration':duration, 'narrationOffset':LEAD, 'scenes':[
        {'start':starts[i], 'end':starts[i+1] if i+1<len(starts) else duration,
         'capture':scene[1], 'title':scene[2], 'section':scene[4]} for i,scene in enumerate(SCENES)]}, indent=2))
    if args.preview:
        print('Preview frames and storyboard created. No video rendered.', flush=True)
        return
    output = OUTPUT / 'group-code-demo.mp4'
    command = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24',
               '-s', f'{W}x{H}', '-r', str(FPS), '-i', 'pipe:0', '-i', str(audio),
               '-filter_complex', f'[1:a]adelay={int(LEAD*1000)}:all=1,apad=pad_dur=2.5,loudnorm=I=-16:TP=-1.5:LRA=11[a]',
               '-map', '0:v', '-map', '[a]', '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p',
               '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-t', str(duration), '-movflags', '+faststart',
               '-metadata', 'title=Group Code — feature walkthrough', str(output)]
    process = subprocess.Popen(command, stdin=subprocess.PIPE)
    try:
        for frame_number in range(math.ceil(duration * FPS)):
            process.stdin.write(compose(frame_number / FPS, bases, starts, cues, duration).tobytes())
            if frame_number % (FPS * 15) == 0:
                print(f'Rendered {frame_number // FPS}s / {duration:.1f}s', flush=True)
        process.stdin.close()
        if process.wait() != 0:
            raise RuntimeError('ffmpeg did not complete the video render')
    except BaseException:
        process.kill()
        raise
    print(f'Created {output} ({duration:.2f}s, 1920x1080, 30 fps).', flush=True)


if __name__ == '__main__':
    main()
