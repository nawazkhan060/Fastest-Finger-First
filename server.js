import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'db.json');
const QUESTIONS_FILE = path.join(__dirname, 'questions.json');

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// In-memory games state
const activeGames = {};

// Helper to load/save JSON database
async function readDb() {
  try {
    const data = await fs.readFile(DB_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    // If db.json doesn't exist, return empty template
    return { gamesHistory: [], customQuestions: [] };
  }
}

async function writeDb(data) {
  try {
    await fs.writeFile(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error('Failed to write database:', error);
  }
}

async function loadQuestions() {
  try {
    const defaultData = await fs.readFile(QUESTIONS_FILE, 'utf8');
    const defaultQuestions = JSON.parse(defaultData);
    
    const db = await readDb();
    const customQuestions = db.customQuestions || [];
    
    return [...defaultQuestions, ...customQuestions];
  } catch (error) {
    console.error('Error reading questions:', error);
    return [];
  }
}

// Generate a random 4-letter alphanumeric game code
function generateGameCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excluded similar looking characters like O, I, 1, 0
  let code = '';
  do {
    code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  } while (activeGames[code]); // Ensure unique
  return code;
}

// API Routes
app.get('/api/questions', async (req, res) => {
  const questions = await loadQuestions();
  res.json(questions);
});

app.post('/api/questions/custom', async (req, res) => {
  try {
    const { text, items, correctOrder } = req.body;
    if (!text || !items || !correctOrder || items.length !== 4 || correctOrder.length !== 4) {
      return res.status(400).json({ error: 'Invalid question structure' });
    }
    const db = await readDb();
    const newQuestion = {
      id: 'custom_' + Date.now(),
      text,
      items,
      correctOrder
    };
    db.customQuestions = db.customQuestions || [];
    db.customQuestions.push(newQuestion);
    await writeDb(db);
    res.json({ success: true, question: newQuestion });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Socket.io Real-time Logic
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // --- HOST HANDLERS ---

  // Host creates game
  socket.on('host:create', async () => {
    const code = generateGameCode();
    activeGames[code] = {
      code,
      hostSocketId: socket.id,
      state: 'LOBBY', // LOBBY, QUESTION_ACTIVE, QUESTION_ENDED
      players: [], // Max 7 players
      currentQuestion: null,
      questionStartTime: null,
      questionEndTime: null,
      submissions: {} // socketId -> { order, timeTaken, correct }
    };

    socket.join(code);
    socket.emit('host:created', { code });
    console.log(`Game created: ${code} by host ${socket.id}`);
  });

  // Host starts a question
  socket.on('host:start-question', async ({ code, questionId }) => {
    const game = activeGames[code];
    if (!game || game.hostSocketId !== socket.id) {
      return socket.emit('error', 'Unauthorized or game not found');
    }

    const questions = await loadQuestions();
    const question = questions.find(q => q.id === questionId);
    if (!question) {
      return socket.emit('error', 'Question not found');
    }

    // Scramble items for players (make sure they don't get the correct order directly)
    // We shuffle the items array randomly
    const scrambledItems = [...question.items].sort(() => Math.random() - 0.5);

    game.state = 'QUESTION_ACTIVE';
    game.currentQuestion = {
      id: question.id,
      text: question.text,
      scrambledItems,
      correctOrder: question.correctOrder
    };
    game.submissions = {};
    game.questionStartTime = Date.now();
    game.questionEndTime = null;

    // Notify all players in room
    io.to(code).emit('game:question-started', {
      text: question.text,
      items: scrambledItems,
      duration: 15 // 15 seconds timer
    });

    console.log(`Question started in game ${code}: ${question.text}`);
  });

  // Host ends the question manually (or when timer runs out)
  socket.on('host:end-question', async ({ code }) => {
    const game = activeGames[code];
    if (!game || game.hostSocketId !== socket.id) {
      return socket.emit('error', 'Unauthorized or game not found');
    }

    if (game.state !== 'QUESTION_ACTIVE') {
      return socket.emit('error', 'Question is not active');
    }

    game.state = 'QUESTION_ENDED';
    game.questionEndTime = Date.now();

    // Check players who didn't submit, mark them as incorrect / no submission
    game.players.forEach(p => {
      if (!game.submissions[p.id]) {
        game.submissions[p.id] = {
          order: [],
          timeTaken: 999999, // Max time
          correct: false,
          noSubmission: true
        };
      }
    });

    // Generate leaderboard
    const leaderboard = calculateLeaderboard(game);

    // Save game record to db.json (persisting history)
    const db = await readDb();
    db.gamesHistory = db.gamesHistory || [];
    db.gamesHistory.push({
      code: game.code,
      timestamp: new Date().toISOString(),
      question: game.currentQuestion.text,
      correctOrder: game.currentQuestion.correctOrder,
      leaderboard
    });
    await writeDb(db);

    // Send leaderboard to host and players
    io.to(code).emit('game:question-ended', {
      leaderboard,
      correctOrder: game.currentQuestion.correctOrder
    });

    console.log(`Question ended in game ${code}. Leaderboard sent.`);
  });

  // Host resets game / clears state to allow another question
  socket.on('host:next-question-ready', ({ code }) => {
    const game = activeGames[code];
    if (!game || game.hostSocketId !== socket.id) {
      return socket.emit('error', 'Unauthorized');
    }

    game.state = 'LOBBY';
    game.currentQuestion = null;
    game.questionStartTime = null;
    game.submissions = {};

    // Clear submission states from players
    game.players.forEach(p => {
      // Keep players but reset their status
    });

    io.to(code).emit('game:lobby-reset', {
      players: game.players.map(p => ({ name: p.name, id: p.id, answered: false }))
    });
  });

  // --- PLAYER HANDLERS ---

  // Player attempts to join a game
  socket.on('player:join', ({ code, name }) => {
    const game = activeGames[code];
    if (!game) {
      return socket.emit('join:failed', 'Game code not found.');
    }

    if (game.state !== 'LOBBY') {
      return socket.emit('join:failed', 'Game has already started. Cannot join now.');
    }

    // Limit to 7 players
    if (game.players.length >= 7) {
      return socket.emit('join:failed', 'Game is full! Maximum 7 players allowed.');
    }

    // Check duplicate name
    const nameExists = game.players.some(p => p.name.toLowerCase() === name.toLowerCase());
    if (nameExists) {
      return socket.emit('join:failed', 'This name is already taken in this game.');
    }

    const newPlayer = {
      id: socket.id,
      name: name,
      joinedAt: Date.now()
    };

    game.players.push(newPlayer);
    socket.join(code);

    // Confirm join to player
    socket.emit('join:success', {
      code,
      name,
      players: game.players.map(p => p.name)
    });

    // Notify host and all players about the updated lobby
    io.to(code).emit('game:lobby-update', {
      players: game.players.map(p => ({
        id: p.id,
        name: p.name,
        answered: false
      }))
    });

    console.log(`Player ${name} (${socket.id}) joined game ${code}`);
  });

  // Player submits answer
  socket.on('player:submit', ({ code, order }) => {
    const game = activeGames[code];
    if (!game) {
      return socket.emit('error', 'Game not found');
    }

    if (game.state !== 'QUESTION_ACTIVE') {
      return socket.emit('error', 'No active question or question already ended.');
    }

    // Calculate time taken in milliseconds
    const timeTaken = Date.now() - game.questionStartTime;

    // Verify if player is in this game
    const player = game.players.find(p => p.id === socket.id);
    if (!player) {
      return socket.emit('error', 'You are not a registered player in this game.');
    }

    // Check if player already submitted
    if (game.submissions[socket.id]) {
      return socket.emit('error', 'You have already submitted an answer.');
    }

    // Check if order is correct
    const correctOrder = game.currentQuestion.correctOrder;
    let isCorrect = true;
    if (order.length !== correctOrder.length) {
      isCorrect = false;
    } else {
      for (let i = 0; i < correctOrder.length; i++) {
        if (order[i] !== correctOrder[i]) {
          isCorrect = false;
          break;
        }
      }
    }

    // Record submission
    game.submissions[socket.id] = {
      order,
      timeTaken,
      correct: isCorrect,
      noSubmission: false
    };

    // Send confirmation to player
    socket.emit('player:submit-confirmed', { correct: isCorrect, timeTaken });

    // Notify room that player answered (without showing if it's correct/time)
    io.to(code).emit('game:player-answered', {
      playerId: socket.id,
      playerName: player.name
    });

    console.log(`Player ${player.name} in game ${code} submitted in ${timeTaken}ms. Correct: ${isCorrect}`);

    // Auto-end question if ALL players have submitted
    const allSubmitted = game.players.every(p => game.submissions[p.id]);
    if (allSubmitted) {
      console.log(`All players submitted in game ${code}. Auto-ending question.`);
      // Emit trigger to host to let them know all submitted, or just auto-end
      // To follow host authority: we notify host they can end, or auto-end
      // Let's auto-trigger the question end to make it seamless, but host still triggers it
      // Let's notify host that all players finished
      io.to(game.hostSocketId).emit('host:all-submitted');
    }
  });

  // Disconnection handler
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);

    // If host disconnected, notify the room
    for (const code in activeGames) {
      const game = activeGames[code];
      if (game.hostSocketId === socket.id) {
        io.to(code).emit('game:host-disconnected');
        delete activeGames[code];
        console.log(`Game ${code} deleted because host disconnected.`);
        break;
      }

      // If player disconnected, remove them from game lobby
      const playerIndex = game.players.findIndex(p => p.id === socket.id);
      if (playerIndex !== -1) {
        const player = game.players[playerIndex];
        game.players.splice(playerIndex, 1);
        
        // Remove submission if active
        if (game.submissions && game.submissions[socket.id]) {
          delete game.submissions[socket.id];
        }

        io.to(code).emit('game:lobby-update', {
          players: game.players.map(p => ({
            id: p.id,
            name: p.name,
            answered: !!game.submissions[p.id]
          }))
        });
        console.log(`Player ${player.name} left game ${code}`);
        break;
      }
    }
  });
});

// Helper to calculate leaderboard
function calculateLeaderboard(game) {
  const leaderboard = game.players.map(player => {
    const sub = game.submissions[player.id] || {
      order: [],
      timeTaken: 999999,
      correct: false,
      noSubmission: true
    };
    return {
      id: player.id,
      name: player.name,
      timeTaken: sub.timeTaken,
      correct: sub.correct,
      noSubmission: sub.noSubmission,
      orderStr: sub.order.join(' → ') || 'No Answer'
    };
  });

  // Sort leaderboard:
  // 1. Correct answers first, sorted by timeTaken ascending (fastest first)
  // 2. Incorrect/no submissions next, sorted by timeTaken (if any) or name
  leaderboard.sort((a, b) => {
    if (a.correct && !b.correct) return -1;
    if (!a.correct && b.correct) return 1;
    
    // If both correct, fastest time wins
    if (a.correct && b.correct) {
      return a.timeTaken - b.timeTaken;
    }
    
    // If both incorrect, sort noSubmissions to the bottom
    if (a.noSubmission && !b.noSubmission) return 1;
    if (!a.noSubmission && b.noSubmission) return -1;
    
    return a.timeTaken - b.timeTaken;
  });

  return leaderboard;
}

// Start Server
httpServer.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
