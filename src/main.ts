import { playBell, playBuzzer, playChord } from './audio';
import { addListener as addMidiListener, getHeldMidis, initMidi, isMidiSupported } from './midi';
import { Piano } from './piano';
import { pitchClassesEqual } from './scales';
import { pickPrompt } from './selector';
import { finalize, liveScore, newLiveSession, scoreBracket, type LiveSession } from './session';
import { load, recordAttempt, recordSession, resetStats, save } from './storage';
import { Stopwatch, formatMs } from './stopwatch';
import type { AttemptLog, Difficulty, Mode, PitchClass, Prompt, Session, Stored } from './types';

type Screen =
  | 'difficulty'
  | 'round'
  | 'feedback'
  | 'sessionSummary'
  | 'history'
  | 'settings';

type RoundState = {
  prompt: Prompt;
  stopwatch: Stopwatch;
  piano: Piano;
  unsubscribeMidi: () => void;
};

type FeedbackState = {
  prompt: Prompt;
  attempt: AttemptLog;
};

const root = document.getElementById('app') as HTMLDivElement;

let state: Stored = load();
let lastPromptId: Record<Mode, string | null> = { scales: null, chords: null };
let screen: Screen = 'difficulty';
let round: RoundState | null = null;
let feedback: FeedbackState | null = null;
let liveSession: LiveSession | null = null;
let lastFinishedSession: Session | null = null;
let historyFilter: 'all' | Mode = 'all';
let chartFilter: 'all' | Mode = 'all';

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
    case 'sessionSummary':
      renderSessionSummary();
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
  sub.textContent = 'Pick a mode and difficulty';
  wrap.appendChild(sub);

  const howto = document.createElement('p');
  howto.className = 'howto';
  howto.textContent =
    'Tap every key that belongs to the scale or chord, then Submit. You’re timed — accuracy and speed both count.';
  wrap.appendChild(howto);

  // Mode toggle.
  const modeRow = document.createElement('div');
  modeRow.className = 'mode-toggle';
  const modes: { id: Mode; label: string }[] = [
    { id: 'scales', label: 'Scales' },
    { id: 'chords', label: 'Chords' },
  ];
  for (const m of modes) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `mode-btn ${state.mode === m.id ? 'active' : ''}`;
    btn.textContent = m.label;
    btn.onclick = () => {
      state = { ...state, mode: m.id };
      save(state);
      render();
    };
    modeRow.appendChild(btn);
  }
  wrap.appendChild(modeRow);

  // Difficulty buttons.
  const row = document.createElement('div');
  row.className = 'difficulty-row';

  const scaleTiers: { id: Difficulty; label: string; desc: string }[] = [
    { id: 'easy', label: 'Easy', desc: 'Major and Minor scales' },
    { id: 'medium', label: 'Medium', desc: 'Adds Harmonic/Melodic Minor + Pentatonics' },
    { id: 'hard', label: 'Hard', desc: 'Adds Modes, Blues, Whole Tone, Diminished' },
  ];
  const chordTiers: { id: Difficulty; label: string; desc: string }[] = [
    { id: 'easy', label: 'Easy', desc: 'Triads + maj7, m7, 7' },
    { id: 'medium', label: 'Medium', desc: 'Adds dim, aug, sus2/4, m7♭5, dim7' },
    { id: 'hard', label: 'Hard', desc: 'Adds 9ths, 11ths, 13ths' },
  ];
  const tiers = state.mode === 'chords' ? chordTiers : scaleTiers;

  for (const t of tiers) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `difficulty-btn ${state.difficulty === t.id ? 'active' : ''}`;
    btn.innerHTML = `<span class="dl">${t.label}</span><span class="dd">${t.desc}</span>`;
    btn.onclick = () => {
      state = { ...state, difficulty: t.id };
      save(state);
      liveSession = newLiveSession(state.mode, t.id);
      startRound();
    };
    row.appendChild(btn);
  }

  wrap.appendChild(row);

  // Auto-advance toggle — flow practice without pressing Submit.
  const autoRow = document.createElement('label');
  autoRow.className = 'title-toggle';
  const autoCb = document.createElement('input');
  autoCb.type = 'checkbox';
  autoCb.checked = state.settings.autoAdvance;
  autoCb.onchange = () => {
    state = {
      ...state,
      settings: { ...state.settings, autoAdvance: autoCb.checked },
    };
    save(state);
  };
  autoRow.appendChild(autoCb);
  const autoText = document.createElement('span');
  autoText.textContent =
    ' Auto-advance — skip Submit; next prompt appears as soon as the right notes are played';
  autoRow.appendChild(autoText);
  wrap.appendChild(autoRow);

  const midiHint = document.createElement('p');
  midiHint.className = 'midi-hint';
  midiHint.textContent = isMidiSupported()
    ? 'MIDI keyboards are supported — connect one and play.'
    : 'MIDI input not supported in this browser (try Chrome/Edge).';
  wrap.appendChild(midiHint);

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
  const mode = liveSession?.mode ?? state.mode;
  const prompt = pickPrompt(state, mode, state.difficulty, lastPromptId[mode]);

  const wrap = document.createElement('div');
  wrap.className = 'screen round-screen';

  wrap.appendChild(buildRoundHeader(prompt.displayName, '00:00.00', mode));

  const playArea = document.createElement('div');
  playArea.className = 'play-area';

  const pianoHost = document.createElement('div');
  pianoHost.className = 'piano-host';
  playArea.appendChild(pianoHost);

  const submit = document.createElement('button');
  submit.type = 'button';
  submit.className = 'submit-btn';
  submit.textContent = 'Submit';
  if (!state.settings.autoAdvance) playArea.appendChild(submit);

  wrap.appendChild(playArea);
  root.appendChild(wrap);

  // Chord mode uses 'held' selection so "no extra keys" is meaningful (a
  // held note that doesn't belong fails the match). Scale mode toggles since
  // you can't physically hold 7 keys at once.
  const selectionMode = mode === 'chords' ? 'held' : 'toggle';
  // In held mode, carry over keys the user is still physically pressing so
  // there's no perceived lag between rounds.
  const initialSelected =
    selectionMode === 'held' ? getHeldMidis() : new Set<number>();

  const promptPcs = new Set(prompt.pitchClasses);
  const piano = new Piano(
    pianoHost,
    (selectedPcs) => onSelectionChange(selectedPcs, promptPcs),
    selectionMode,
    initialSelected,
  );
  const stopwatch = new Stopwatch();

  const unsubscribeMidi = addMidiListener({
    onNoteOn: (midi) => piano.noteOn(midi),
    onNoteOff: (midi) => piano.noteOff(midi),
  });

  round = { prompt, stopwatch, piano, unsubscribeMidi };

  submit.onclick = () => submitRound(false);

  stopwatch.start((ms) => updateTimer(ms));

  // If carry-over already matches (rare), check once after construction.
  if (selectionMode === 'held' && initialSelected.size > 0) {
    onSelectionChange(piano.selectedPcs(), promptPcs);
  }
}

function onSelectionChange(
  selectedPcs: Set<PitchClass>,
  promptPcs: Set<PitchClass>,
): void {
  if (!round) return;
  if (!state.settings.autoAdvance) return;
  if (selectedPcs.size !== promptPcs.size) return;
  for (const pc of selectedPcs) if (!promptPcs.has(pc)) return;
  // Match — auto-submit.
  submitRound(true);
}

function buildRoundHeader(
  promptName: string,
  timerText: string,
  mode: Mode,
): HTMLElement {
  const header = document.createElement('div');
  header.className = 'round-header';

  const left = document.createElement('div');
  left.className = 'round-header-left';
  const hint = document.createElement('div');
  hint.className = 'prompt-hint';
  hint.textContent =
    mode === 'chords' ? 'Tap all keys in this chord' : 'Tap all keys in this scale';
  left.appendChild(hint);
  const name = document.createElement('div');
  name.className = 'scale-name';
  name.textContent = promptName;
  left.appendChild(name);

  const right = document.createElement('div');
  right.className = 'round-header-right';

  const timer = document.createElement('div');
  timer.className = 'timer';
  timer.id = 'timer';
  timer.textContent = timerText;
  right.appendChild(timer);

  const endBtn = document.createElement('button');
  endBtn.type = 'button';
  endBtn.className = 'end-session-btn';
  endBtn.textContent = 'End session';
  endBtn.onclick = () => endSession();
  right.appendChild(endBtn);

  header.append(left, right);
  return header;
}

function updateTimer(ms: number): void {
  const el = document.getElementById('timer');
  if (el) el.textContent = formatMs(ms);
}

function submitRound(auto: boolean): void {
  if (!round) return;
  const elapsedMs = round.stopwatch.stop();
  round.unsubscribeMidi();
  const promptPcs = new Set(round.prompt.pitchClasses);
  const markedPcs = round.piano.selectedPcs();

  const missed: PitchClass[] = round.prompt.pitchClasses.filter((pc) => !markedPcs.has(pc));
  const extra: PitchClass[] = [...markedPcs].filter((pc) => !promptPcs.has(pc));
  const correct = pitchClassesEqual([...markedPcs], round.prompt.pitchClasses);

  const attempt: AttemptLog = {
    scaleId: round.prompt.id,
    timestamp: Date.now(),
    elapsedMs,
    correct,
    missedNotes: missed,
    extraNotes: extra,
  };

  const mode: Mode = liveSession?.mode ?? state.mode;
  state = recordAttempt(state, mode, attempt);
  if (liveSession) liveSession.attempts.push(attempt);
  lastPromptId[mode] = round.prompt.id;

  if (!state.settings.muted) {
    if (correct) {
      if (mode === 'chords') playChord(round.piano.selectedMidis());
      else playBell();
    } else {
      playBuzzer();
    }
  }

  // Auto-advance only fires on a correct match — skip the feedback screen and
  // jump straight into the next round so the user can keep playing.
  if (auto && correct) {
    round = null;
    startRound();
    return;
  }

  feedback = { prompt: round.prompt, attempt };
  round.piano.setInteractive(false);
  round.piano.showFeedback(promptPcs);
  showFeedbackOverlay();
  round = null;
  screen = 'feedback';
}

function endSession(): void {
  // If a round is in progress, abandon it (don't record the in-progress attempt).
  if (round) {
    round.stopwatch.stop();
    round.unsubscribeMidi();
    round = null;
  }
  if (!liveSession) {
    screen = 'difficulty';
    render();
    return;
  }
  const finished = finalize(liveSession);
  liveSession = null;
  if (!finished) {
    // No attempts — just go back to difficulty.
    screen = 'difficulty';
    render();
    return;
  }
  state = recordSession(state, finished);
  lastFinishedSession = finished;
  chartFilter = 'all';
  screen = 'sessionSummary';
  render();
}

// ---------- Feedback ----------

function renderFeedback(): void {
  if (!feedback) {
    screen = 'difficulty';
    render();
    return;
  }
  // If we got here via re-render (lost in-place DOM), bail to difficulty.
  screen = 'difficulty';
  render();
}

function showFeedbackOverlay(): void {
  if (!feedback) return;
  const header = root.querySelector('.round-header');
  if (header) {
    const result = feedback.attempt.correct ? 'correct' : 'incorrect';
    const elapsed = formatMs(feedback.attempt.elapsedMs);
    const liveScoreText = liveSession
      ? `Score ${liveScore(liveSession).toFixed(0)}`
      : '';
    header.innerHTML = `
      <div class="round-header-left">
        <div class="scale-name">${escapeHtml(feedback.prompt.displayName)}</div>
        ${liveScoreText ? `<div class="live-score">${liveScoreText}</div>` : ''}
      </div>
      <div class="round-header-right">
        <div class="timer ${result}">${elapsed}</div>
      </div>
    `;
    // Re-add End session button.
    const right = header.querySelector('.round-header-right');
    if (right) {
      const endBtn = document.createElement('button');
      endBtn.type = 'button';
      endBtn.className = 'end-session-btn';
      endBtn.textContent = 'End session';
      endBtn.onclick = () => endSession();
      right.appendChild(endBtn);
    }
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

// ---------- Session Summary ----------

function renderSessionSummary(): void {
  const session = lastFinishedSession;
  if (!session) {
    screen = 'difficulty';
    render();
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = 'screen summary-screen';

  const title = document.createElement('h2');
  title.textContent = 'Session Summary';
  wrap.appendChild(title);

  // Big score.
  const bracket = scoreBracket(session.sessionScore);
  const scoreBox = document.createElement('div');
  scoreBox.className = `score-hero ${bracket.className}`;
  const modeLabel = session.mode === 'chords' ? 'Chords' : 'Scales';
  scoreBox.innerHTML = `
    <div class="score-mode">${modeLabel} · ${session.difficulty}</div>
    <div class="score-number">${session.sessionScore.toFixed(0)}</div>
    <div class="score-label">${bracket.label}</div>
  `;
  wrap.appendChild(scoreBox);

  // Sub-stats.
  const stats = document.createElement('div');
  stats.className = 'summary-stats';
  const accuracy =
    session.attempts > 0
      ? Math.round((session.correctAttempts / session.attempts) * 100)
      : 0;
  const avgTime =
    session.avgCorrectTimeMs > 0 ? formatMs(session.avgCorrectTimeMs) : '—';
  stats.innerHTML = `
    <div class="stat"><div class="stat-v">${session.attempts}</div><div class="stat-k">Attempts</div></div>
    <div class="stat"><div class="stat-v">${accuracy}%</div><div class="stat-k">Accuracy</div></div>
    <div class="stat"><div class="stat-v">${avgTime}</div><div class="stat-k">Avg time (correct)</div></div>
  `;
  wrap.appendChild(stats);

  // Comparison vs the previous session of the SAME mode.
  const prevSameMode = state.sessions
    .filter((s) => s.id !== session.id && s.mode === session.mode)
    .at(-1);
  const cmp = document.createElement('div');
  cmp.className = 'comparison';
  if (prevSameMode) {
    const delta = session.sessionScore - prevSameMode.sessionScore;
    const sign = delta > 0 ? '+' : '';
    const cls = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
    cmp.innerHTML = `<span class="cmp-${cls}">${sign}${delta.toFixed(1)}</span> vs. previous ${modeLabel.toLowerCase()} session (${prevSameMode.sessionScore.toFixed(0)})`;
  } else {
    cmp.textContent = `First ${modeLabel.toLowerCase()} session — keep going to see how you improve.`;
  }
  wrap.appendChild(cmp);

  // Chart with mode filter.
  const chartWrap = document.createElement('div');
  chartWrap.className = 'chart-wrap';

  const chartHead = document.createElement('div');
  chartHead.className = 'chart-head';
  const chartTitle = document.createElement('div');
  chartTitle.className = 'chart-title';
  chartTitle.textContent = 'Recent sessions';
  chartHead.appendChild(chartTitle);

  const filterRow = document.createElement('div');
  filterRow.className = 'chart-filter';
  const filters: { id: 'all' | Mode; label: string }[] = [
    { id: 'all', label: 'Both' },
    { id: 'scales', label: 'Scales' },
    { id: 'chords', label: 'Chords' },
  ];
  for (const f of filters) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `chip ${chartFilter === f.id ? 'active' : ''}`;
    btn.textContent = f.label;
    btn.onclick = () => {
      chartFilter = f.id;
      render();
    };
    filterRow.appendChild(btn);
  }
  chartHead.appendChild(filterRow);
  chartWrap.appendChild(chartHead);

  chartWrap.appendChild(buildChart(state.sessions, session.id, chartFilter));

  // Legend.
  const legend = document.createElement('div');
  legend.className = 'chart-legend';
  legend.innerHTML = `
    <span class="legend-item"><span class="legend-swatch scales"></span>Scales</span>
    <span class="legend-item"><span class="legend-swatch chords"></span>Chords</span>
  `;
  chartWrap.appendChild(legend);

  wrap.appendChild(chartWrap);

  // Buttons.
  const actions = document.createElement('div');
  actions.className = 'summary-actions';
  const newBtn = document.createElement('button');
  newBtn.type = 'button';
  newBtn.className = 'submit-btn';
  newBtn.textContent = 'New session';
  newBtn.onclick = () => {
    liveSession = newLiveSession(state.mode, state.difficulty);
    startRound();
  };
  const doneBtn = document.createElement('button');
  doneBtn.type = 'button';
  doneBtn.className = 'link-btn';
  doneBtn.textContent = 'Back to menu';
  doneBtn.onclick = () => { screen = 'difficulty'; render(); };
  actions.append(newBtn, doneBtn);
  wrap.appendChild(actions);

  root.appendChild(wrap);
}

function buildChart(
  sessions: Session[],
  currentId: string,
  filter: 'all' | Mode,
): SVGSVGElement {
  // Use the last 20 sessions overall as the x-axis. Filter only affects which
  // series get drawn.
  const recent = sessions.slice(-20);
  const considered = sessions.filter(
    (s) => filter === 'all' || s.mode === filter,
  );
  const allTimeBest = considered.length
    ? Math.max(...considered.map((s) => s.sessionScore))
    : 0;

  const W = 600;
  const H = 200;
  const PAD_L = 32;
  const PAD_R = 12;
  const PAD_T = 12;
  const PAD_B = 28;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const maxScore = 100;

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'chart');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  // Y-axis grid + labels at 0, 50, 100.
  for (const yVal of [0, 50, 100]) {
    const y = PAD_T + innerH - (yVal / maxScore) * innerH;
    const line = document.createElementNS(svgNS, 'line');
    line.setAttribute('x1', String(PAD_L));
    line.setAttribute('x2', String(W - PAD_R));
    line.setAttribute('y1', String(y));
    line.setAttribute('y2', String(y));
    line.setAttribute('class', 'chart-grid');
    svg.appendChild(line);
    const lbl = document.createElementNS(svgNS, 'text');
    lbl.setAttribute('x', String(PAD_L - 6));
    lbl.setAttribute('y', String(y + 4));
    lbl.setAttribute('text-anchor', 'end');
    lbl.setAttribute('class', 'chart-axis');
    lbl.textContent = String(yVal);
    svg.appendChild(lbl);
  }

  // All-time best line for the active filter.
  if (considered.length > 1 && allTimeBest > 0) {
    const y = PAD_T + innerH - (allTimeBest / maxScore) * innerH;
    const best = document.createElementNS(svgNS, 'line');
    best.setAttribute('x1', String(PAD_L));
    best.setAttribute('x2', String(W - PAD_R));
    best.setAttribute('y1', String(y));
    best.setAttribute('y2', String(y));
    best.setAttribute('class', 'chart-best');
    svg.appendChild(best);
    const bestLbl = document.createElementNS(svgNS, 'text');
    bestLbl.setAttribute('x', String(W - PAD_R));
    bestLbl.setAttribute('y', String(y - 4));
    bestLbl.setAttribute('text-anchor', 'end');
    bestLbl.setAttribute('class', 'chart-best-label');
    bestLbl.textContent = `Best ${allTimeBest.toFixed(0)}`;
    svg.appendChild(bestLbl);
  }

  const n = recent.length;
  const slot = innerW / Math.max(n, 1);
  const xFor = (i: number) => PAD_L + i * slot + slot / 2;
  const yFor = (score: number) =>
    PAD_T + innerH - (score / maxScore) * innerH;

  const drawSeries = (mode: Mode, cls: string) => {
    if (filter !== 'all' && filter !== mode) return;
    const points: { i: number; s: Session }[] = [];
    recent.forEach((s, i) => {
      if (s.mode === mode) points.push({ i, s });
    });
    if (points.length === 0) return;

    if (points.length > 1) {
      const d = points
        .map(
          (p, idx) =>
            `${idx === 0 ? 'M' : 'L'}${xFor(p.i).toFixed(2)},${yFor(p.s.sessionScore).toFixed(2)}`,
        )
        .join(' ');
      const path = document.createElementNS(svgNS, 'path');
      path.setAttribute('d', d);
      path.setAttribute('class', `chart-line ${cls}`);
      path.setAttribute('fill', 'none');
      svg.appendChild(path);
    }

    for (const p of points) {
      const c = document.createElementNS(svgNS, 'circle');
      c.setAttribute('cx', String(xFor(p.i)));
      c.setAttribute('cy', String(yFor(p.s.sessionScore)));
      c.setAttribute('r', p.s.id === currentId ? '5.5' : '3.5');
      c.setAttribute('class', `chart-point ${cls} ${p.s.id === currentId ? 'current' : ''}`);
      const titleEl = document.createElementNS(svgNS, 'title');
      const d = new Date(p.s.startedAt);
      const modeLabel = p.s.mode === 'chords' ? 'Chords' : 'Scales';
      titleEl.textContent = `${d.toLocaleString()} — ${modeLabel} ${p.s.difficulty} — ${p.s.sessionScore.toFixed(0)} (${p.s.attempts} attempts)`;
      c.appendChild(titleEl);
      svg.appendChild(c);
    }
  };

  drawSeries('scales', 'scales');
  drawSeries('chords', 'chords');

  // X-axis label.
  const xLbl = document.createElementNS(svgNS, 'text');
  xLbl.setAttribute('x', String(PAD_L + innerW / 2));
  xLbl.setAttribute('y', String(H - 6));
  xLbl.setAttribute('text-anchor', 'middle');
  xLbl.setAttribute('class', 'chart-axis');
  xLbl.textContent =
    n === 0
      ? 'No sessions yet'
      : n === 1
      ? '1 session'
      : `Last ${n} sessions (oldest → newest)`;
  svg.appendChild(xLbl);

  return svg;
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

  // Filter chips.
  const filterRow = document.createElement('div');
  filterRow.className = 'chart-filter';
  const filters: { id: 'all' | Mode; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'scales', label: 'Scales' },
    { id: 'chords', label: 'Chords' },
  ];
  for (const f of filters) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `chip ${historyFilter === f.id ? 'active' : ''}`;
    btn.textContent = f.label;
    btn.onclick = () => { historyFilter = f.id; render(); };
    filterRow.appendChild(btn);
  }
  wrap.appendChild(filterRow);

  // Tag each entry with its mode then merge sorted by timestamp desc.
  type Tagged = AttemptLog & { mode: Mode };
  const tagged: Tagged[] = [
    ...state.history.map((h) => ({ ...h, mode: 'scales' as Mode })),
    ...state.chordHistory.map((h) => ({ ...h, mode: 'chords' as Mode })),
  ];
  const filtered =
    historyFilter === 'all'
      ? tagged
      : tagged.filter((h) => h.mode === historyFilter);
  filtered.sort((a, b) => b.timestamp - a.timestamp);

  if (filtered.length === 0) {
    const p = document.createElement('p');
    p.textContent = 'No attempts yet.';
    wrap.appendChild(p);
  } else {
    const table = document.createElement('table');
    table.className = 'history-table';
    table.innerHTML = `
      <thead><tr><th>When</th><th>Mode</th><th>Prompt</th><th>Time</th><th>Result</th></tr></thead>
    `;
    const tbody = document.createElement('tbody');
    for (const h of filtered.slice(0, 100)) {
      const tr = document.createElement('tr');
      const date = new Date(h.timestamp);
      const cls = h.correct ? 'ok' : 'bad';
      const mark = h.correct ? '✓' : '✗';
      const modeLabel = h.mode === 'chords' ? 'Chord' : 'Scale';
      tr.innerHTML = `
        <td>${date.toLocaleString()}</td>
        <td>${modeLabel}</td>
        <td>${escapeHtml(h.scaleId)}</td>
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
      lastPromptId = { scales: null, chords: null };
      render();
    }
  };
  wrap.appendChild(resetBtn);

  root.appendChild(wrap);
}

// MIDI notes well outside the on-screen piano range (C3..F5) double as a
// shortcut: start a round from the title screen, or bail out of a round/
// feedback screen back to the title. A one-octave buffer above and below
// the displayed range prevents accidental escapes from near-miss keys.
addMidiListener({
  onNoteOn: (midi) => {
    if (midi >= 36 && midi <= 89) return;
    if (screen === 'difficulty') {
      liveSession = newLiveSession(state.mode, state.difficulty);
      startRound();
    } else if (screen === 'round' || screen === 'feedback') {
      endSession();
    }
  },
});

void initMidi();

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;'
    : c === '<' ? '&lt;'
    : c === '>' ? '&gt;'
    : c === '"' ? '&quot;'
    : '&#39;'
  );
}

render();
