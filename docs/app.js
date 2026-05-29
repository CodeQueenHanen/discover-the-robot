const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:7071/api'
  : 'https://discover-the-robot-func.azurewebsites.net/api';

// ── State ──────────────────────────────────────────────────────────────────
let roomCode = null;
let playerId = null;
let isHost = false;
let hasSubmittedClue = false;
let hasVoted = false;
let pollTimer = null;
let lastStatus = null;
let selectedAvatar = '🦊';

// ── Helpers ────────────────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

function showError(elementId, message) {
  const el = document.getElementById(elementId);
  el.textContent = message;
  el.classList.remove('hidden');
}

function hideError(elementId) {
  document.getElementById(elementId).classList.add('hidden');
}

async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

async function apiGet(path) {
  const res = await fetch(`${API_BASE}/${path}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(poll, 2500);
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

// ── Polling ────────────────────────────────────────────────────────────────
async function poll() {
  try {
    const data = await apiGet(`rooms/${roomCode}?playerId=${playerId}`);
    if (data.status !== lastStatus) {
      lastStatus = data.status;
      hasSubmittedClue = false;
      hasVoted = false;
    }
    render(data);
  } catch (e) {
    console.error('Poll error:', e);
  }
}

function render(data) {
  switch (data.status) {
    case 'waiting': renderLobby(data); break;
    case 'clue':    renderClue(data);   break;
    case 'reveal':  renderReveal(data); break;
    case 'vote':    renderVote(data);   break;
    case 'results': renderResults(data); break;
  }
}

// ── Avatar Picker ──────────────────────────────────────────────────────────
document.getElementById('avatar-picker').addEventListener('click', (e) => {
  const btn = e.target.closest('.avatar-option');
  if (!btn) return;
  document.querySelectorAll('.avatar-option').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  selectedAvatar = btn.dataset.avatar;
});

// ── Home ───────────────────────────────────────────────────────────────────
document.getElementById('btn-create').addEventListener('click', async () => {
  const nickname = document.getElementById('nickname-input').value.trim();
  if (!nickname) return showError('home-error', 'Please enter a nickname.');
  hideError('home-error');
  try {
    const data = await apiPost('createRoom', { nickname, avatar: selectedAvatar });
    roomCode = data.roomCode;
    playerId = data.playerId;
    isHost = true;
    startPolling();
    await poll();
  } catch (e) {
    showError('home-error', e.message);
  }
});

document.getElementById('btn-join').addEventListener('click', async () => {
  const nickname = document.getElementById('nickname-input').value.trim();
  const code = document.getElementById('room-code-input').value.trim().toUpperCase();
  if (!nickname) return showError('home-error', 'Please enter a nickname.');
  if (!code) return showError('home-error', 'Please enter a room code.');
  hideError('home-error');
  try {
    const data = await apiPost(`rooms/${code}/join`, { nickname, avatar: selectedAvatar });
    roomCode = code;
    playerId = data.playerId;
    isHost = false;
    startPolling();
    await poll();
  } catch (e) {
    showError('home-error', e.message);
  }
});

// ── Lobby ──────────────────────────────────────────────────────────────────
function renderLobby(data) {
  showScreen('screen-lobby');
  document.getElementById('lobby-room-code').textContent = data.roomCode;

  const list = document.getElementById('lobby-player-list');
  list.innerHTML = data.players.map(p => `
    <li>
      <div class="player-item">
        <div class="player-avatar">${p.avatar}</div>
        <span>${p.nickname}</span>
      </div>
    </li>`).join('');

  const btnStart = document.getElementById('btn-start');
  const waitingMsg = document.getElementById('lobby-waiting-msg');
  if (isHost) {
    btnStart.classList.remove('hidden');
    waitingMsg.classList.add('hidden');
  } else {
    btnStart.classList.add('hidden');
    waitingMsg.classList.remove('hidden');
  }
}

document.getElementById('btn-start').addEventListener('click', async () => {
  try {
    await apiPost(`rooms/${roomCode}/start`, { playerId });
  } catch (e) {
    alert(e.message);
  }
});

// ── Clue ───────────────────────────────────────────────────────────────────
function renderClue(data) {
  showScreen('screen-clue');
  document.getElementById('clue-round').textContent = data.round;

  const wordDisplay = document.getElementById('clue-word-display');
  if (data.isRobot) {
    wordDisplay.innerHTML = `
      <div class="robot-alert">
        <span class="robot-icon">🤖</span>
        <span class="robot-label">You are the Robot!</span>
        <span class="robot-hint">You don't know the word. Blend in.</span>
      </div>`;
  } else {
    wordDisplay.innerHTML = `
      <div class="word-reveal">
        <div class="label">The secret word is</div>
        <strong>${data.currentWord}</strong>
        <div class="category">${data.currentCategory}</div>
      </div>`;
  }

  const myPlayer = data.players.find(p => p.playerId === playerId);
  hasSubmittedClue = myPlayer?.hasSubmittedClue || false;

  document.getElementById('clue-form').classList.toggle('hidden', hasSubmittedClue);
  document.getElementById('clue-submitted-msg').classList.toggle('hidden', !hasSubmittedClue);

  const statusList = document.getElementById('clue-status-list');
  statusList.innerHTML = data.players.map(p => `
    <li>
      <div class="status-item">
        <div class="player-item">
          <div class="player-avatar">${p.avatar}</div>
          <span>${p.nickname}</span>
        </div>
        <div class="status-dot ${p.hasSubmittedClue ? 'done' : ''}"></div>
      </div>
    </li>`).join('');
}

document.getElementById('btn-submit-clue').addEventListener('click', async () => {
  const clue = document.getElementById('clue-input').value.trim();
  if (!clue) return showError('clue-error', 'Please enter a clue.');
  if (clue.split(/\s+/).length > 1) return showError('clue-error', 'Clue must be a single word.');
  hideError('clue-error');
  try {
    await apiPost(`rooms/${roomCode}/clue`, { playerId, clue });
    hasSubmittedClue = true;
    document.getElementById('clue-form').classList.add('hidden');
    document.getElementById('clue-submitted-msg').classList.remove('hidden');
  } catch (e) {
    showError('clue-error', e.message);
  }
});

// ── Reveal ─────────────────────────────────────────────────────────────────
function renderReveal(data) {
  showScreen('screen-reveal');
  document.getElementById('reveal-round').textContent = data.round;

  const list = document.getElementById('reveal-clue-list');
  list.innerHTML = data.players.map(p => `
    <li>
      <div class="clue-item">
        <span class="clue-name">${p.nickname}</span>
        <span class="clue-word">${p.clue || '—'}</span>
      </div>
    </li>`).join('');

  const btnStartVote = document.getElementById('btn-start-vote');
  const waitingMsg = document.getElementById('reveal-waiting-msg');
  if (isHost) {
    btnStartVote.classList.remove('hidden');
    waitingMsg.classList.add('hidden');
  } else {
    btnStartVote.classList.add('hidden');
    waitingMsg.classList.remove('hidden');
  }
}

document.getElementById('btn-start-vote').addEventListener('click', async () => {
  try {
    await apiPost(`rooms/${roomCode}/start-vote`, { playerId });
  } catch (e) {
    alert(e.message);
  }
});

// ── Vote ───────────────────────────────────────────────────────────────────
function renderVote(data) {
  showScreen('screen-vote');
  document.getElementById('vote-round').textContent = data.round;

  const myPlayer = data.players.find(p => p.playerId === playerId);
  hasVoted = myPlayer?.hasVoted || false;

  document.getElementById('vote-submitted-msg').classList.toggle('hidden', !hasVoted);

  const container = document.getElementById('vote-player-list');
  if (hasVoted) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = data.players
    .filter(p => p.playerId !== playerId)
    .map(p => `
      <button class="vote-btn" data-id="${p.playerId}">
        <div class="vote-avatar">${p.avatar}</div>
        ${p.nickname}
      </button>`)
    .join('');

  container.querySelectorAll('.vote-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await apiPost(`rooms/${roomCode}/vote`, { playerId, votedForId: btn.dataset.id });
        hasVoted = true;
        container.innerHTML = '';
        document.getElementById('vote-submitted-msg').classList.remove('hidden');
      } catch (e) {
        alert(e.message);
      }
    });
  });
}

// ── Results ────────────────────────────────────────────────────────────────
function renderResults(data) {
  showScreen('screen-results');
  document.getElementById('results-round').textContent = data.round;

  const banner = document.getElementById('results-outcome-banner');
  banner.className = `outcome-banner ${data.robotCaught ? 'win' : 'loss'}`;
  banner.innerHTML = `
    <span class="outcome-icon">${data.robotCaught ? '🎉' : '🤖'}</span>
    <div class="outcome-text">${data.robotCaught ? 'The group wins!' : 'The Robot wins!'}</div>`;

  const robotPlayer = data.players.find(p => p.playerId === data.robotPlayerId);
  document.getElementById('results-robot-reveal').innerHTML = `
    <div class="reveal-label">The Robot was</div>
    <div class="reveal-value">${robotPlayer ? robotPlayer.nickname : '—'}</div>`;

  document.getElementById('results-word-reveal').innerHTML = `
    <div class="reveal-label">The word was</div>
    <div class="reveal-value">${data.currentWord || '—'}</div>`;

  const voteList = document.getElementById('results-vote-list');
  voteList.innerHTML = data.players.map(p => {
    const votedFor = data.players.find(p2 => p2.playerId === p.vote);
    const isRobot = p.playerId === data.robotPlayerId;
    return `
      <li class="${isRobot ? 'robot-player' : ''}">
        <div class="player-item">
          <div class="player-avatar">${p.avatar}</div>
          <span>${p.nickname}${isRobot ? ' 🤖' : ''} voted for <strong>${votedFor ? votedFor.nickname : '—'}</strong></span>
        </div>
      </li>`;
  }).join('');

  const btnNextRound = document.getElementById('btn-next-round');
  const waitingMsg = document.getElementById('results-waiting-msg');
  if (isHost) {
    btnNextRound.classList.remove('hidden');
    waitingMsg.classList.add('hidden');
  } else {
    btnNextRound.classList.add('hidden');
    waitingMsg.classList.remove('hidden');
  }
}

document.getElementById('btn-next-round').addEventListener('click', async () => {
  try {
    await apiPost(`rooms/${roomCode}/next-round`, { playerId });
  } catch (e) {
    alert(e.message);
  }
});
