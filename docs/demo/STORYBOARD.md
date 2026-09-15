# Group Code demo

Completed: approximately **86 seconds**, **1920 × 1080**, **30 fps**, with the user's ElevenLabs voice, English narration, burned-in captions and a separate SRT. The final timing follows the 81.92-second narration, plus a short lead and ending.

Deliverables are in `artifacts/demo`: `group-code-demo.mp4`, `group-code-demo.srt`, and `narration.mp3`. The video is an edited walkthrough assembled from real VS Code captures, transitions, explanatory text and narration. It is not an uninterrupted screen recording. The AI segment shows the actual command entry point; no live Copilot response is depicted.

| Approximate time | Actual screen action | On-screen emphasis |
| --- | --- | --- |
| 0–10 s | Open the sample checkout project in VS Code, then reveal Group Code. | Organize code by functionality |
| 10–26 s | Select the payment function. Use Add to Group → manual flow, naming it `Checkout > Payments`. | One comment creates a group |
| 26–40 s | Expand Checkout in the hierarchy. Show its TypeScript, SQL and HTML locations; switch to By File. | One feature, multiple files |
| 40–52 s | Click an indexed location. Use Search Groups to narrow to payments; favorite a group. | Jump, search, favorite |
| 52–66 s | Rename Checkout to Commerce. Show a child annotation updated in the editor and Undo available. | Rename a whole hierarchy |
| 66–79 s | Show the Copilot generation command and explain review before saving. Record real generation only if a model is available. | AI-assisted annotations · Review before saving |
| 79–84 s | Edit a sample annotation and show the tree refresh. | An index that follows your edits |
| 84–90 s | Closing card with extension name and publisher. | Group Code · by thechandanbhagat |

Narration: [narration.txt](narration.txt). The visuals must use the real extension; do not present simulated model output as a live result. Record only the isolated sample project, with credentials and unrelated windows outside the frame.

## Voice preparation

Put `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` in the repository-root `.env.local` file (the user's selected location). The optional `.env.demo.local` file can override nonempty values. Both are excluded from Git and VSIX packaging. The key is used only in an HTTPS request header to ElevenLabs and is never printed by the script.

```sh
python3 scripts/demo/generate_voice.py --dry-run
python3 scripts/demo/generate_voice.py
```

The generator writes `artifacts/demo/narration.mp3`, character timing data and SRT captions. A matching completed generation is reused; regeneration requires `--force`. Requests are not automatically retried, to avoid duplicate credit use on uncertain responses.

The integration follows ElevenLabs' [Create speech with timing API](https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps). The user's corrected voice ID generated the narration successfully. The key is not included in the generated media, scripts, Git changes or VSIX package.

## Rendering and verification

Run `python3 scripts/demo/render_demo.py --preview` to inspect the visual storyboard, then omit `--preview` to render. The script requires Pillow, NumPy, FFmpeg and FFprobe. Source captures are in `artifacts/demo/frames`, the scene timing in `artifacts/demo/timeline.json`, and visual checks in `artifacts/demo/qa`.

The exported video uses H.264 with AAC audio and MP4 fast-start metadata. Verification includes a complete decode, stream/duration inspection, and a contact sheet extracted from the actual exported MP4. Video captions are shifted to account for the narration lead; `captions.srt` accompanies the standalone voiceover, while `group-code-demo.srt` accompanies the video.
