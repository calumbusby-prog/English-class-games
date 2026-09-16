const socket = io();

const el = (id) => document.getElementById(id);
const errorBox = el('error');

let code = null;
let hostSecret = null;
let lastState = null;
let tickHandle = null;

const SAMPLE_QUESTIONS = [
  ["What is a synonym for 'happy'?", 'Joyful', 'Angry', 'Tired', 'Bored'],
  ["Choose the correctly punctuated sentence.", "It's raining today.", 'Its raining today.', "Its' raining today.", 'It is raining, today'],
  ["What is the antonym of 'generous'?", 'Stingy', 'Kind', 'Wealthy', 'Friendly'],
  ["Which word is a noun?", 'Happiness', 'Quickly', 'Beautiful', 'Run'],
  ["Complete: She ___ to the store yesterday.", 'went', 'go', 'goes', 'going'],
  ["What does 'benevolent' mean?", 'Kind and well-meaning', 'Angry and hostile', 'Confused', 'Very tired'],
  ["Choose the correct plural of 'child'.", 'children', 'childs', "child's", 'childes'],
  ["Which sentence uses the correct verb tense? ", 'I have finished my homework.', 'I have finish my homework.', 'I has finished my homework.', 'I finishing my homework.'],
];

function setError(msg) {
  errorBox.textContent = msg || '';
}

function saveHostSession() {
  localStorage.setItem('traitors_host', JSON.stringify({ code, hostSecret }));
}

function showView(name) {
  ['setup', 'game', 'over'].forEach((v) => {
    el(`view-${v}`).style.display = v === name ? '' : 'none';
  });
}

function startTicker() {
  if (tickHandle) return;
  tickHandle = setInterval(renderTimer, 250);
}

function renderTimer() {
  const box = el('timerBox');
  if (!lastState || !lastState.deadline) {
    box.innerHTML = '';
    return;
  }
  const remaining = Math.max(0, Math.round((lastState.deadline - Date.now()) / 1000));
  box.innerHTML = `<div class="big-timer">${remaining}</div>`;
}

function initRoom() {
  const saved = JSON.parse(localStorage.getItem('traitors_host') || 'null');
  if (saved && saved.code && saved.hostSecret) {
    socket.emit('host:rejoin', { code: saved.code, hostSecret: saved.hostSecret }, (res) => {
      if (res.ok) {
        code = saved.code;
        hostSecret = saved.hostSecret;
        el('roomCode').textContent = code;
        render(res.state);
      } else {
        createRoom();
      }
    });
  } else {
    createRoom();
  }
}

function createRoom() {
  socket.emit('host:create', {}, (res) => {
    if (res.ok) {
      code = res.code;
      hostSecret = res.hostSecret;
      el('roomCode').textContent = code;
      saveHostSession();
    } else {
      setError('Could not create a room. Refresh and try again.');
    }
  });
}

el('loadSample').addEventListener('click', () => {
  el('questionsInput').value = SAMPLE_QUESTIONS.map((q) => q.join(' | ')).join('\n');
});

function parseQuestions(raw) {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('|').map((s) => s.trim());
      const [text, correct, ...wrong] = parts;
      return { text, correct, wrong: wrong.filter(Boolean) };
    })
    .filter((q) => q.text && q.correct && q.wrong.length >= 1);
}

el('saveQuestions').addEventListener('click', () => {
  const questions = parseQuestions(el('questionsInput').value);
  if (questions.length === 0) {
    el('questionsStatus').textContent = 'No valid questions found. Use: question | correct | wrong1 | wrong2';
    return;
  }
  socket.emit('host:setQuestions', { code, hostSecret, questions }, (res) => {
    el('questionsStatus').textContent = res.ok ? `Saved ${res.count} question(s).` : res.error;
  });
});

el('saveSettings').addEventListener('click', () => {
  const settings = {
    traitorCount: el('setTraitorCount').value || null,
    pointsPerCorrect: el('setPoints').value,
    questionsPerRound: el('setQPerRound').value,
    questionSeconds: el('setQSeconds').value,
    discussionSeconds: el('setDiscussSeconds').value,
    votingSeconds: el('setVoteSeconds').value,
  };
  socket.emit('host:setSettings', { code, hostSecret, settings }, (res) => {
    if (!res.ok) setError(res.error);
  });
});

el('startGame').addEventListener('click', () => {
  setError('');
  socket.emit('host:startGame', { code, hostSecret }, (res) => {
    if (!res.ok) el('startHint').textContent = res.error;
  });
});

el('nextBtn').addEventListener('click', () => {
  socket.emit('host:next', { code, hostSecret }, (res) => {
    if (!res.ok) setError(res.error);
  });
});

el('playAgain').addEventListener('click', () => {
  socket.emit('host:resetToLobby', { code, hostSecret }, (res) => {
    if (!res.ok) setError(res.error);
  });
});

function renderLobby(state) {
  showView('setup');
  el('playerCount').textContent = state.players.length;
  el('playerHint').textContent = state.players.length < 4 ? `Need at least 4 players to start (have ${state.players.length}).` : 'Ready to start whenever you are.';
  el('playerList').innerHTML = state.players
    .map((p) => `<li><span class="pill ${p.connected ? 'online' : 'offline'}">${p.connected ? '●' : '○'}</span> ${escapeHtml(p.name)} <button class="kick-btn" data-id="${p.id}" title="Remove player" style="padding:2px 8px;font-size:12px">✕</button></li>`)
    .join('') || '<li class="muted">Waiting for players to join...</li>';
  el('playerList').querySelectorAll('.kick-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      socket.emit('host:kick', { code, hostSecret, playerId: btn.dataset.id }, () => {});
    });
  });
  el('questionsStatus').textContent = state.questionCount > 0 ? `${state.questionCount} question(s) saved.` : 'No questions saved yet.';
}

function roleLabel(role) {
  return role === 'traitor' ? 'Traitor' : 'Faithful';
}

function playerBadge(p, revealRole) {
  const status = !p.alive ? `<span class="pill dead">${p.eliminatedBy === 'murdered' ? 'Murdered' : 'Banished'}</span>` : '';
  const role = revealRole && p.role ? `<span class="pill role-${p.role}">${roleLabel(p.role)}</span>` : '';
  const conn = `<span class="pill ${p.connected ? 'online' : 'offline'}">${p.connected ? '●' : '○'}</span>`;
  return `<li>${conn} ${escapeHtml(p.name)} ${role} ${status}</li>`;
}

function renderGame(state) {
  showView('game');
  el('roundNum').textContent = state.round;
  el('potAmount').textContent = state.pot;
  el('phasePill').textContent = phaseLabel(state.phase);

  const revealAll = state.phase === 'GAME_OVER';
  el('gamePlayerList').innerHTML = state.players
    .map((p) => playerBadge(p, revealAll || !p.alive))
    .join('');

  el('logFeed').innerHTML = state.log
    .slice()
    .reverse()
    .map((l) => `<div class="entry">${escapeHtml(l.text)}</div>`)
    .join('');

  const body = el('phaseBody');
  switch (state.phase) {
    case 'ROLE_REVEAL':
      body.innerHTML = `<div class="center"><h2>Roles have been secretly assigned</h2><p class="muted">Every player is now viewing their role privately on their own device. When everyone has seen it, begin the challenges.</p></div>`;
      break;
    case 'CHALLENGE_ASK':
      body.innerHTML = `
        <div class="question-text">${escapeHtml(state.currentQuestion.text)}</div>
        <div class="choices">${state.currentQuestion.choices.map((c) => `<button class="choice-btn" disabled>${escapeHtml(c)}</button>`).join('')}</div>
        <p class="center muted" style="margin-top:14px">${state.answeredCount} / ${state.players.filter((p) => p.alive).length} answered</p>`;
      break;
    case 'CHALLENGE_REVEAL': {
      const cq = state.currentQuestion;
      body.innerHTML = `
        <div class="question-text">${escapeHtml(cq.text)}</div>
        <div class="choices">${cq.choices.map((c, i) => `<button class="choice-btn ${i === cq.correctIndex ? 'correct' : ''}" disabled>${escapeHtml(c)}</button>`).join('')}</div>
        <p class="center muted" style="margin-top:14px">Pot is now ${state.pot}</p>`;
      break;
    }
    case 'ROUND_TABLE':
      body.innerHTML = `<div class="center"><h2>🕯️ The Round Table</h2><p class="muted">Discuss out loud as a class. Who do you suspect of being a traitor?</p></div>`;
      break;
    case 'VOTING':
      body.innerHTML = `<div class="center"><h2>Voting is open</h2><p class="muted">${state.votedCount} / ${state.players.filter((p) => p.alive).length} have voted</p></div>`;
      break;
    case 'BANISH_REVEAL': {
      const b = state.lastBanished;
      const tally = (state.voteTally || []).sort((a, b2) => b2.count - a.count).map((t) => `${escapeHtml(t.name)} (${t.count})`).join(', ');
      body.innerHTML = `
        <div class="center">
          <h2>${b ? `${escapeHtml(b.name)} has been banished` : 'No one was banished'}</h2>
          ${b ? `<p class="pill role-${b.role}" style="font-size:16px">${roleLabel(b.role)}</p>` : ''}
          <p class="muted">Votes: ${tally || 'none'}</p>
        </div>`;
      break;
    }
    case 'MURDER_CHOICE':
      body.innerHTML = `<div class="center"><h2>🔪 It is night...</h2><p class="muted">The traitors are secretly choosing their next victim.</p></div>`;
      break;
    case 'MURDER_REVEAL': {
      const m = state.lastMurdered;
      body.innerHTML = `
        <div class="center">
          <h2>${m ? `${escapeHtml(m.name)} was murdered in the night` : 'No one was murdered'}</h2>
          ${m ? `<p class="pill role-${m.role}" style="font-size:16px">${roleLabel(m.role)}</p>` : ''}
        </div>`;
      break;
    }
    default:
      body.innerHTML = '';
  }

  el('nextBtn').textContent = state.nextActionLabel || '';
  el('nextBtn').style.display = state.nextActionLabel ? '' : 'none';

  lastState = state;
  renderTimer();
  startTicker();

  if (state.phase === 'GAME_OVER') {
    renderOver(state);
  }
}

function renderOver(state) {
  showView('over');
  el('winnerTitle').textContent = state.winner === 'faithful' ? '🏆 The Faithful Win!' : '🗡️ The Traitors Win!';
  el('finalPot').textContent = state.pot;
  el('finalBoard').innerHTML = [...state.players]
    .sort((a, b) => b.score - a.score)
    .map((p, i) => `<li class="${p.alive ? '' : 'dead'}"><span><span class="rank">#${i + 1}</span>${escapeHtml(p.name)} <span class="pill role-${p.role}">${roleLabel(p.role)}</span></span><span>${p.score}</span></li>`)
    .join('');
}

function phaseLabel(phase) {
  return {
    LOBBY: 'Lobby',
    ROLE_REVEAL: 'Assigning Roles',
    CHALLENGE_ASK: 'Challenge',
    CHALLENGE_REVEAL: 'Answer Revealed',
    ROUND_TABLE: 'Round Table',
    VOTING: 'Voting',
    BANISH_REVEAL: 'Banishment',
    MURDER_CHOICE: 'Night Phase',
    MURDER_REVEAL: 'Murder Revealed',
    GAME_OVER: 'Game Over',
  }[phase] || phase;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function render(state) {
  setError('');
  if (state.phase === 'LOBBY') {
    renderLobby(state);
  } else {
    renderGame(state);
  }
}

socket.on('state:host', render);
socket.on('connect', () => {
  if (code && hostSecret) {
    socket.emit('host:rejoin', { code, hostSecret }, (res) => {
      if (res.ok) render(res.state);
    });
  }
});

initRoom();
