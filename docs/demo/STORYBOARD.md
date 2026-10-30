# Group Code demo

[Watch the published demo on YouTube](https://youtu.be/DfgPVLwPMK4), published on 30 October 2026 on Mr. Chandan Bhagat. Upload metadata is recorded in [youtube.json](youtube.json).

The refreshed walkthrough is approximately **85 seconds**, **1920 × 1080**, **30 fps**, with the existing ElevenLabs narration, burned-in English captions, separate SRT/VTT captions, and original instrumental background music. The music stays quiet, ducks under speech, and fades at the beginning and end. Timing follows the 80.85-second narration, plus a short lead and ending.

Working deliverables and verification evidence are in `artifacts/demo-final`. The user guide contains the MP4, WebM, captions, poster and refreshed screenshots. The video is an edited walkthrough assembled from real desktop VS Code captures, transitions, explanatory text and narration. The AI segment shows the actual suggestion command; it does not depict a live Copilot response.

All captures use the final functionality hierarchy: parent layers icons, code-group symbols, direct source entries, consistent picker/hover/status icons, and natural labels such as "1 group" and "4 groups".

| Approximate time | Actual screen action | On-screen emphasis |
| --- | --- | --- |
| 0–12 s | Open the isolated checkout example and reveal Group Code. | Organize code by functionality |
| 12–27 s | Select the order-summary function and add `Checkout > Payments` through the real dialog. | One comment creates a group |
| 27–40 s | Show the TypeScript, SQL and HTML source entries directly beneath Payments. | One feature, multiple files |
| 40–48 s | Jump to a source entry, search for payments, then favorite Checkout. | Jump, search, favorite |
| 48–58 s | Rename Checkout to Commerce and show the changed annotations across three files. | Rename a whole hierarchy |
| 58–68 s | Show the Copilot suggestion command and explain review before saving. | AI-assisted annotations · Review before saving |
| 68–75 s | Add a receipt annotation and show its group appear in the tree. | An index that follows your edits |
| 75–85 s | Closing card with extension name and publisher. | Group Code · by thechandanbhagat |

Narration: [narration.txt](narration.txt). The visuals must use the real extension; do not present simulated model output as a live result. Record only the isolated sample project, with credentials and unrelated windows outside the frame.

## Voice preparation

Put `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` in the repository-root `.env.local` file (the user's selected location). The optional `.env.demo.local` file can override nonempty values. Both are excluded from Git and VSIX packaging. The key is used only in an HTTPS request header to ElevenLabs and is never printed by the script.

```sh
python3 scripts/demo/generate_voice.py --dry-run
python3 scripts/demo/generate_voice.py --output-dir artifacts/demo-final
```

The generator writes narration, character timing data and SRT captions into the selected working directory. A matching completed generation is reused; regeneration requires `--force`. The current narration matched the final script and was reused. Requests are not automatically retried.

The integration follows ElevenLabs' [Create speech with timing API](https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps). Credentials are excluded from the generated media, scripts, Git changes and VSIX package.

## Rendering and verification

The capture script requires Playwright, a desktop VS Code executable and the built extension. It uses an isolated temporary profile, writes only sample source files, and captures the complete native window. Install Playwright with `npm install --prefix artifacts/demo/tools playwright` if needed. Use `--vscode PATH` or `VSCODE_EXECUTABLE_PATH` to select VS Code; the default uses the cached macOS test host.

```sh
npm run build
node scripts/demo/capture_demo.mjs --output-dir artifacts/demo-final
python3 scripts/demo/render_demo.py --output-dir artifacts/demo-final --preview
python3 scripts/demo/render_demo.py --output-dir artifacts/demo-final --webm
python3 scripts/demo/publish_demo.py --output-dir artifacts/demo-final
```

The Python scripts require Pillow and NumPy; rendering and verification require FFmpeg and FFprobe. The renderer derives scene times from narration alignment, creates the original instrumental track locally through `make_music.py`, and ducks it using the narration as a sidechain. Source images are in `frames`, timing in `timeline.json`, and inspection evidence in `qa` under the selected working directory.

The MP4 uses H.264/AAC and fast-start metadata; WebM uses VP9/Opus. Before updating the user guide, the publisher verifies that captures match the current extension bundle, checks both files' codecs, resolution, frame rate and duration, fully decodes both exports, validates caption timing, measures audio loudness/peak level, and extracts a contact sheet from the actual MP4. Video captions account for the narration lead; `captions.srt` accompanies the standalone voiceover, while `group-code-demo.srt` and `.vtt` accompany the video.
