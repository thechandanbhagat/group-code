"""Generate the demo voice and timed captions without exposing credentials."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import textwrap
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[2]


def configuration():
    values = {}
    for env_file in (ROOT / '.env.local', ROOT / '.env.demo.local'):
        if not env_file.exists():
            continue
        for line in env_file.read_text().splitlines():
            if not line.strip() or line.lstrip().startswith('#'):
                continue
            key, separator, value = line.partition('=')
            if separator and value.strip().strip('"\''):
                values[key.strip()] = value.strip().strip('"\'')
    for key in ('ELEVENLABS_API_KEY', 'ELEVENLABS_VOICE_ID', 'ELEVENLABS_MODEL_ID'):
        if os.environ.get(key):
            values[key] = os.environ[key]
    return values


def timestamp(seconds):
    milliseconds = round(float(seconds) * 1000)
    hours, milliseconds = divmod(milliseconds, 3600000)
    minutes, milliseconds = divmod(milliseconds, 60000)
    seconds, milliseconds = divmod(milliseconds, 1000)
    return f'{hours:02}:{minutes:02}:{seconds:02},{milliseconds:03}'


def subtitles(alignment):
    characters = alignment.get('characters', [])
    starts = alignment.get('character_start_times_seconds', [])
    ends = alignment.get('character_end_times_seconds', [])
    if not characters or len(characters) != len(starts) or len(starts) != len(ends):
        raise ValueError('The speech service did not return usable character timing.')
    text = ''.join(characters)
    cues, words = [], []
    for match in re.finditer(r'\S+', text):
        words.append(match)
        duration = ends[match.end() - 1] - starts[words[0].start()]
        if len(words) >= 10 or duration >= 4.5 or re.search(r'[.!?]$', match.group()):
            cues.append(words)
            words = []
    if words:
        cues.append(words)
    blocks = []
    for number, cue in enumerate(cues, 1):
        caption = textwrap.fill(' '.join(word.group() for word in cue), width=44)
        blocks.append(f'{number}\n{timestamp(starts[cue[0].start()])} --> '
                      f'{timestamp(ends[cue[-1].end() - 1])}\n{caption}')
    return '\n\n'.join(blocks) + '\n'


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None  # Do not forward the authentication header to another origin.


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--force', action='store_true')
    args = parser.parse_args()
    values = configuration()
    narration = (ROOT / 'docs/demo/narration.txt').read_text().strip()
    voice_id = values.get('ELEVENLABS_VOICE_ID', '')
    key = values.get('ELEVENLABS_API_KEY', '')
    model = values.get('ELEVENLABS_MODEL_ID') or 'eleven_multilingual_v2'
    print(f'Narration: {len(narration.split())} words, {len(narration)} characters.')
    if args.dry_run:
        print('API key configured: ' + ('yes' if key else 'no'))
        print('Voice ID configured: ' + ('yes' if voice_id else 'no'))
        print('Dry run only; no API request made.')
        return
    if not key or not voice_id:
        raise ValueError('Set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID in .env.local or .env.demo.local.')
    if not re.fullmatch(r'[A-Za-z0-9_-]+', voice_id):
        raise ValueError('The voice ID has an unexpected format.')
    payload = {'text': narration, 'model_id': model}
    fingerprint = hashlib.sha256(json.dumps([voice_id, payload], sort_keys=True).encode()).hexdigest()
    directory = ROOT / 'artifacts/demo'
    directory.mkdir(parents=True, exist_ok=True)
    marker = directory / 'voice-generation.json'
    outputs = [directory / name for name in ('narration.mp3', 'alignment.json', 'captions.srt')]
    if marker.exists() and not args.force:
        if json.loads(marker.read_text()).get('fingerprint') == fingerprint and all(p.exists() for p in outputs):
            print('Reusing completed narration. Pass --force to generate it again.')
            return
        raise ValueError('A previous generation exists. Use --force after reviewing the changed narration or voice.')
    endpoint = 'https://api.elevenlabs.io/v1/text-to-speech/' + urllib.parse.quote(voice_id, safe='')
    request = urllib.request.Request(endpoint + '/with-timestamps?output_format=mp3_44100_128',
        data=json.dumps(payload).encode(), method='POST',
        headers={'xi-api-key': key, 'Content-Type': 'application/json'})
    try:
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=120) as response:
            result = json.load(response)
    except urllib.error.HTTPError as error:
        try:
            detail = json.load(error).get('detail', {})
            status = detail.get('status', '') if isinstance(detail, dict) else ''
            status = status if re.fullmatch(r'[a-z_]+', status) else 'unavailable'
        except (ValueError, AttributeError):
            status = 'unavailable'
        raise ValueError(f'ElevenLabs returned HTTP {error.code} ({status}). Check key permissions, voice access and available credits. No automatic retry was made.') from None
    except (urllib.error.URLError, TimeoutError):
        raise ValueError('The request did not complete. Check ElevenLabs history before retrying; it may have consumed credits.') from None
    audio = base64.b64decode(result['audio_base64'], validate=True)
    if not audio:
        raise ValueError('The speech service returned empty audio.')
    outputs[0].write_bytes(audio)
    alignment = result.get('normalized_alignment') or result.get('alignment') or {}
    outputs[1].write_text(json.dumps(alignment, indent=2))
    outputs[2].write_text(subtitles(alignment))
    marker.write_text(json.dumps({'fingerprint': fingerprint, 'model': model, 'characters': len(narration)}, indent=2))
    print('Created narration.mp3, alignment.json and captions.srt in artifacts/demo.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, OSError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
