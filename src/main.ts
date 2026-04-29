import { playBell, playBuzzer } from './audio';
import { Piano } from './piano';
import { pitchClassesEqual } from './scales';
import { pickScale } from './selector';
import { load, recordAttempt, resetStats, save } from './storage';
import { Stopwatch, formatMs } from './stopwatch';
import type { AttemptLog, Difficulty, PitchClass, Scale, Stored } from './types';

type Screen = 'difficulty' | 'round' | 'feedback' | 'history' | 'settings';

type RoundState = {
  scale: Scale;
  stopwatch: Stopwatch;
  piano: Piano;
};

type FeedbackState = {
  scale: Scale;
  attempt: AttemptLog;
};

const root = document.getElementById('app') as HTMLDivElement;

let state: Stored = load();
let lastScaleId: string | null = null;
let screen: Screen = 'difficulty';
let round: RoundState | null = null;
let feedback: FeedbackState | null = null;

function render(): void {
  root.innerHTML = '';
  switch (screen) {
    case 'difficulty':
      renderDifficulty();
      break;
    case 'round':
      renderRound();
      break;
    case 'feedback':
      renderFeedback();
      break;
    case 'history':
      renderHistory();
      break;
    case 'settings':
      renderSettings();
      break;
  }
}

// ---------- Difficulty screen ----------

function renderDifficulty(): void {
  const wrap = document.createElement('div');
  wrap.className = 'screen difficulty-screen';

  const title = document.createElement('h1');
  title.textContent = 'Scale Practice';
  wrap.appendChild(title);

  const sub = document.createElement('p');
  sub.className = 'subtitle';
  sub.textContent = 'Choose a difficulty';
  wrap.appendChild(sub);

  const row = document.createElement('div');
  row.className = 'difficulty-row';

  const tiers: { id: Difficulty; label: string; desc: string }[] = [
    { id: 'easy', label: 'Easy', desc: 'Major and Minor scales' },
    { id: 'medium', label: 'Medium', desc: 'Adds Harmonic/Melodic Minor + Pentatonics' },
    { id: 'hard', label: 'Hard', desc: 'Adds Modes, Blues, Whole Tone, Diminished' },
  ];

  for (const t of tiers) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `difficulty-btn ${state.difficulty === t.id ? 'active' : ''}`;
    btn.innerHTML = `<span class="dl">${t.label}</span><span class="dd">${t.desc}</span>`;
    btn.onclick = () => {
      state = { ...state, difficulty: t.id };
      save(state);
      startRound();
    };
    row.appendChild(btn);
  }

  wrap.appendChild(row);

  const links = document.createElement('div');
  links.className = 'links';
  const histLink = document.createElement('button');
  histLink.type = 'button';
  histLink.className = 'link-btn';
  histLink.textContent = 'History';
  histLink.onclick = () => { screen = 'history'; render(); };
  const settingsLink = document.createElement('button');
  settingsLink.type = 'button';
  settingsLink.className = 'link-btn';
  settingsLink.textContent = 'Settings';
  settingsLink.onclick = () => { screen = 'settings'; render(); };
  links.append(histLink, settingsLink);
  wrap.appendChild(links);

  root.appendChild(wrap);
}

// ---------- Round ----------

function startRound(): void {
  feedback = null;
  screen = 'round';
  render();
}

function renderRound(): void {
  const scale = pickScale(state, state.difficulty, lastScaleId);

  const wrap = document.createElement('div');
  wrap.className = 'screen round-screen';

  const header = document.createElement('div');
  header.className = 'round-header';
  const name = document.createElement('div');
  name.className = 'scale-name';
  name.textContent = scale.displayName;
  const timer = document.createElement('div');
  timer.className = 'timer';
  timer.id = 'timer';
  timer.textContent = '00:00.00';
  header.append(name, timer);
  wrap.appendChild(header);

  const playArea = document.createElement('div');
  playArea.className = 'play-area';

  const pianoHost = document.createElement('div');
  pianoHost.className = 'piano-host';
  playArea.appendChild(pianoHost);

  const submit = document.createElement('button');
  submit.type = 'button';
  submit.className = 'submit-btn';
  submit.textContent = 'Submit';
  playArea.appendChild(submit);

  wrap.appendChild(playArea);
  root.appendChild(wrap);

  const piano = new Piano(pianoHost, () => { /* selection tracked internally */ });
  const stopwatch = new Stopwatch();
  round = { scale, stopwatch, piano };

  submit.onclick = () => submitRound();

  stopwatch.start((ms) => updateTimer(ms));
}

function updateTimer(ms: number): void {
  const el = document.getElementById('timer');
  if (el) el.textContent = formatMs(ms);
}

function submitRound(): void {
  if (!round) return;
  const elapsedMs = round.stopwatch.stop();
  const scalePcs = new Set(round.scale.pitchClasses);
  const markedPcs = round.piano.selectedPcs();

  const missed: PitchClass[] = round.scale.pitchClasses.filter((pc) => !markedPcs.has(pc));
  const extra: PitchClass[] = [...markedPcs].filter((pc) => !scalePcs.has(pc));
  const correct = pitchClassesEqual([...markedPcs], round.scale.pitchClasses);

  const attempt: AttemptLog = {
    scaleId: round.scale.id,
    timestamp: Date.now(),
    elapsedMs,
    correct,
    missedNotes: missed,
    extraNotes: extra,
  };

  state = recordAttempt(state, attempt);
  lastScaleId = round.scale.id;

  if (!state.settings.muted) {
    if (correct) playBell();
    else playBuzzer();
  }

  feedback = { scale: round.scale, attempt };
  round.piano.setInteractive(false);
  round.piano.showFeedback(scalePcs);
  showFeedbackOverlay();
  round = null;
  screen = 'feedback';
}

// ---------- Feedback ----------

function renderFeedback(): void {
  if (!feedback) {
    screen = 'difficulty';
    render();
    return;
  }
  // If we got here via re-render (not via submit), we lost the keyboard state.
  // Simplest recovery: go back to difficulty.
  screen = 'difficulty';
  render();
}

function showFeedbackOverlay(): void {
  if (!feedback) return;
  const header = root.querySelector('.round-header');
  if (header) {
    const result = feedback.attempt.correct ? 'correct' : 'incorrect';
    const elapsed = formatMs(feedback.attempt.elapsedMs);
    header.innerHTML = `
      <div class="scale-name">${feedback.scale.displayName}</div>
      <div class="timer ${result}">${elapsed}</div>
    `;
  }

  const playArea = root.querySelector('.play-area');
  const oldBtn = playArea?.querySelector('.submit-btn');
  if (oldBtn && playArea) {
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'submit-btn next-btn';
    next.textContent = 'Next';
    next.onclick = () => startRound();
    playArea.replaceChild(next, oldBtn);
  }

  if (!root.querySelector('.result-banner')) {
    const banner = document.createElement('div');
    banner.className = `result-banner ${feedback.attempt.correct ? 'ok' : 'bad'}`;
    banner.textContent = feedback.attempt.correct
      ? 'Correct!'
      : 'Not quite — see correct notes below';
    const wrap = root.querySelector('.round-screen');
    wrap?.insertBefore(banner, wrap.querySelector('.play-area'));
  }
}

// ---------- History ----------

function renderHistory(): void {
  const wrap = document.createElement('div');
  wrap.className = 'screen history-screen';

  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'link-btn back';
  back.textContent = '← Back';
  back.onclick = () => { screen = 'difficulty'; render(); };
  wrap.appendChild(back);

  const title = document.createElement('h2');
  title.textContent = 'History';
  wrap.appendChild(title);

  if (state.history.length === 0) {
    const p = document.createElement('p');
    p.textContent = 'No attempts yet.';
    wrap.appendChild(p);
  } else {
    const table = document.createElement('table');
    table.className = 'history-table';
    table.innerHTML = `
      <thead><tr><th>When</th><th>Scale</th><th>Time</th><th>Result</th></tr></thead>
    `;
    const tbody = document.createElement('tbody');
    for (const h of state.history.slice(0, 100)) {
      const tr = document.createElement('tr');
      const date = new Date(h.timestamp);
      const cls = h.correct ? 'ok' : 'bad';
      const mark = h.correct ? '✓' : '✗';
      tr.innerHTML = `
        <td>${date.toLocaleString()}</td>
        <td>${h.scaleId}</td>
        <td>${formatMs(h.elapsedMs)}</td>
        <td class="${cls}">${mark}</td>
      `;
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    wrap.appendChild(table);
  }

  root.appendChild(wrap);
}

// ---------- Settings ----------

function renderSettings(): void {
  const wrap = document.createElement('div');
  wrap.className = 'screen settings-screen';

  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'link-btn back';
  back.textContent = '← Back';
  back.onclick = () => { screen = 'difficulty'; render(); };
  wrap.appendChild(back);

  const title = document.createElement('h2');
  title.textContent = 'Settings';
  wrap.appendChild(title);

  const muteRow = document.createElement('label');
  muteRow.className = 'setting-row';
  const muteCb = document.createElement('input');
  muteCb.type = 'checkbox';
  muteCb.checked = state.settings.muted;
  muteCb.onchange = () => {
    state = { ...state, settings: { ...state.settings, muted: muteCb.checked } };
    save(state);
  };
  muteRow.appendChild(muteCb);
  muteRow.appendChild(document.createTextNode(' Mute feedback sounds'));
  wrap.appendChild(muteRow);

  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'danger-btn';
  resetBtn.textContent = 'Reset stats';
  resetBtn.onclick = () => {
    if (confirm('Reset all history and adaptive stats? This cannot be undone.')) {
      state = resetStats(state);
      lastScaleId = null;
      render();
    }
  };
  wrap.appendChild(resetBtn);

  root.appendChild(wrap);
}

render();
