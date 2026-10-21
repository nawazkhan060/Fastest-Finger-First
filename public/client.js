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
const lobbyCountPill = document.getElementById('lobby-count-pill');
const lobbyProgressFill = document.getElementById('lobby-progress-fill');
const lobbyStatusMessage = document.getElementById('lobby-status-message');
const lobbySlotsRemaining = document.getElementById('lobby-slots-remaining');

const playerQuestionText = document.getElementById('player-question-text');
const optionsGrid = document.getElementById('options-grid');
const btnSubmitAnswer = document.getElementById('btn-submit-answer');
const btnClearSequence = document.getElementById('btn-clear-sequence');
const playerTimerDisplay = document.getElementById('player-timer-display');
const playerTimerBar = document.getElementById('player-timer-bar');

const lockedTimeDisplay = document.getElementById('locked-time-display');
const waitingSubmittedSeq = document.getElementById('waiting-submitted-seq');

const playerCorrectSequence = document.getElementById('player-correct-sequence');
const personalTimeDisplay = document.getElementById('personal-time-display');
const personalStatusTag = document.getElementById('personal-status-tag');

const STEP_LABELS = ['1st', '2nd', '3rd', '4th'];
const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

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
  const count = players.length;
  const remaining = Math.max(0, 8 - count);
  
  if (lobbyCountPill) {
    lobbyCountPill.textContent = `${count}/8 Connected`;
    lobbyCountPill.className = count >= 8 ? 'status-pill status-ready' : 'status-pill status-waiting';
  }
  
  if (lobbyProgressFill) {
    lobbyProgressFill.style.width = `${(count / 8) * 100}%`;
  }
  
  if (lobbySlotsRemaining) {
    lobbySlotsRemaining.textContent = remaining === 0 
      ? 'All spots filled! Ready' 
      : `${remaining} spot${remaining > 1 ? 's' : ''} remaining`;
  }

  if (lobbyStatusMessage) {
    if (count < 8) {
      lobbyStatusMessage.textContent = `Waiting for ${remaining} more player${remaining > 1 ? 's' : ''} to connect. The game will only start once all 8 seats are filled!`;
    } else {
      lobbyStatusMessage.textContent = 'All 8 players are connected! Get ready, the host can launch the question at any moment!';
    }
  }

  lobbyPlayersGrid.innerHTML = '';
  // Show up to 8 slots
  for (let i = 0; i < 8; i++) {
    const slot = document.createElement('div');
    if (i < players.length) {
      const p = players[i];
      const isMe = p.id === socket.id;
      slot.className = `player-slot active ${isMe ? 'is-current-user' : ''}`;
      
      const initial = p.name ? p.name.charAt(0).toUpperCase() : `${i + 1}`;
      slot.innerHTML = `
        <span class="player-avatar">${initial}</span>
        <span class="player-name">${escapeHtml(p.name)}</span>
        ${isMe ? '<span class="you-badge">YOU</span>' : ''}
      `;
    } else {
      slot.className = 'player-slot empty';
      slot.innerHTML = `
        <span class="player-avatar">${i + 1}</span>
        <span class="player-name">Slot ${i + 1}</span>
      `;
    }
    lobbyPlayersGrid.appendChild(slot);
  }
}

// Clear Sequence button listener
if (btnClearSequence) {
  btnClearSequence.addEventListener('click', () => {
    selectedSequence = [null, null, null, null];
    renderWorkspace();
  });
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
  const filledCount = selectedSequence.filter(item => item !== null).length;

  // Render sequence slots
  for (let i = 0; i < 4; i++) {
    const slot = document.getElementById(`slot-btn-${i}`);
    if (!slot) continue;
    
    const value = selectedSequence[i];
    slot.innerHTML = '';
    
    if (value) {
      slot.className = 'sequence-slot filled';
      slot.innerHTML = `
        <span class="slot-badge">${STEP_LABELS[i]}</span>
        <span class="slot-content">${escapeHtml(value)}</span>
        <span class="slot-remove" title="Remove">&times;</span>
      `;
      slot.onclick = () => removeOptionFromSequence(i);
    } else {
      slot.className = 'sequence-slot';
      slot.innerHTML = `
        <span class="slot-badge">${STEP_LABELS[i]}</span>
        <span class="slot-content empty-hint">Tap item</span>
      `;
      slot.onclick = null;
    }
  }

  // Render raw options grid
  optionsGrid.innerHTML = '';
  rawOptions.forEach((option, idx) => {
    const card = document.createElement('div');
    card.className = 'option-card';

    const letter = OPTION_LETTERS[idx] || `${idx + 1}`;
    const selectIdx = selectedSequence.indexOf(option);
    const isSelected = selectIdx !== -1;

    if (isSelected) {
      card.classList.add('selected');
      card.innerHTML = `
        <span class="option-letter">${letter}</span>
        <span class="option-title">${escapeHtml(option)}</span>
        <span class="badge selected-step-badge">#${selectIdx + 1}</span>
      `;
      // Tapping a selected option allows removing it
      card.onclick = () => removeOptionFromSequence(selectIdx);
    } else {
      card.innerHTML = `
        <span class="option-letter">${letter}</span>
        <span class="option-title">${escapeHtml(option)}</span>
      `;
      card.onclick = () => addOptionToSequence(option);
    }

    optionsGrid.appendChild(card);
  });

  // Enable submit button only if all 4 slots are filled
  const isComplete = filledCount === 4;
  btnSubmitAnswer.disabled = !isComplete;
  
  if (isComplete) {
    btnSubmitAnswer.classList.add('pulse-glow');
    btnSubmitAnswer.textContent = 'LOCK SEQUENCE NOW';
  } else {
    btnSubmitAnswer.classList.remove('pulse-glow');
    btnSubmitAnswer.textContent = `Select 4 items in order (${filledCount}/4)`;
  }
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
  // Shift remaining elements left to maintain continuous sequence
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
    
    if (remaining < 5000) {
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
  
  // Disable button to prevent double submits
  btnSubmitAnswer.disabled = true;

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
      arrow.textContent = ' → ';
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
  
  if (myRecord) {
    if (myRecord.noSubmission) {
      personalTimeDisplay.textContent = 'No Answer';
      personalTimeDisplay.style.color = 'var(--color-red)';
      if (personalStatusTag) {
        personalStatusTag.className = 'status-pill status-incorrect';
        personalStatusTag.textContent = 'Time Expired';
      }
    } else {
      personalTimeDisplay.textContent = `${(myRecord.timeTaken / 1000).toFixed(2)}s`;
      if (myRecord.correct) {
        personalTimeDisplay.style.color = 'var(--color-gold)';
        if (personalStatusTag) {
          personalStatusTag.className = 'status-pill status-ready';
          personalStatusTag.textContent = 'Correct Order!';
        }
      } else {
        personalTimeDisplay.style.color = 'var(--color-red)';
        if (personalStatusTag) {
          personalStatusTag.className = 'status-pill status-incorrect';
          personalStatusTag.textContent = 'Incorrect Order';
        }
      }
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
      arrow.textContent = ' → ';
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

// Utility to escape HTML preventing XSS
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
