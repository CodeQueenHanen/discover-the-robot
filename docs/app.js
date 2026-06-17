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
let lastCluePass = null;
let selectedAvatar = null;

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

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
    const passChanged = data.status === 'clue' && data.currentCluePass !== lastCluePass;
    if (data.status !== lastStatus || passChanged) {
      lastStatus = data.status;
      lastCluePass = data.currentCluePass || 1;
      hasSubmittedClue = false;
      hasVoted = false;
      if (passChanged) {
        document.getElementById('clue-input').value = '';
        hideError('clue-error');
      }
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
function validateHomeForm() {
  const nicknameInput = document.getElementById('nickname-input');
  const nickname = nicknameInput.value.trim();
  if (!nickname) {
    nicknameInput.classList.add('input-error');
    nicknameInput.focus();
    setTimeout(() => nicknameInput.classList.remove('input-error'), 600);
    showError('home-error', 'Please enter a nickname first.');
    return null;
  }
  if (!selectedAvatar) {
    showError('home-error', 'Please pick a character first.');
    return null;
  }
  hideError('home-error');
  nicknameInput.classList.remove('input-error');
  return nickname;
}

document.getElementById('btn-create').addEventListener('click', async () => {
  const nickname = validateHomeForm();
  if (!nickname) return;
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

document.getElementById('btn-join-toggle').addEventListener('click', () => {
  hideError('home-error');
  document.getElementById('home-actions').classList.add('hidden');
  document.getElementById('join-panel').classList.remove('hidden');
  document.getElementById('room-code-input').focus();
});

document.getElementById('btn-join-back').addEventListener('click', () => {
  hideError('home-error');
  document.getElementById('join-panel').classList.add('hidden');
  document.getElementById('home-actions').classList.remove('hidden');
});

document.getElementById('btn-join').addEventListener('click', async () => {
  const nickname = validateHomeForm();
  if (!nickname) return;
  const code = document.getElementById('room-code-input').value.trim().toUpperCase();
  if (!code) return showError('home-error', 'Please enter a room code.');
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
  list.innerHTML = data.players.map(p => {
    const isPlayerHost = p.playerId === data.hostPlayerId;
    return `
      <li>
        <div class="player-item">
          <div class="player-avatar">${p.avatar}</div>
          <span>${p.nickname}</span>
          ${isPlayerHost ? '<span class="host-badge">Host</span>' : ''}
        </div>
      </li>`;
  }).join('');

  const btnStart = document.getElementById('btn-start');
  const waitingMsg = document.getElementById('lobby-waiting-msg');
  const needPlayersMsg = document.getElementById('lobby-need-players-msg');
  const enoughPlayers = data.players.length >= 2;

  if (isHost) {
    btnStart.classList.remove('hidden');
    waitingMsg.classList.add('hidden');
    btnStart.disabled = !enoughPlayers;
    if (!enoughPlayers) {
      const needed = 2 - data.players.length;
      needPlayersMsg.textContent = `Need ${needed} more player${needed > 1 ? 's' : ''} to start`;
      needPlayersMsg.classList.remove('hidden');
    } else {
      needPlayersMsg.classList.add('hidden');
    }
  } else {
    btnStart.classList.add('hidden');
    waitingMsg.classList.remove('hidden');
    needPlayersMsg.classList.add('hidden');
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
        <div class="robot-category">Category<strong>${data.currentCategory}</strong></div>
      </div>`;
  } else {
    wordDisplay.innerHTML = `
      <div class="word-reveal">
        <div class="label">The secret word is</div>
        <strong>${data.currentWord}</strong>
        <div class="category">${data.currentCategory}</div>
      </div>`;
  }

  const clueOrder = data.clueOrder || [];
  const currentPass = data.currentCluePass || 1;
  const currentIdx = data.currentClueIndex ?? 0;
  const currentTurnPlayerId = clueOrder[currentIdx];
  const isMyTurn = currentTurnPlayerId === playerId;
  const myPlayer = data.players.find(p => p.playerId === playerId);

  const hasSubmittedCurrentPass = currentPass === 1
    ? (myPlayer?.hasSubmittedClue || false)
    : (myPlayer?.hasSubmittedClue2 || false);
  hasSubmittedClue = hasSubmittedCurrentPass;

  const clueForm = document.getElementById('clue-form');
  const statusMsg = document.getElementById('clue-submitted-msg');

  if (hasSubmittedCurrentPass) {
    clueForm.classList.add('hidden');
    statusMsg.classList.remove('hidden');
    statusMsg.innerHTML = `Clue submitted! Waiting for others<span class="loading-dots"><span></span><span></span><span></span></span>`;
  } else if (isMyTurn) {
    clueForm.classList.remove('hidden');
    statusMsg.classList.add('hidden');
  } else {
    const currentPlayer = data.players.find(p => p.playerId === currentTurnPlayerId);
    clueForm.classList.add('hidden');
    statusMsg.classList.remove('hidden');
    statusMsg.innerHTML = `Waiting for ${currentPlayer?.nickname || 'a player'}<span class="loading-dots"><span></span><span></span><span></span></span>`;
  }

  const statusList = document.getElementById('clue-status-list');
  let html = '';

  [1, 2].forEach(pass => {
    html += `<li class="pass-divider">Pass ${pass}</li>`;
    clueOrder.forEach((pid, i) => {
      const player = data.players.find(p => p.playerId === pid);
      if (!player) return;
      const globalIndex = (pass - 1) * clueOrder.length + i + 1;
      const isDone = pass < currentPass || (pass === currentPass && i < currentIdx);
      const isCurrent = pass === currentPass && i === currentIdx;
      const isYou = pid === playerId;
      const submittedClue = pass === 1 ? player.clue : player.clue2;
      let label;
      if (isDone) label = `<span class="clue-badge">clue submitted:</span>${submittedClue || ''}`;
      else if (isCurrent) label = isYou ? 'Your turn!' : 'Thinking...';
      else label = 'Up next...';
      html += `
        <li class="turn-item ${isDone ? 'done' : ''} ${isCurrent ? 'current' : ''}">
          <div class="player-item">
            <span class="turn-ordinal">${ordinal(globalIndex)}</span>
            <div class="player-avatar">${player.avatar}</div>
            <span>${player.nickname}${isYou ? ' (you)' : ''}</span>
          </div>
          <span class="turn-clue">${label}</span>
        </li>`;
    });
  });

  statusList.innerHTML = html;
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
        <div class="clue-words">
          <span class="clue-word">${p.clue || '—'}</span>
          ${p.clue2 ? `<span class="clue-separator">·</span><span class="clue-word">${p.clue2}</span>` : ''}
        </div>
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

// ── Leave Room ─────────────────────────────────────────────────────────────
document.getElementById('btn-leave-room').addEventListener('click', () => {
  stopPolling();
  roomCode = null;
  playerId = null;
  isHost = false;
  hasSubmittedClue = false;
  hasVoted = false;
  lastStatus = null;
  lastCluePass = null;
  showScreen('screen-home');
  document.getElementById('home-actions').classList.add('hidden');
  document.getElementById('join-panel').classList.remove('hidden');
  document.getElementById('room-code-input').focus();
});

// ── Auto-focus nickname on load ────────────────────────────────────────────
document.getElementById('nickname-input').focus();
