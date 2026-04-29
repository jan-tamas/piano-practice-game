# Scale Practice Game

A browser-based practice game for piano players who want to get faster and more accurate at recognizing the notes of musical scales and chords.

The app shows you a randomly chosen scale (e.g. *F# Harmonic Minor*) or chord (e.g. *Cmaj7*, *G7*, *Bbm7♭5*), starts a stopwatch, and asks you to tap the keys belonging to that scale/chord on an on-screen keyboard. Tap to mark, tap again to unmark, then **Submit** to score yourself. A bell plays if you got it right; a buzzer plays if you didn't, and the correct keys are revealed in green/amber/red so you can see exactly what you missed.

The picker is **adaptive** — scales/chords you get wrong or play slowly come up more often than ones you've already mastered.

## Features

- **Two practice modes** — toggle between **Scales** and **Chords** on the start screen
- **In-app guidance** — one-line instructions on the title screen and a small caption above each prompt ("Tap all keys in this scale/chord")
- **Three difficulty tiers per mode**
  - **Scales — Easy:** Major and Natural Minor (24 scales)
  - **Scales — Medium:** adds Harmonic/Melodic Minor and Pentatonics (72 scales)
  - **Scales — Hard:** adds Modes, Blues, Whole Tone, Diminished (168 scales)
  - **Chords — Easy:** Major / Minor triads + maj7, m7, 7 (60 chords)
  - **Chords — Medium:** adds dim, aug, sus2, sus4, m7♭5, dim7 (132 chords)
  - **Chords — Hard:** adds 9, maj9, m9, 11, 13 (192 chords)
- **2.5-octave on-screen keyboard** (C3–F5) — landscape layout
- **MIDI keyboard input** — connect a MIDI keyboard and play real keys. The app listens to all connected MIDI inputs. In **chord** mode, selection follows the keys you're physically holding (note-on adds, note-off removes), so a wrong key disqualifies the match. In **scale** mode, MIDI note-on toggles a key (since you can't hold 7 keys at once); note-off does nothing.
- **Auto-advance mode** — toggle on the title screen. With it on, the game submits and moves to the next prompt the moment you've selected exactly the right pitch classes (no extras), so you can practice in flow without tapping Submit between every chord. Works for both modes and both input types.
- **Adaptive selection** weighted by recent error rate, slowness, and unseen prompts (separate stats per mode)
- **Audio feedback** — synthesized bell/buzzer (no asset files), mute toggle in settings
- **Session tracking** with a 0–100 score combining accuracy and speed, plus a chart of recent sessions with separate trend lines for scales and chords (filterable)
- **History** of past attempts with mode column and filter, persisted in `localStorage`
- **Reset stats** button (with confirm) for starting fresh

## Scoring

Each round earns a **round score**:

```
correct → 50 + max(0, 50 − elapsedSeconds × 2)    (range 50–100)
wrong   → 0
```

Your **session score** is the average of all round scores in the session. 5s correct = 90, 10s correct = 80, 25s+ correct = 50, anything wrong = 0.

## Tech Stack

- Vite + TypeScript, no UI framework
- Web Audio API for synthesized feedback sounds
- `localStorage` for persistence
- SVG for the session-score chart

See [SPEC.md](SPEC.md) for the full design doc, including the adaptive-selection formula and planned features (per-note tap audio).

## Local Development

```bash
npm install
npm run dev      # vite dev server
npm run build    # type-check + production build into dist/
npm run preview  # preview the built bundle
```

Open the printed URL in landscape orientation. On a portrait phone the app shows a "rotate device" overlay.

## Deploying to GitHub Pages

A GitHub Actions workflow at [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) builds the app and publishes it to GitHub Pages on every push to `main`.

To enable it:

1. Push this repo to GitHub (already done).
2. In the repo on GitHub, go to **Settings → Pages**.
3. Under **Build and deployment → Source**, choose **GitHub Actions**.
4. Push to `main` (or run the workflow manually from the **Actions** tab). The first run takes ~1 minute.
5. Your app will be live at `https://<your-username>.github.io/<repo-name>/`.

The Vite config uses `base: './'` so the build works from any subpath — no extra config needed when the repo name changes.

## License

MIT
