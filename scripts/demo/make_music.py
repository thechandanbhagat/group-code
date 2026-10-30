"""Create an original, quiet instrumental bed for the demo (no external assets)."""
import argparse
import wave
from pathlib import Path

import numpy as np


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--duration', type=float, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    rate = 48000
    mix = np.zeros((int((args.duration + 3) * rate), 2), dtype=np.float64)
    beat = 60 / 84
    chords = [(50, 62, 66, 69, 73), (45, 61, 64, 69, 71),
              (47, 59, 62, 66, 69), (43, 59, 62, 66, 69)]

    def note(start, midi, length, gain, pan=0, pad=False):
        offset = round(start * rate)
        count = min(round(length * rate), len(mix) - offset)
        if count <= 0:
            return
        time = np.arange(count) / rate
        frequency = 440 * 2 ** ((midi - 69) / 12)
        if pad:
            envelope = np.minimum(time / .8, 1) * np.minimum((length - time) / 1.8, 1)
            tone = np.sin(2 * np.pi * frequency * time) + .16 * np.sin(2 * np.pi * frequency * 1.002 * time)
        else:
            envelope = (1 - np.exp(-time * 100)) * np.exp(-time * 2.8)
            tone = (np.sin(2 * np.pi * frequency * time)
                    + .18 * np.sin(2 * np.pi * frequency * 2 * time) * np.exp(-time * 4))
        signal = gain * tone * envelope
        mix[offset:offset + count, 0] += signal * np.sqrt((1 - pan) / 2)
        mix[offset:offset + count, 1] += signal * np.sqrt((1 + pan) / 2)

    for bar, start in enumerate(np.arange(0, args.duration, beat * 8)):
        chord = chords[bar % len(chords)]
        for index, midi in enumerate(chord):
            note(start, midi, beat * 8 + 1.5, .035 if index else .045,
                 (index - 2) * .24, pad=True)
        for index in range(8):
            midi = chord[1 + (index % 4)] + 12
            note(start + index * beat, midi, 2.2, .019, (-1 if index % 2 else 1) * .35)
            note(start + index * beat + .36, midi, 2.2, .006, (-1 if index % 2 else 1) * -.35)
    mix = mix[:round(args.duration * rate)]
    time = np.arange(len(mix)) / rate
    fade = np.minimum(time / 1.5, 1) * np.minimum((args.duration - time) / 2.5, 1)
    mix *= fade[:, None]
    mix *= .35 / max(np.max(np.abs(mix)), 1e-9)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(args.output), 'wb') as audio:
        audio.setnchannels(2)
        audio.setsampwidth(2)
        audio.setframerate(rate)
        audio.writeframes((mix * 32767).astype('<i2').tobytes())
    print(f'Created original instrumental bed: {args.output} ({args.duration:.2f}s).')


if __name__ == '__main__':
    main()
