const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

// Create Express app
const app = express();
const server = http.createServer(app);

// Serve static files
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'web')));

// Set up Socket.io with CORS enabled (important for Netlify)
const io = new Server(server, {
  cors: {
    origin: '*', // In production, replace with your Netlify domain
    methods: ['GET', 'POST']
  }
});

// Game state storage
const games = {};
const players = {};

// Socket.io event handlers
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Create game room
  socket.on('create-game', ({ hostName, gamePin }) => {
    console.log(`Host ${hostName} created game with PIN: ${gamePin}`);
    
    // Create game in memory
    games[gamePin] = {
      hostId: socket.id,
      hostName,
      players: [],
      status: 'waiting', // waiting, active, ended
      quiz: null,
      currentQuestionIndex: 0
    };
    
    // Join the room
    socket.join(gamePin);
    
    // Send confirmation
    socket.emit('game-created', { gamePin });
  });

  // Join game
  socket.on('join-game', ({ playerName, gamePin }) => {
    console.log(`Player ${playerName} attempting to join game: ${gamePin}`);
    
    // Check if game exists
    if (!games[gamePin]) {
      socket.emit('join-failed', { message: 'Game not found with that PIN' });
      return;
    }
    
    // Check if game is already active
    if (games[gamePin].status !== 'waiting') {
      socket.emit('join-failed', { message: 'Game has already started' });
      return;
    }
    
    // Add player to game
    const player = { id: socket.id, name: playerName, score: 0 };
    games[gamePin].players.push(player);
    players[socket.id] = { gamePin, name: playerName };
    
    // Join the room
    socket.join(gamePin);
    
    // Send confirmation to player
    socket.emit('joined-game');
    
    // Notify host of new player
    io.to(gamePin).emit('player-joined', { 
      players: games[gamePin].players 
    });
  });

  // Start quiz
  socket.on('start-quiz', ({ gamePin, quizType }) => {
    console.log(`Starting quiz in game ${gamePin}, type: ${quizType}`);
    
    if (!games[gamePin]) return;
    
    // Check if socket is the host
    if (games[gamePin].hostId !== socket.id) {
      socket.emit('error', { message: 'Only the host can start the quiz' });
      return;
    }
    
    // Generate quiz questions based on type
    const quiz = generateQuiz(quizType);
    games[gamePin].quiz = quiz;
    games[gamePin].status = 'active';
    
    // Notify all players in the room
    io.to(gamePin).emit('quiz-started', { quiz });
  });

  // Player answered a question
  socket.on('answer-question', ({ gamePin, questionIndex, selectedIndex, isCorrect }) => {
    if (!games[gamePin]) return;
    
    // Find the player
    const playerIndex = games[gamePin].players.findIndex(p => p.id === socket.id);
    if (playerIndex === -1) return;
    
    // Update player's score
    if (isCorrect) {
      games[gamePin].players[playerIndex].score += 10;
    }
    
    // If host is tracking individual answers, notify them
    socket.to(games[gamePin].hostId).emit('player-answered', {
      playerId: socket.id,
      playerName: players[socket.id].name,
      questionIndex,
      selectedIndex,
      isCorrect
    });
  });

  // Host moving to next question
  socket.on('next-question', ({ gamePin, questionIndex }) => {
    if (!games[gamePin] || games[gamePin].hostId !== socket.id) return;
    
    games[gamePin].currentQuestionIndex = questionIndex;
    socket.to(gamePin).emit('load-next-question', { questionIndex });
  });

  // End quiz
  socket.on('end-quiz', ({ gamePin }) => {
    if (!games[gamePin]) return;
    
    games[gamePin].status = 'ended';
    socket.to(gamePin).emit('quiz-ended', {
      results: games[gamePin].players.map(p => ({
        name: p.name,
        score: p.score
      }))
    });
  });

  // Disconnection
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    // If the user was in a game, handle cleanup
    if (players[socket.id]) {
      const gamePin = players[socket.id].gamePin;
      
      if (games[gamePin]) {
        // If host left, end the game
        if (games[gamePin].hostId === socket.id) {
          io.to(gamePin).emit('host-left');
          delete games[gamePin];
        } else {
          // Remove player from the game
          games[gamePin].players = games[gamePin].players.filter(p => p.id !== socket.id);
          
          // Notify host
          io.to(games[gamePin].hostId).emit('player-joined', { 
            players: games[gamePin].players 
          });
        }
      }
      
      delete players[socket.id];
    }
  });
});

// Function to generate quiz questions
function generateQuiz(quizType) {
  const quizzes = {
    basic: {
      title: "Basic Arithmetic Quiz",
      timeLimit: 300, // 5 minutes
      questions: [
        {
          text: "What is 7 + 5?",
          options: ["10", "12", "13", "15"],
          correctIndex: 1,
          explanation: "7 + 5 = 12"
        },
        {
          text: "What is 9 × 4?",
          options: ["32", "36", "40", "45"],
          correctIndex: 1,
          explanation: "9 × 4 = 36"
        },
        {
          text: "What is 20 - 7?",
          options: ["12", "13", "14", "15"],
          correctIndex: 1,
          explanation: "20 - 7 = 13"
        },
        {
          text: "What is 24 ÷ 6?",
          options: ["3", "4", "5", "6"],
          correctIndex: 1,
          explanation: "24 ÷ 6 = 4"
        },
        {
          text: "What is 8 + 8?",
          options: ["14", "15", "16", "18"],
          correctIndex: 2,
          explanation: "8 + 8 = 16"
        }
      ]
    },
    algebra: {
      title: "Algebra Quiz",
      timeLimit: 420, // 7 minutes
      questions: [
        {
          text: "Solve for x: 2x + 5 = 15",
          options: ["x = 4", "x = 5", "x = 6", "x = 10"],
          correctIndex: 1,
          explanation: "2x + 5 = 15\n2x = 10\nx = 5"
        },
        {
          text: "Simplify: 3(x + 2) - 4x",
          options: ["3x + 6 - 4x", "x + 6", "-x + 6", "2x - 6"],
          correctIndex: 2,
          explanation: "3(x + 2) - 4x = 3x + 6 - 4x = -x + 6"
        },
        {
          text: "Solve: x² = 16",
          options: ["x = 4", "x = ±4", "x = 8", "x = 2"],
          correctIndex: 1,
          explanation: "x² = 16\nx = ±√16\nx = ±4"
        },
        {
          text: "If f(x) = 2x + 3, what is f(4)?",
          options: ["8", "9", "10", "11"],
          correctIndex: 3,
          explanation: "f(4) = 2(4) + 3 = 8 + 3 = 11"
        },
        {
          text: "Solve the inequality: 3x - 1 > 8",
          options: ["x > 2", "x > 3", "x > 9/3", "x > 7/3"],
          correctIndex: 2,
          explanation: "3x - 1 > 8\n3x > 9\nx > 9/3 = 3"
        }
      ]
    },
    geometry: {
      title: "Geometry Quiz",
      timeLimit: 360, // 6 minutes
      questions: [
        {
          text: "What is the area of a circle with radius 4?",
          options: ["16π", "8π", "4π", "4π²"],
          correctIndex: 0,
          explanation: "Area = πr² = π(4)² = 16π"
        },
        {
          text: "What is the sum of angles in a triangle?",
          options: ["90°", "180°", "270°", "360°"],
          correctIndex: 1,
          explanation: "The sum of angles in a triangle is always 180°."
        },
        {
          text: "What is the Pythagorean theorem?",
          options: ["a² + b² = c²", "a + b + c = 180°", "a/sin(A) = b/sin(B) = c/sin(C)", "A + B + C = 360°"],
          correctIndex: 0,
          explanation: "The Pythagorean theorem states that in a right triangle, the square of the length of the hypotenuse equals the sum of squares of the other two sides."
        },
        {
          text: "What is the perimeter of a rectangle with length 8 and width 5?",
          options: ["13", "20", "26", "40"],
          correctIndex: 2,
          explanation: "Perimeter = 2(length + width) = 2(8 + 5) = 2(13) = 26"
        },
        {
          text: "What is the volume of a cube with side length 3?",
          options: ["9", "18", "27", "81"],
          correctIndex: 2,
          explanation: "Volume = side³ = 3³ = 27"
        }
      ]
    }
  };
  
  return quizzes[quizType] || quizzes.basic;
}

// Handle routes for your SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start the server
const PORT = process.env.PORT || 3002;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});