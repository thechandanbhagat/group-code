"""Verify the rendered walkthrough and copy its media into the local user guide."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
IMAGES = {
    'group-explorer': '06-annotated',
    'annotations': '06-annotated',
    'source-navigation': '07-sql-navigation',
    'favorites': '13-favorite',
    'rename-group': '14-rename-input',
    'add-group': '03-add-dialog',
    'autocomplete': '21-autocomplete',
    'hover-card': '20-hover-card',
    'search-groups': '12-search-results',
    'copilot-workflow': '16-ai-command',
    'commands': '18-commands',
    'settings': '19-settings',
    'live-update': '17-live-update',
    'group-picker': '22-group-picker',
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', type=Path, default=ROOT / 'artifacts/demo-final')
    args = parser.parse_args()
    output = args.output_dir.resolve()
    capture = json.loads((output / 'capture-manifest.json').read_text())
    digest = hashlib.sha256((ROOT / 'dist/extension.js').read_bytes()).hexdigest()
    assert capture['bundleSha256'] == digest, 'Captures must use the current extension bundle.'
    assert len(capture['captures']) == 21, 'All workflow captures must be present.'
    qa = output / 'qa'
    qa.mkdir(exist_ok=True)
    streams = {}
    for extension in ('mp4', 'webm'):
        video = output / f'group-code-demo.{extension}'
        info = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_streams',
                                                  '-show_format', '-of', 'json', str(video)]))
        visual = next(stream for stream in info['streams'] if stream['codec_type'] == 'video')
        audio = next(stream for stream in info['streams'] if stream['codec_type'] == 'audio')
        assert (visual['width'], visual['height']) == (1920, 1080)
        assert visual['avg_frame_rate'] == '30/1'
        assert visual['codec_name'] == ('h264' if extension == 'mp4' else 'vp9')
        assert audio['codec_name'] == ('aac' if extension == 'mp4' else 'opus')
        subprocess.run(['ffmpeg', '-v', 'error', '-i', str(video), '-f', 'null', '-'], check=True)
        streams[extension] = info
    duration = float(streams['mp4']['format']['duration'])
    assert abs(duration - float(streams['webm']['format']['duration'])) < .2
    srt = (output / 'group-code-demo.srt').read_text()
    assert not re.search(r'by[- ]file|file view|source files by type', srt, re.IGNORECASE)
    timestamps = re.findall(r'(\d{2}):(\d{2}):(\d{2}),(\d{3})', srt)
    assert timestamps
    assert max(int(h)*3600 + int(m)*60 + int(s) + int(ms)/1000
               for h, m, s, ms in timestamps) <= duration
    assert (output / 'group-code-demo.vtt').read_text().startswith('WEBVTT\n')

    measured = subprocess.run(['ffmpeg', '-hide_banner', '-i', str(output / 'group-code-demo.mp4'),
                              '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json',
                              '-f', 'null', '-'], check=True, capture_output=True, text=True).stderr
    loudness, _ = json.JSONDecoder().raw_decode(measured[measured.rfind('{'):])
    assert -20 <= float(loudness['input_i']) <= -12, 'Narration loudness must remain comfortable.'
    assert float(loudness['input_tp']) < 0, 'The mixed audio must not clip.'

    staged = output / 'publish'
    image_dir = staged / 'images'
    image_dir.mkdir(parents=True, exist_ok=True)
    for name, source in IMAGES.items():
        image = Image.open(output / 'frames' / f'{source}.png').convert('RGB')
        assert image.width >= 1600 and image.height >= 1000, 'Use complete native window captures.'
        image.save(image_dir / f'{name}.jpg', quality=94, subsampling=0, optimize=True)
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-ss', '9',
                    '-i', str(output / 'group-code-demo.mp4'), '-frames:v', '1', '-q:v', '2',
                    str(image_dir / 'demo-poster.jpg')], check=True)
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-ss', '3',
                    '-i', str(output / 'group-code-demo.mp4'),
                    '-vf', 'fps=1/7,scale=480:270,tile=4x3', '-frames:v', '1',
                    str(qa / 'exported-contact-sheet.jpg')], check=True)
    result = {'durationSeconds': duration, 'streams': streams, 'loudness': loudness,
              'nativeCaptures': len(capture['captures']), 'bundleSha256': digest}
    (qa / 'media-verification.json').write_text(json.dumps(result, indent=2))
    guide = ROOT / 'userguide'
    (guide / 'images').mkdir(exist_ok=True)
    (guide / 'videos').mkdir(exist_ok=True)
    for image in image_dir.glob('*.jpg'):
        shutil.copy2(image, guide / 'images' / image.name)
    for extension in ('mp4', 'webm', 'srt', 'vtt'):
        name = f'group-code-demo.{extension}'
        shutil.copy2(output / name, guide / 'videos' / name)
    print(f'Updated {len(IMAGES)} screenshots, poster, MP4, WebM, SRT and VTT in userguide.')
    print(f'Verified {duration:.2f}s at 1920x1080 / 30 fps; audio '
          f'{loudness["input_i"]} LUFS, {loudness["input_tp"]} dBTP.')


if __name__ == '__main__':
    main()
