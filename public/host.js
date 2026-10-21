const socket = io();

let gameCode = null;
let selectedQuestionId = null;
let currentPlayers = [];
let timerInterval = null;
let questionDuration = 15; // 15 seconds
let questionStartTime = null;

// DOM Elements
const gameCodeDisplay = document.getElementById('game-code-display');
const btnStartGame = document.getElementById('btn-start-game');
const btnEndQuestion = document.getElementById('btn-end-question');
const btnNextRound = document.getElementById('btn-next-round');

const stateLobby = document.getElementById('state-lobby');
const stateActive = document.getElementById('state-active');
const stateResults = document.getElementById('state-results');

const activeQuestionText = document.getElementById('active-question-text');
const timerDisplay = document.getElementById('timer-display');
const timerBar = document.getElementById('timer-bar');
const activePlayersStatus = document.getElementById('active-players-status');

const correctSequenceDisplay = document.getElementById('correct-sequence-display');
const leaderboardList = document.getElementById('leaderboard-list');
const playerCountDisplay = document.getElementById('player-count');

// Modal Elements
const btnAddCustom = document.getElementById('btn-add-custom');
const customModal = document.getElementById('custom-modal');
const modalClose = document.getElementById('modal-close');
const btnSaveCustom = document.getElementById('btn-save-custom');

// Initialize Host
socket.emit('host:create');

socket.on('host:created', ({ code }) => {
  gameCode = code;
  gameCodeDisplay.textContent = code;
  loadQuestions();
});

// Load Questions from Server API
async function loadQuestions() {
  try {
    const res = await fetch('/api/questions');
    const questions = await res.json();
    renderQuestionsList(questions);
  } catch (err) {
    console.error('Failed to load questions:', err);
  }
}

// Render Questions List in Sidebar
function renderQuestionsList(questions) {
  const container = document.getElementById('questions-list');
  container.innerHTML = '';
  
  if (questions.length === 0) {
    container.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 20px;">No questions found.</p>';
    return;
  }

  questions.forEach(q => {
    const btn = document.createElement('button');
    btn.className = 'question-item-btn';
    btn.dataset.id = q.id;
    btn.innerHTML = `
      <strong>${q.text}</strong>
      <div style="font-size: 12px; color: var(--text-secondary); margin-top: 5px;">
        Items: ${q.items.join(', ')}
      </div>
    `;
    btn.addEventListener('click', () => {
      // Toggle selection
      document.querySelectorAll('.question-item-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedQuestionId = q.id;
      
      // Update preview
      document.getElementById('selected-question-preview').style.display = 'block';
      document.getElementById('preview-text').textContent = q.text;
      document.getElementById('preview-order').textContent = q.correctOrder.join(' → ');
      
      // Enable launch button if we have players
      checkLaunchButtonStatus();
    });
    container.appendChild(btn);
  });
}

function checkLaunchButtonStatus() {
  const statusPill = document.getElementById('lobby-status-pill');
  if (currentPlayers.length < 8) {
    btnStartGame.disabled = true;
    btnStartGame.classList.remove('pulse-glow');
    const remaining = 8 - currentPlayers.length;
    btnStartGame.textContent = `Waiting for ${remaining} More Player${remaining > 1 ? 's' : ''} (${currentPlayers.length}/8)`;
    if (statusPill) {
      statusPill.className = 'status-pill status-waiting';
      statusPill.textContent = `${currentPlayers.length}/8 Connected`;
    }
  } else {
    if (statusPill) {
      statusPill.className = 'status-pill status-ready';
      statusPill.textContent = 'All 8 Players Connected!';
    }
    if (!selectedQuestionId) {
      btnStartGame.disabled = true;
      btnStartGame.classList.remove('pulse-glow');
      btnStartGame.textContent = 'Select a Question to Launch';
    } else {
      btnStartGame.disabled = false;
      btnStartGame.classList.add('pulse-glow');
      btnStartGame.textContent = 'Launch Question (All 8 Ready)';
    }
  }
}

// Lobby player slot updates
socket.on('game:lobby-update', ({ players }) => {
  currentPlayers = players;
  playerCountDisplay.textContent = players.length;
  updatePlayersGrid(players);
  checkLaunchButtonStatus();
});

function updatePlayersGrid(players) {
  // Clear and reset slots up to 8
  for (let i = 0; i < 8; i++) {
    const slot = document.getElementById(`slot-${i}`);
    if (!slot) continue;
    if (i < players.length) {
      const p = players[i];
      slot.className = 'player-slot active';
      if (p.answered) slot.classList.add('answered');
      slot.querySelector('.player-avatar').textContent = p.name ? p.name.charAt(0).toUpperCase() : `${i + 1}`;
      slot.querySelector('.player-name').textContent = p.name;
    } else {
      slot.className = 'player-slot empty';
      slot.querySelector('.player-avatar').textContent = `${i + 1}`;
      slot.querySelector('.player-name').textContent = `Slot ${i + 1}`;
    }
  }
}

// Host Launching a Question
btnStartGame.addEventListener('click', () => {
  if (!gameCode || !selectedQuestionId) return;
  socket.emit('host:start-question', { code: gameCode, questionId: selectedQuestionId });
});

// Question started by Server
socket.on('game:question-started', ({ text, items, duration }) => {
  // Hide lobby, show active layout
  stateLobby.style.display = 'none';
  stateActive.style.display = 'block';
  stateResults.style.display = 'none';

  activeQuestionText.textContent = text;
  
  // Reset and build active player status tracker
  activePlayersStatus.innerHTML = '';
  currentPlayers.forEach(p => {
    const div = document.createElement('div');
    div.className = 'player-slot active';
    div.id = `active-p-${p.id}`;
    div.innerHTML = `
      <span class="player-avatar">${p.name ? p.name.charAt(0).toUpperCase() : 'P'}</span>
      <span class="player-name">${p.name}</span>
    `;
    activePlayersStatus.appendChild(div);
  });

  // Start visual timer
  startTimer(duration);
});

// A player answered during play
socket.on('game:player-answered', ({ playerId }) => {
  const slot = document.getElementById(`active-p-${playerId}`);
  if (slot) {
    slot.classList.add('answered');
  }
});

// Timer utility
function startTimer(duration) {
  if (timerInterval) clearInterval(timerInterval);
  
  questionDuration = duration;
  questionStartTime = Date.now();
  
  const totalMs = duration * 1000;
  
  timerInterval = setInterval(() => {
    const elapsed = Date.now() - questionStartTime;
    const remaining = Math.max(0, totalMs - elapsed);
    const remainingSecs = (remaining / 1000).toFixed(2);
    
    timerDisplay.textContent = `${remainingSecs}s`;
    timerBar.style.width = `${(remaining / totalMs) * 100}%`;
    
    if (remaining < 10000) {
      timerDisplay.classList.add('warning');
      timerBar.classList.add('warning');
    } else {
      timerDisplay.classList.remove('warning');
      timerBar.classList.remove('warning');
    }
    
    if (remaining <= 0) {
      clearInterval(timerInterval);
      // Auto-end when timer hits 0
      triggerEndQuestion();
    }
  }, 50);
}

// When all players submit, backend lets us know
socket.on('host:all-submitted', () => {
  console.log('All players have submitted. Host can end now.');
  // Flash the end button to draw attention
  btnEndQuestion.classList.add('pulse-glow');
});

// End Question Trigger
btnEndQuestion.addEventListener('click', () => {
  triggerEndQuestion();
});

function triggerEndQuestion() {
  if (timerInterval) clearInterval(timerInterval);
  socket.emit('host:end-question', { code: gameCode });
}

// Question Ended (Results arrive)
socket.on('game:question-ended', ({ leaderboard, correctOrder }) => {
  // Hide active, show results
  stateLobby.style.display = 'none';
  stateActive.style.display = 'none';
  stateResults.style.display = 'block';

  // Display correct sequence
  correctSequenceDisplay.innerHTML = '';
  correctOrder.forEach((item, index) => {
    const span = document.createElement('span');
    span.textContent = item;
    correctSequenceDisplay.appendChild(span);
    
    if (index < correctOrder.length - 1) {
      const arrow = document.createElement('span');
      arrow.className = 'arrow';
      arrow.innerHTML = ' → ';
      correctSequenceDisplay.appendChild(arrow);
    }
  });

  // Display leaderboard
  leaderboardList.innerHTML = '';
  leaderboard.forEach((player, index) => {
    const item = document.createElement('div');
    item.className = `leaderboard-item ${player.correct ? 'correct' : 'incorrect'}`;
    
    const rankClass = index < 3 ? `rank-${index + 1}` : '';
    const badgeHtml = index === 0 ? '<span class="winner-badge">Winner</span>' : '';
    
    let timeText = '';
    if (player.noSubmission) {
      timeText = 'No Answer';
    } else {
      timeText = `${(player.timeTaken / 1000).toFixed(2)}s`;
      if (!player.correct) {
        timeText += ' (Wrong)';
      }
    }

    item.innerHTML = `
      <div class="rank ${rankClass}">${index + 1}</div>
      <div class="item-name">
        <div>${player.name} ${badgeHtml}</div>
        <div class="item-order">${player.orderStr}</div>
      </div>
      <div class="item-meta">
        <span class="time-badge">${timeText}</span>
      </div>
    `;
    leaderboardList.appendChild(item);
  });
});

// Next Round Setup
btnNextRound.addEventListener('click', () => {
  socket.emit('host:next-question-ready', { code: gameCode });
});

// Reset to lobby state on server confirmation
socket.on('game:lobby-reset', ({ players }) => {
  stateLobby.style.display = 'block';
  stateActive.style.display = 'none';
  stateResults.style.display = 'none';
  
  // Clear selected question so host chooses again
  selectedQuestionId = null;
  document.querySelectorAll('.question-item-btn').forEach(b => b.classList.remove('selected'));
  document.getElementById('selected-question-preview').style.display = 'none';
  btnStartGame.disabled = true;
  
  currentPlayers = players;
  updatePlayersGrid(players);
});

// --- Modal for Custom Questions ---
btnAddCustom.addEventListener('click', () => {
  customModal.style.display = 'flex';
});

modalClose.addEventListener('click', () => {
  customModal.style.display = 'none';
});

// Close modal when clicking outside
window.addEventListener('click', (e) => {
  if (e.target === customModal) {
    customModal.style.display = 'none';
  }
});

btnSaveCustom.addEventListener('click', async () => {
  const text = document.getElementById('custom-question-text').value.trim();
  const inputs = document.querySelectorAll('.custom-item-input');
  
  const items = [];
  let valid = true;
  inputs.forEach(input => {
    const val = input.value.trim();
    if (!val) valid = false;
    items.push(val);
  });

  if (!text || !valid) {
    alert('Please fill out the question text and all 4 item options.');
    return;
  }

  // The correct order is what the host defined in inputs (Item 1, 2, 3, 4)
  const correctOrder = [...items];

  try {
    const res = await fetch('/api/questions/custom', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text,
        items,
        correctOrder
      })
    });
    
    const result = await res.json();
    if (result.success) {
      customModal.style.display = 'none';
      // Clear inputs
      document.getElementById('custom-question-text').value = '';
      inputs.forEach(input => input.value = '');
      // Reload question bank
      await loadQuestions();
    } else {
      alert('Error saving custom question: ' + result.error);
    }
  } catch (err) {
    alert('Server communication error.');
  }
});

socket.on('error', (err) => {
  alert(err);
});

socket.on('game:host-disconnected', () => {
  alert('Host session lost. Please reload the page.');
  window.location.reload();
});
