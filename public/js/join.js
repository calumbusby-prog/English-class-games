const socket = io();

const el = (id) => document.getElementById(id);
const errorBox = el('error');

let code = null;
let playerId = null;
let token = null;
let lastState = null;
let tickHandle = null;

function setError(msg) {
  errorBox.textContent = msg || '';
}

function saveSession() {
  localStorage.setItem('traitors_player', JSON.stringify({ code, playerId, token }));
}

function clearSession() {
  localStorage.removeItem('traitors_player');
}

const VIEWS = ['join', 'waiting', 'role', 'question', 'genericWait', 'roundtable', 'voting', 'murder', 'eliminated', 'over'];

function showView(name) {
  VIEWS.forEach((v) => {
    el(`view-${v}`).style.display = v === name ? '' : 'none';
  });
}

function startTicker() {
  if (tickHandle) return;
  tickHandle = setInterval(renderTimer, 250);
}

function renderTimer() {
  const text = lastState && lastState.deadline
    ? `<div class="big-timer">${Math.max(0, Math.round((lastState.deadline - Date.now()) / 1000))}</div>`
    : '';
  ['timerBox', 'timerBox2', 'timerBox3', 'timerBox4'].forEach((id) => {
    const node = el(id);
    if (node) node.innerHTML = text;
  });
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

el('joinBtn').addEventListener('click', doJoin);
el('joinCode').addEventListener('keydown', (e) => e.key === 'Enter' && el('joinName').focus());
el('joinName').addEventListener('keydown', (e) => e.key === 'Enter' && doJoin());

function doJoin() {
  const c = el('joinCode').value.trim().toUpperCase();
  const name = el('joinName').value.trim();
  if (!c || c.length !== 4) return setError('Enter the 4-letter room code.');
  if (!name) return setError('Enter your name.');
  setError('');
  socket.emit('player:join', { code: c, name }, (res) => {
    if (!res.ok) return setError(res.error);
    code = res.code;
    playerId = res.playerId;
    token = res.token;
    saveSession();
    showView('waiting');
    el('waitName').textContent = name;
  });
}

function tryRejoin() {
  const saved = JSON.parse(localStorage.getItem('traitors_player') || 'null');
  if (!saved) return showView('join');
  socket.emit('player:rejoin', saved, (res) => {
    if (res.ok) {
      code = saved.code;
      playerId = saved.playerId;
      token = saved.token;
      render(res.state);
    } else {
      clearSession();
      showView('join');
    }
  });
}

socket.on('connect', () => {
  if (code && token) {
    socket.emit('player:rejoin', { code, playerId, token }, (res) => {
      if (res.ok) render(res.state);
    });
  }
});

socket.on('kicked', () => {
  clearSession();
  code = playerId = token = null;
  setError('You were removed from the game by the host.');
  showView('join');
});

function renderHud(state) {
  const hud = el('hud');
  if (!state.me.role) {
    hud.style.display = 'none';
    return;
  }
  hud.style.display = '';
  el('myScore').textContent = state.me.score;
  el('potHud').textContent = state.pot;
  const rolePill = el('myRolePill');
  rolePill.style.display = '';
  rolePill.textContent = state.me.role === 'traitor' ? 'Traitor' : 'Faithful';
  rolePill.className = `pill role-${state.me.role}`;
}

function renderRole(state) {
  showView('role');
  const card = el('roleCard');
  const isTraitor = state.me.role === 'traitor';
  card.className = `card role-reveal-card ${isTraitor ? 'traitor' : 'faithful'}`;
  el('roleName').textContent = isTraitor ? 'Traitor' : 'Faithful';
  el('roleDesc').textContent = isTraitor
    ? 'Blend in, answer questions to build trust, and secretly work with your fellow traitors to eliminate the Faithful.'
    : 'Answer questions correctly, watch carefully, and work with the group to identify and banish the Traitors.';
  const ft = el('fellowTraitors');
  if (isTraitor && state.fellowTraitors.length > 0) {
    ft.innerHTML = `<p class="muted">Your fellow traitors:</p><p><strong>${state.fellowTraitors.map((p) => escapeHtml(p.name)).join(', ')}</strong></p>`;
  } else {
    ft.innerHTML = '';
  }
}

function renderQuestion(state) {
  showView('question');
  const q = state.question;
  el('qText').textContent = q.text;
  const answered = q.myAnswer !== null && q.myAnswer !== undefined;
  el('qChoices').innerHTML = q.choices
    .map((c, i) => {
      let cls = 'choice-btn';
      if (q.revealed) {
        if (i === q.correctIndex) cls += ' correct';
        else if (i === q.myAnswer) cls += ' incorrect';
      } else if (i === q.myAnswer) {
        cls += ' selected';
      }
      return `<button class="${cls}" data-i="${i}" ${answered || q.revealed ? 'disabled' : ''}>${escapeHtml(c)}</button>`;
    })
    .join('');
  if (!answered && !q.revealed) {
    el('qChoices').querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        socket.emit('player:answer', { code, playerId, token, choiceIndex: Number(btn.dataset.i) }, () => {});
      });
    });
  }
}

function renderVoting(state) {
  showView('voting');
  const others = state.votableAlive.filter((p) => p.id !== state.me.id);
  el('voteList').innerHTML = others
    .map((p) => `<button class="choice-btn block ${state.myVote === p.id ? 'selected' : ''}" data-id="${p.id}" style="margin-bottom:8px" ${state.myVote ? 'disabled' : ''}>${escapeHtml(p.name)}</button>`)
    .join('') || '<p class="muted center">No one left to vote for.</p>';
  if (!state.myVote) {
    el('voteList').querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        socket.emit('player:vote', { code, playerId, token, targetId: btn.dataset.id }, () => {});
      });
    });
  }
}

function renderMurder(state) {
  if (state.me.role !== 'traitor') {
    showView('genericWait');
    el('waitIcon').textContent = '🔪';
    el('waitTitle').textContent = 'It is night...';
    el('waitSub').textContent = 'The traitors are secretly choosing a victim.';
    return;
  }
  showView('murder');
  el('murderList').innerHTML = state.faithfulAlive
    .map((p) => `<button class="choice-btn block ${state.myMurderChoice === p.id ? 'selected' : ''}" data-id="${p.id}" style="margin-bottom:8px" ${state.myMurderChoice ? 'disabled' : ''}>${escapeHtml(p.name)}</button>`)
    .join('') || '<p class="muted center">No targets remain.</p>';
  if (!state.myMurderChoice) {
    el('murderList').querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        socket.emit('player:murderChoice', { code, playerId, token, targetId: btn.dataset.id }, () => {});
      });
    });
  }
}

function renderGenericWait(title, sub, icon) {
  showView('genericWait');
  el('waitIcon').textContent = icon || '⏳';
  el('waitTitle').textContent = title;
  el('waitSub').textContent = sub || '';
}

function renderEliminated(state) {
  showView('eliminated');
  el('elimTitle').textContent = state.me.eliminatedBy === 'murdered' ? 'You were murdered in the night' : 'You have been banished';
}

function renderOver(state) {
  showView('over');
  el('winnerTitle').textContent = state.winner === 'faithful' ? '🏆 The Faithful Win!' : '🗡️ The Traitors Win!';
}

function render(state) {
  lastState = state;
  setError('');
  renderHud(state);
  renderTimer();
  startTicker();

  if (state.phase === 'GAME_OVER') return renderOver(state);
  if (!state.me.alive) return renderEliminated(state);

  switch (state.phase) {
    case 'LOBBY':
      showView('waiting');
      el('waitName').textContent = state.me.name;
      break;
    case 'ROLE_REVEAL':
      renderRole(state);
      break;
    case 'CHALLENGE_ASK':
    case 'CHALLENGE_REVEAL':
      renderQuestion(state);
      break;
    case 'ROUND_TABLE':
      showView('roundtable');
      break;
    case 'VOTING':
      renderVoting(state);
      break;
    case 'BANISH_REVEAL': {
      const b = state.lastBanished;
      renderGenericWait(
        b ? `${b.name} has been banished` : 'No one was banished',
        b ? `They were ${b.role === 'traitor' ? 'a Traitor' : 'Faithful'}.` : '',
        '🕯️'
      );
      break;
    }
    case 'MURDER_CHOICE':
      renderMurder(state);
      break;
    case 'MURDER_REVEAL': {
      const m = state.lastMurdered;
      renderGenericWait(
        m ? `${m.name} was murdered in the night` : 'No one was murdered',
        m ? `They were ${m.role === 'traitor' ? 'a Traitor' : 'Faithful'}.` : '',
        '🔪'
      );
      break;
    }
    default:
      renderGenericWait('Please wait...', '');
  }
}

socket.on('state:player', render);

tryRejoin();
