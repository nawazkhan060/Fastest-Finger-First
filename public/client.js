const socket = io();

// Parse query params
const urlParams = new URLSearchParams(window.location.search);
const playerName = urlParams.get('name');
const gameCode = urlParams.get('code');

// Game state variables
let selectedSequence = [null, null, null, null];
let rawOptions = [];
let questionStartTime = null;
let timerInterval = null;
let questionDuration = 15;

// DOM Elements
const profileName = document.getElementById('player-profile-name');
const profileCode = document.getElementById('player-profile-code');

const screenLobby = document.getElementById('screen-lobby');
const screenActive = document.getElementById('screen-active');
const screenWaiting = document.getElementById('screen-waiting');
const screenResults = document.getElementById('screen-results');

const lobbyPlayersGrid = document.getElementById('lobby-players-grid');
const playerQuestionText = document.getElementById('player-question-text');
const optionsGrid = document.getElementById('options-grid');
const btnSubmitAnswer = document.getElementById('btn-submit-answer');
const playerTimerDisplay = document.getElementById('player-timer-display');
const playerTimerBar = document.getElementById('player-timer-bar');

const lockedTimeDisplay = document.getElementById('locked-time-display');
const waitingSubmittedSeq = document.getElementById('waiting-submitted-seq');

const playerCorrectSequence = document.getElementById('player-correct-sequence');

// Initial validation
if (!playerName || !gameCode) {
  alert('Invalid session. Please login again.');
  window.location.href = '/';
} else {
  profileName.textContent = playerName;
  profileCode.textContent = gameCode;
  
  // Join the room
  socket.emit('player:join', { code: gameCode, name: playerName });
}

// Join confirmation
socket.on('join:success', ({ code, name, players }) => {
  console.log(`Successfully joined game ${code} as ${name}`);
});

socket.on('join:failed', (errorMsg) => {
  alert(errorMsg);
  window.location.href = '/';
});

// Sync joined players
socket.on('game:lobby-update', ({ players }) => {
  renderLobbyPlayers(players);
});

function renderLobbyPlayers(players) {
  lobbyPlayersGrid.innerHTML = '';
  // Show up to 7 slots
  for (let i = 0; i < 7; i++) {
    const slot = document.createElement('div');
    if (i < players.length) {
      const p = players[i];
      slot.className = 'player-slot active';
      if (p.id === socket.id) slot.style.borderColor = 'var(--color-cyan)';
      slot.innerHTML = `
        <span class="player-avatar">⚡</span>
        <span class="player-name">${p.name}</span>
      `;
    } else {
      slot.className = 'player-slot empty';
      slot.innerHTML = `
        <span class="player-avatar">👤</span>
        <span class="player-name">Slot ${i + 1}</span>
      `;
    }
    lobbyPlayersGrid.appendChild(slot);
  }
}

// Question starts
socket.on('game:question-started', ({ text, items, duration }) => {
  // Switch screens
  screenLobby.style.display = 'none';
  screenActive.style.display = 'block';
  screenWaiting.style.display = 'none';
  screenResults.style.display = 'none';

  playerQuestionText.textContent = text;
  rawOptions = [...items];
  selectedSequence = [null, null, null, null];
  
  renderWorkspace();
  startTimer(duration);
});

// Render workspace interface
function renderWorkspace() {
  // Render empty sequence slots
  for (let i = 0; i < 4; i++) {
    const slot = document.getElementById(`slot-btn-${i}`);
    slot.innerHTML = '';
    slot.className = 'sequence-slot';
    
    if (selectedSequence[i]) {
      slot.textContent = selectedSequence[i];
      slot.classList.add('filled');
      
      // Click a filled slot to remove it
      slot.onclick = () => removeOptionFromSequence(i);
    } else {
      slot.onclick = null;
    }
  }

  // Render raw options grid
  optionsGrid.innerHTML = '';
  rawOptions.forEach(option => {
    const card = document.createElement('div');
    card.className = 'option-card';
    card.textContent = option;

    const selectIdx = selectedSequence.indexOf(option);
    if (selectIdx !== -1) {
      card.classList.add('selected');
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = selectIdx + 1;
      card.appendChild(badge);
    } else {
      card.onclick = () => addOptionToSequence(option);
    }

    optionsGrid.appendChild(card);
  });

  // Enable submit button only if all 4 slots are filled
  const isComplete = selectedSequence.every(item => item !== null);
  btnSubmitAnswer.disabled = !isComplete;
}

function addOptionToSequence(option) {
  const firstEmptyIdx = selectedSequence.indexOf(null);
  if (firstEmptyIdx !== -1) {
    selectedSequence[firstEmptyIdx] = option;
    renderWorkspace();
  }
}

function removeOptionFromSequence(index) {
  selectedSequence[index] = null;
  // Shift remaining elements left to maintain solid fill
  // e.g. if we remove index 1 from [A, B, C, null], it becomes [A, null, C, null] -> shift to [A, C, null, null]
  selectedSequence = selectedSequence.filter(item => item !== null);
  while (selectedSequence.length < 4) {
    selectedSequence.push(null);
  }
  renderWorkspace();
}

// Timer mechanics
function startTimer(duration) {
  if (timerInterval) clearInterval(timerInterval);
  
  questionDuration = duration;
  questionStartTime = Date.now();
  
  const totalMs = duration * 1000;
  
  timerInterval = setInterval(() => {
    const elapsed = Date.now() - questionStartTime;
    const remaining = Math.max(0, totalMs - elapsed);
    const remainingSecs = (remaining / 1000).toFixed(2);
    
    playerTimerDisplay.textContent = `${remainingSecs}s`;
    playerTimerBar.style.width = `${(remaining / totalMs) * 100}%`;
    
    if (remaining < 10000) {
      playerTimerDisplay.classList.add('warning');
      playerTimerBar.classList.add('warning');
    } else {
      playerTimerDisplay.classList.remove('warning');
      playerTimerBar.classList.remove('warning');
    }
    
    if (remaining <= 0) {
      clearInterval(timerInterval);
    }
  }, 50);
}

// Submit answer
btnSubmitAnswer.addEventListener('click', () => {
  if (selectedSequence.includes(null)) return;
  
  if (timerInterval) clearInterval(timerInterval);
  
  const timeTaken = Date.now() - questionStartTime;
  
  // Emit to server
  socket.emit('player:submit', { code: gameCode, order: selectedSequence });

  // Update waiting screen
  lockedTimeDisplay.textContent = `${(timeTaken / 1000).toFixed(3)}s`;
  
  waitingSubmittedSeq.innerHTML = '';
  selectedSequence.forEach((item, index) => {
    const span = document.createElement('span');
    span.textContent = item;
    waitingSubmittedSeq.appendChild(span);
    
    if (index < selectedSequence.length - 1) {
      const arrow = document.createElement('span');
      arrow.className = 'arrow';
      arrow.innerHTML = ' → ';
      waitingSubmittedSeq.appendChild(arrow);
    }
  });

  // Switch to waiting screen
  screenActive.style.display = 'none';
  screenWaiting.style.display = 'block';
});

// Question ended - Timing reveal
socket.on('game:question-ended', ({ leaderboard, correctOrder }) => {
  if (timerInterval) clearInterval(timerInterval);

  screenLobby.style.display = 'none';
  screenActive.style.display = 'none';
  screenWaiting.style.display = 'none';
  screenResults.style.display = 'block';

  // Personal feedback check
  const myRecord = leaderboard.find(p => p.id === socket.id);
  const personalTimeDisplay = document.getElementById('personal-time-display');
  
  if (myRecord) {
    if (myRecord.noSubmission) {
      personalTimeDisplay.textContent = 'No Answer';
      personalTimeDisplay.style.color = 'var(--color-red)';
    } else {
      personalTimeDisplay.textContent = `${(myRecord.timeTaken / 1000).toFixed(2)}s`;
      personalTimeDisplay.style.color = 'var(--color-gold)';
    }
  }

  // Display correct sequence
  playerCorrectSequence.innerHTML = '';
  correctOrder.forEach((item, index) => {
    const span = document.createElement('span');
    span.textContent = item;
    playerCorrectSequence.appendChild(span);
    
    if (index < correctOrder.length - 1) {
      const arrow = document.createElement('span');
      arrow.className = 'arrow';
      arrow.innerHTML = ' → ';
      playerCorrectSequence.appendChild(arrow);
    }
  });
});

// Lobby reset for next question
socket.on('game:lobby-reset', ({ players }) => {
  screenLobby.style.display = 'block';
  screenActive.style.display = 'none';
  screenWaiting.style.display = 'none';
  screenResults.style.display = 'none';

  renderLobbyPlayers(players);
});

socket.on('game:host-disconnected', () => {
  alert('Host disconnected. Game ended.');
  window.location.href = '/';
});
