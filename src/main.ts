import { playBell, playBuzzer } from './audio';
import { Piano } from './piano';
import { pitchClassesEqual } from './scales';
import { pickScale } from './selector';
import { finalize, liveScore, newLiveSession, scoreBracket, type LiveSession } from './session';
import { load, recordAttempt, recordSession, resetStats, save } from './storage';
import { Stopwatch, formatMs } from './stopwatch';
import type { AttemptLog, Difficulty, PitchClass, Scale, Session, Stored } from './types';

type Screen =
  | 'difficulty'
  | 'round'
  | 'feedback'
  | 'sessionSummary'
  | 'history'
  | 'settings';

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
let liveSession: LiveSession | null = null;
let lastFinishedSession: Session | null = null;

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
      liveSession = newLiveSession(t.id);
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

  wrap.appendChild(buildRoundHeader(scale.displayName, '00:00.00'));

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

  const piano = new Piano(pianoHost, () => { /* tracked internally */ });
  const stopwatch = new Stopwatch();
  round = { scale, stopwatch, piano };

  submit.onclick = () => submitRound();

  stopwatch.start((ms) => updateTimer(ms));
}

function buildRoundHeader(scaleName: string, timerText: string): HTMLElement {
  const header = document.createElement('div');
  header.className = 'round-header';

  const left = document.createElement('div');
  left.className = 'round-header-left';
  const name = document.createElement('div');
  name.className = 'scale-name';
  name.textContent = scaleName;
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
  if (liveSession) liveSession.attempts.push(attempt);
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

function endSession(): void {
  // If a round is in progress, abandon it (don't record the in-progress attempt).
  if (round) {
    round.stopwatch.stop();
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
        <div class="scale-name">${escapeHtml(feedback.scale.displayName)}</div>
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
  scoreBox.innerHTML = `
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

  // Comparison to previous session.
  const prev = state.sessions
    .slice(0, -1) // exclude current (just appended)
    .filter((s) => s.id !== session.id)
    .at(-1);
  const cmp = document.createElement('div');
  cmp.className = 'comparison';
  if (prev) {
    const delta = session.sessionScore - prev.sessionScore;
    const sign = delta > 0 ? '+' : '';
    const cls = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
    cmp.innerHTML = `<span class="cmp-${cls}">${sign}${delta.toFixed(1)}</span> vs. previous session (${prev.sessionScore.toFixed(0)})`;
  } else {
    cmp.textContent = 'First session — keep going to see how you improve.';
  }
  wrap.appendChild(cmp);

  // Chart.
  const chartWrap = document.createElement('div');
  chartWrap.className = 'chart-wrap';
  const chartTitle = document.createElement('div');
  chartTitle.className = 'chart-title';
  chartTitle.textContent = 'Recent sessions';
  chartWrap.appendChild(chartTitle);
  chartWrap.appendChild(buildChart(state.sessions, session.id));
  wrap.appendChild(chartWrap);

  // Buttons.
  const actions = document.createElement('div');
  actions.className = 'summary-actions';
  const newBtn = document.createElement('button');
  newBtn.type = 'button';
  newBtn.className = 'submit-btn';
  newBtn.textContent = 'New session';
  newBtn.onclick = () => {
    liveSession = newLiveSession(state.difficulty);
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

function buildChart(sessions: Session[], currentId: string): SVGSVGElement {
  const recent = sessions.slice(-20);
  const allTimeBest = sessions.length
    ? Math.max(...sessions.map((s) => s.sessionScore))
    : 100;

  const W = 600;
  const H = 200;
  const PAD_L = 32;
  const PAD_R = 12;
  const PAD_T = 12;
  const PAD_B = 28;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const maxScore = 100;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'chart');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  // Y-axis labels at 0, 50, 100.
  for (const yVal of [0, 50, 100]) {
    const y = PAD_T + innerH - (yVal / maxScore) * innerH;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(PAD_L));
    line.setAttribute('x2', String(W - PAD_R));
    line.setAttribute('y1', String(y));
    line.setAttribute('y2', String(y));
    line.setAttribute('class', 'chart-grid');
    svg.appendChild(line);
    const lbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    lbl.setAttribute('x', String(PAD_L - 6));
    lbl.setAttribute('y', String(y + 4));
    lbl.setAttribute('text-anchor', 'end');
    lbl.setAttribute('class', 'chart-axis');
    lbl.textContent = String(yVal);
    svg.appendChild(lbl);
  }

  // All-time best line.
  if (sessions.length > 1) {
    const y = PAD_T + innerH - (allTimeBest / maxScore) * innerH;
    const best = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    best.setAttribute('x1', String(PAD_L));
    best.setAttribute('x2', String(W - PAD_R));
    best.setAttribute('y1', String(y));
    best.setAttribute('y2', String(y));
    best.setAttribute('class', 'chart-best');
    svg.appendChild(best);
    const bestLbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    bestLbl.setAttribute('x', String(W - PAD_R));
    bestLbl.setAttribute('y', String(y - 4));
    bestLbl.setAttribute('text-anchor', 'end');
    bestLbl.setAttribute('class', 'chart-best-label');
    bestLbl.textContent = `Best ${allTimeBest.toFixed(0)}`;
    svg.appendChild(bestLbl);
  }

  // Bars.
  const n = recent.length;
  const slot = innerW / Math.max(n, 1);
  const barW = Math.max(4, slot * 0.7);
  recent.forEach((s, i) => {
    const x = PAD_L + i * slot + (slot - barW) / 2;
    const h = (s.sessionScore / maxScore) * innerH;
    const y = PAD_T + innerH - h;
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(x));
    rect.setAttribute('y', String(y));
    rect.setAttribute('width', String(barW));
    rect.setAttribute('height', String(h));
    rect.setAttribute('class', `chart-bar ${s.id === currentId ? 'current' : ''}`);
    rect.setAttribute('rx', '2');
    const titleEl = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    const d = new Date(s.startedAt);
    titleEl.textContent = `${d.toLocaleString()} — ${s.sessionScore.toFixed(0)} (${s.attempts} attempts)`;
    rect.appendChild(titleEl);
    svg.appendChild(rect);
  });

  // X-axis label.
  const xLbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
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
      lastScaleId = null;
      render();
    }
  };
  wrap.appendChild(resetBtn);

  root.appendChild(wrap);
}

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
