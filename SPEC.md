# Piano Scale Practice Game — Specification

## 1. Purpose

A practice game that helps piano players recognize the notes of musical scales faster and more accurately. The user is shown a scale name, taps the keys they believe belong to that scale on an on-screen keyboard, and submits. The app times them, scores them, and adapts future scale selection toward the scales they struggle with.

## 2. Platform & Tech Stack

- **Web app** (single-page, runs in any modern browser). Web is the simplest way to deliver a horizontal piano UI with audio feedback that runs on tablets, phones, and desktops without an install.
- **Stack:** Vite + vanilla TypeScript + CSS. No framework needed for a single-screen game; keeps the bundle small and the code direct.
- **Audio:** Web Audio API for bell/buzzer feedback (synthesized — no asset files needed). Optional: short note tone on key tap for satisfaction.
- **Persistence:** `localStorage` for scores and per-scale stats. No backend.
- **Orientation:** Designed for landscape. On portrait phones, show a "rotate device" overlay.

## 3. Screens & Flow

```
┌─────────────┐        ┌──────────────┐        ┌─────────────┐
│ Difficulty  │  ───▶  │  Round       │  ───▶  │  Feedback   │
│ Select      │        │  (scale +    │        │  (bell or   │
│             │        │   keyboard)  │        │   buzzer +  │
│             │        │              │        │   correct   │
│             │        │              │        │   answer)   │
└─────────────┘        └──────────────┘        └─────────────┘
                              ▲                        │
                              └────────  Next  ◀───────┘
```

### 3.1 Difficulty Select (entry screen)

- Three buttons: **Easy**, **Medium**, **Hard**.
- Small "History" link → opens a panel showing the log of past attempts (scale, time, result, date).
- Difficulty choice is remembered across sessions.

### 3.2 Round Screen

Layout (landscape):

```
┌────────────────────────────────────────────────────────────────┐
│  D Major                                          ⏱ 00:07.42   │
│                                                                │
│                                                                │
│                                                                │
│   ┌──────────────────────────────────────────┐    ┌────────┐   │
│   │      Piano (≈ 2.5 octaves, C3–F5)        │    │ Submit │   │
│   │                                          │    └────────┘   │
│   └──────────────────────────────────────────┘                 │
└────────────────────────────────────────────────────────────────┘
```

- **Top-left:** scale name in large type (e.g. "F# Harmonic Minor").
- **Top-right:** running stopwatch, mm:ss.cs. Starts the moment the scale appears.
- **Bottom:** piano keyboard, ~2.5 octaves (C3 to F5 → 30 keys: 18 white + 12 black). Spans most of the screen width.
- **Right of keyboard:** Submit button, large enough to tap with the thumb.
- **Tapping a key** toggles its "selected" state (visually highlighted). Tapping again unmarks.
- **No octave matters** for scoring — the user only needs to mark the correct *pitch classes*, but they may mark them in any octave shown. Marking the same pitch class in two octaves still counts as correct (both are the right note).

### 3.3 Feedback Screen

Shown immediately after Submit:
- Plays **bell** if all and only the scale's pitch classes were marked; otherwise **buzzer**.
- Stopwatch frozen at submit time.
- Keyboard shows the **correct** scale highlighted (in green); incorrectly marked keys shown in red; missed keys shown in amber.
- Time and result saved to history.
- "Next" button → new round (random scale chosen by the adaptive algorithm in §6).

## 4. Scale Catalog

Each scale is defined by its **interval pattern** (semitones from root). Pitch-class set for a given root is computed from the pattern.

| Scale | Pattern (semitones from root) | Difficulty tier |
|---|---|---|
| Major (Ionian) | 0,2,4,5,7,9,11 | Easy |
| Natural Minor (Aeolian) | 0,2,3,5,7,8,10 | Easy |
| Harmonic Minor | 0,2,3,5,7,8,11 | Medium |
| Melodic Minor (ascending) | 0,2,3,5,7,9,11 | Medium |
| Major Pentatonic | 0,2,4,7,9 | Medium |
| Minor Pentatonic | 0,3,5,7,10 | Medium |
| Blues | 0,3,5,6,7,10 | Hard |
| Dorian | 0,2,3,5,7,9,10 | Hard |
| Phrygian | 0,1,3,5,7,8,10 | Hard |
| Lydian | 0,2,4,6,7,9,11 | Hard |
| Mixolydian | 0,2,4,5,7,9,10 | Hard |
| Locrian | 0,1,3,5,6,8,10 | Hard |
| Whole Tone | 0,2,4,6,8,10 | Hard |
| Diminished (W-H) | 0,2,3,5,6,8,9,11 | Hard |

**Roots:** all 12 chromatic roots (C, C#, D, … B). Enharmonic spelling preferred to match the scale's conventional notation (e.g. F# Major, not Gb Major; Bb Minor, not A# Minor) — a small lookup table chooses the canonical name.

**Difficulty tiers** are inclusive going up:
- **Easy:** Major + Natural Minor → 24 scales.
- **Medium:** Easy + Harmonic Minor, Melodic Minor, Major/Minor Pentatonic → 72 scales.
- **Hard:** all of the above + Blues, the four non-Ionian/Aeolian modes, Whole Tone, Diminished → 168 scales.

## 5. Scoring

A submission is **correct** iff the set of marked pitch classes equals the scale's pitch-class set. Octave duplicates are ignored. No partial credit on the round result (bell vs. buzzer is binary), but per-note correctness *is* recorded for adaptive selection (§6).

For each round we log:
- `scaleId` (e.g. `"D_major"`)
- `timestamp`
- `elapsedMs`
- `correct: boolean`
- `missedNotes: string[]` (pitch classes in the scale the user did not mark)
- `extraNotes: string[]` (pitch classes the user marked that are not in the scale)

## 6. Adaptive Scale Selection

Goal: practice scales the user is slow on or gets wrong, more often than scales they've mastered, while still keeping variety.

For each `scaleId` in the active difficulty tier, maintain rolling stats over the last *N = 10* attempts:
- `attempts` — total count
- `recentResults` — array of last 10 `{correct, elapsedMs, missedNotes, extraNotes}`
- `errorRate` — fraction of recent attempts that were incorrect
- `avgTimeMs` — mean elapsed time on recent *correct* attempts (fall back to overall recent if none correct)

**Weight per scale:**

```
weight = 1
       + 4 * errorRate                  // wrong answers heavily boost
       + 2 * normalizedTime             // slow answers moderately boost
       + 3 * (attempts == 0 ? 1 : 0)    // unseen scales get a one-time boost
```

where `normalizedTime` is `clamp((avgTimeMs − tierMedianMs) / tierMedianMs, 0, 2)` — only *slower-than-median* scales gain weight; faster ones contribute 0.

**Anti-repeat:** the most recently played scale's weight is multiplied by 0.2 to discourage immediate repeats.

**Selection:** weighted random draw over all scales in the tier. Always-positive weights guarantee every scale is reachable.

(Algorithm is intentionally simple and tunable. Constants live in one config object so they can be adjusted after we play with it.)

## 7. Audio Feedback

- **Bell (correct):** short, pleasant — two stacked sine waves at 880 Hz + 1320 Hz, ~600 ms decay envelope.
- **Buzzer (wrong):** square wave at ~180 Hz, ~400 ms, with a slight pitch drop.
- All synthesized via Web Audio API → no asset loading, works offline.
- Optional toggle in a small settings menu to mute sounds.

## 8. Data Storage (`localStorage`)

```ts
type Stored = {
  difficulty: 'easy' | 'medium' | 'hard';
  history: AttemptLog[];           // append-only, capped at e.g. 1000 entries
  scaleStats: Record<string, ScaleStats>;
  settings: { muted: boolean };
};

type AttemptLog = {
  scaleId: string;
  timestamp: number;
  elapsedMs: number;
  correct: boolean;
  missedNotes: string[];
  extraNotes: string[];
};

type ScaleStats = {
  attempts: number;
  recentResults: AttemptLog[];     // last 10
};
```

Derived numbers (`errorRate`, `avgTimeMs`) are computed on the fly from `recentResults`.

## 9. Out of Scope (v1) / Future Versions

Reserved for later versions, in rough priority order:

1. **Chord-practice mode.** A toggle (or separate game mode) that swaps "scale" for "chord": the prompt becomes a chord name (e.g. "D minor 7", "G7", "C# dim") and the user marks the chord tones on the keyboard. Same adaptive selection, scoring, and feedback machinery. Will require a chord catalog (triads, 7ths, extensions) and a difficulty tiering analogous to scales.
2. **MIDI keyboard input** via the Web MIDI API. A connected MIDI keyboard would let the user press real keys to mark notes — closer to actual practice. Sustain/release timing could also feed into scoring (e.g. rewarding keys held simultaneously vs. one at a time).
3. **Per-note audio toggle.** A setting that controls whether each tap on the on-screen keyboard plays the corresponding note. Default ON for beginners (helps build the ear), OFF for advanced users who want to test pure recall. Independent from the existing bell/buzzer mute. Would synthesize tones via Web Audio (same engine as feedback sounds).
4. Note name / interval display on the keys (the user is supposed to know the notes).
5. Multiplayer, leaderboards, accounts.
6. Audio playback of the *full* scale (not just per-tap notes) — could play the scale up and down on demand as a hint.
7. Mobile portrait layout (v1 just prompts the user to rotate).

## 10. File Layout (proposed)

```
scale-practice-game/
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
└── src/
    ├── main.ts              # entry, screen routing
    ├── styles.css
    ├── scales.ts            # scale catalog + pitch-class math + canonical names
    ├── piano.ts             # keyboard rendering + key-toggle logic
    ├── stopwatch.ts
    ├── audio.ts             # bell / buzzer synthesis
    ├── storage.ts           # localStorage wrapper
    ├── selector.ts          # adaptive scale picking
    ├── screens/
    │   ├── difficulty.ts
    │   ├── round.ts
    │   └── feedback.ts
    └── types.ts
```

## 11. Resolved Decisions

1. **Keyboard range:** **C3–F5** (30 keys: 18 white + 12 black). Every chromatic root has at least one full octave above it within the visible range.
2. **Scale name spelling:** lean toward the **conventional key signature** for each scale, so we mix sharps and flats. Concretely:
   - Major: C, G, D, A, E, B, F#, C#, F, Bb, Eb, Ab, Db, Gb, Cb (use whichever spelling has the simpler key signature; e.g. F# major instead of Gb major, but Db major instead of C# major).
   - Natural Minor: A, E, B, F#, C#, G#, D#, A#, D, G, C, F, Bb, Eb, Ab.
   - Other scale types follow the same convention based on their parallel major. A single lookup table in `scales.ts` defines the canonical name per `(root, scaleType)`.
3. **Reset stats:** include a **"Reset stats" button** in a small settings menu, gated by a confirmation dialog. Clears `history`, `scaleStats`, but keeps `difficulty` and `settings`.
4. **Timer behavior:** stops at Submit. Does not run during the feedback screen.
