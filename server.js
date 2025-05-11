
// server.js - Socket.IO server for MathJack multiplayer game
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const GameManager = require('./game_manager');

// Initialize Express app and HTTP server
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files
app.use(express.static(path.join(__dirname, './')));

// Game rooms storage
const rooms = new Map();

// Initialize game manager
const gameManager = new GameManager();

// Socket.IO connection handler
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Create a new room
  socket.on('create-room', ({ hostName }) => {
    // Generate a random 6-digit room PIN
    const roomPin = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Create room data structure
    const roomData = {
      pin: roomPin,
      host: socket.id,
      players: [{
        id: socket.id,
        name: hostName,
        isHost: true
      }]
    };
    
    // Store room data
    rooms.set(roomPin, roomData);
    
    // Join socket to room
    socket.join(roomPin);
    
    // Send confirmation to host
    socket.emit('room-created', {
      roomPin,
      players: roomData.players
    });
    
    console.log(`Room created: ${roomPin} by ${hostName}`);
  });

  // Join an existing room
  socket.on('join-room', ({ roomPin, playerName }) => {
    // Check if room exists
    if (!rooms.has(roomPin)) {
      socket.emit('error', { message: 'Room not found. Please check the PIN.' });
      return;
    }
    
    const roomData = rooms.get(roomPin);
    
    // Check if room is full (limit to 2 players for this game)
    if (roomData.players.length >= 2) {
      socket.emit('error', { message: 'Room is full. Please join another room.' });
      return;
    }
    
    // Add player to room
    const newPlayer = {
      id: socket.id,
      name: playerName,
      isHost: false
    };
    
    roomData.players.push(newPlayer);
    
    // Join socket to room
    socket.join(roomPin);
    
    // Send confirmation to player
    socket.emit('room-joined', {
      roomPin,
      players: roomData.players
    });
    
    // Notify host and other players about new player
    socket.to(roomPin).emit('player-joined', {
      players: roomData.players,
      newPlayer
    });
    
    console.log(`Player ${playerName} joined room: ${roomPin}`);
  });

  // Start game
  socket.on('start-game', ({ roomPin }) => {
    if (!rooms.has(roomPin)) return;
    
    const roomData = rooms.get(roomPin);
    
    // Check if requester is the host
    if (roomData.host !== socket.id) {
      socket.emit('error', { message: 'Only the host can start the game' });
      return;
    }
    
    // Check if there are at least 2 players
    if (roomData.players.length < 2) {
      socket.emit('error', { message: 'Need at least 2 players to start the game' });
      return;
    }
    
    // Create a new game for this room
    gameManager.createGame(roomPin, roomData.players);
    
    // Notify all players in room that game is starting
    io.to(roomPin).emit('game-started', { 
      roomPin,
      scriptPath: '/web/multiplayer_game/multiplayer_game.js'  // Updated script path
    });
    
    console.log(`Game started in room: ${roomPin}`);
  });
  
  // Player ready event
  socket.on('player-ready', ({ roomPin, playerName }) => {
    if (!rooms.has(roomPin)) return;
    
    console.log(`Player ${playerName || socket.id} is ready in room ${roomPin}`);
    
    const allReady = gameManager.playerReady(roomPin, socket.id);
    
    // If all players are ready, start the game
    if (allReady) {
      console.log(`All players ready in room ${roomPin}, starting game...`);
      const gameState = gameManager.startGame(roomPin);
      
      // Log the game state for debugging
      console.log('Initial game state:', {
        players: gameState.players,
        currentTurn: gameState.currentTurn,
        cards: Object.keys(gameState.playerCards).map(id => ({
          playerId: id,
          cardCount: gameState.playerCards[id].length
        }))
      });
      
      // Notify all players of initial game state
      gameState.players.forEach(playerId => {
        const playerState = gameManager.getGameStateForPlayer(roomPin, playerId);
        io.to(playerId).emit('game-state-update', playerState);
        
        if (playerId === gameState.currentTurn) {
          console.log(`Notifying player ${playerId} it's their turn`);
          io.to(playerId).emit('your-turn');
        } else {
          console.log(`Notifying player ${playerId} it's opponent's turn`);
          io.to(playerId).emit('opponent-turn');
        }
      });
    }
  });
  
  // Player hit event
  socket.on('player-hit', ({ roomPin }) => {
    if (!rooms.has(roomPin)) return;
    
    console.log(`Player ${socket.id} hit in room ${roomPin}`);
    
    const gameState = gameManager.playerHit(roomPin, socket.id);
    if (!gameState) {
      console.log(`Invalid hit action from player ${socket.id}`);
      return;
    }
    
    // Update all players with new game state
    gameState.players.forEach(playerId => {
      const playerState = gameManager.getGameStateForPlayer(roomPin, playerId);
      io.to(playerId).emit('game-state-update', playerState);
    });
    
    // Check if player busted
    if (gameState.scores[socket.id] > 21) {
      console.log(`Player ${socket.id} busted with score ${gameState.scores[socket.id]}`);
      
      // If game is still active, notify next player it's their turn
      if (gameState.gameActive && gameState.currentTurn) {
        console.log(`Next player's turn: ${gameState.currentTurn}`);
        io.to(gameState.currentTurn).emit('your-turn');
        
        // Notify other players it's not their turn
        gameState.players.filter(id => id !== gameState.currentTurn).forEach(id => {
          io.to(id).emit('opponent-turn');
        });
      } else if (!gameState.gameActive) {
        // Game is over, determine results
        console.log(`Game over in room ${roomPin}`);
        const results = gameManager.determineResults(gameState);
        
        // First send updated game state to all players with revealed cards
        gameState.players.forEach(playerId => {
          const playerState = gameManager.getGameStateForPlayer(roomPin, playerId);
          io.to(playerId).emit('game-state-update', playerState);
        });
        
        // Determine the winner based on scores
        let winner = null;
        const validPlayers = gameState.players.filter(id => gameState.scores[id] <= 21);
        
        if (validPlayers.length > 0) {
          // Find player with highest score that's not busted
          winner = validPlayers.reduce((highest, id) => {
            return gameState.scores[id] > gameState.scores[highest] ? id : highest;
          }, validPlayers[0]);
        }
        
        console.log(`Winner determined: ${winner}`);
        
        // Then send results to each player
        Object.entries(results).forEach(([playerId, result]) => {
          console.log(`Sending result to player ${playerId}: ${result}`);
          io.to(playerId).emit('game-over', { 
            message: result,
            winner: winner
          });
        });
      }
    } else {
      // Notify current player it's their turn
      if (gameState.currentTurn) {
        console.log(`Current turn: ${gameState.currentTurn}`);
        io.to(gameState.currentTurn).emit('your-turn');
        
        // Notify other players it's not their turn
        gameState.players.filter(id => id !== gameState.currentTurn).forEach(id => {
          io.to(id).emit('opponent-turn');
        });
      }
    }
  });
  
  // Player stand event
  socket.on('player-stand', ({ roomPin }) => {
    if (!rooms.has(roomPin)) return;
    
    console.log(`Player ${socket.id} stand (Stay) in room ${roomPin}`);
    
    // Mark this player as stayed in the game state
    const gameState = gameManager.playerStand(roomPin, socket.id);
    if (!gameState) {
      console.log(`Invalid stand action from player ${socket.id}`);
      return;
    }
    
    // Check if both players have chosen to stay
    const bothPlayerStayed = gameState.players.every(player => gameState.playerStayed[player]);
    
    // Update all players with new game state
    gameState.players.forEach(playerId => {
      const playerState = gameManager.getGameStateForPlayer(roomPin, playerId);
      io.to(playerId).emit('game-state-update', playerState);
    });
    
    // Check if both players have chosen to stay, which ends the game
    if (bothPlayerStayed) {
      // Game is over when both players have chosen to stay
      console.log(`Both players have chosen to Stay. Game over in room ${roomPin}`);
      
      // End the game
      gameState.gameActive = false;
      
      // Determine results
      const results = gameManager.determineResults(gameState);
      
      // First send updated game state to all players with revealed cards
      gameState.players.forEach(playerId => {
        const playerState = gameManager.getGameStateForPlayer(roomPin, playerId);
        io.to(playerId).emit('game-state-update', playerState);
      });
      
      // Determine the winner based on scores
      let winner = null;
      const validPlayers = gameState.players.filter(id => gameState.scores[id] <= 21);
      
      if (validPlayers.length > 0) {
        // Find player with highest score that's not busted
        winner = validPlayers.reduce((highest, id) => {
          return gameState.scores[id] > gameState.scores[highest] ? id : highest;
        }, validPlayers[0]);
        
        // If there's a tie (same score), no winner
        const highestScore = gameState.scores[winner];
        const playersWithHighestScore = validPlayers.filter(id => gameState.scores[id] === highestScore);
        if (playersWithHighestScore.length > 1) {
          winner = null; // It's a tie
        }
      }
      
      console.log(`Winner determined: ${winner || 'Tie'}`);
      
      // Then send results to each player
      Object.entries(results).forEach(([playerId, result]) => {
        console.log(`Sending result to player ${playerId}: ${result}`);
        io.to(playerId).emit('game-over', { 
          message: result,
          winner: winner
        });
      });
    } 
    // If game is still active, notify next player it's their turn
    else if (gameState.gameActive && gameState.currentTurn) {
      console.log(`Next player's turn after stand: ${gameState.currentTurn}`);
      io.to(gameState.currentTurn).emit('your-turn');
      
      // Notify other players it's not their turn
      gameState.players.filter(id => id !== gameState.currentTurn).forEach(id => {
        io.to(id).emit('opponent-turn');
      });
    } 
    // Handle case where game is over for other reasons (e.g., player busted)
    else if (!gameState.gameActive) {
      // Game is over, determine results
      console.log(`Game over after stand in room ${roomPin}`);
      const results = gameManager.determineResults(gameState);
      
      // First send updated game state to all players with revealed cards
      gameState.players.forEach(playerId => {
        const playerState = gameManager.getGameStateForPlayer(roomPin, playerId);
        io.to(playerId).emit('game-state-update', playerState);
      });
      
      // Determine the winner based on scores
      let winner = null;
      const validPlayers = gameState.players.filter(id => gameState.scores[id] <= 21);
      
      if (validPlayers.length > 0) {
        // Find player with highest score that's not busted
        winner = validPlayers.reduce((highest, id) => {
          return gameState.scores[id] > gameState.scores[highest] ? id : highest;
        }, validPlayers[0]);
      }
      
      console.log(`Winner determined: ${winner}`);
      
      // Then send results to each player
      Object.entries(results).forEach(([playerId, result]) => {
        console.log(`Sending result to player ${playerId}: ${result}`);
        io.to(playerId).emit('game-over', { 
          message: result,
          winner: winner
        });
      });
    }
  });
  
  // Play again event
  socket.on('play-again', ({ roomPin }) => {
    if (!rooms.has(roomPin)) return;
    
    const roomData = rooms.get(roomPin);
    
    // Check if requester is the host
    if (roomData.host !== socket.id) {
      socket.emit('error', { message: 'Only the host can start a new game' });
      return;
    }
    
    console.log(`Host ${socket.id} starting new game in room ${roomPin}`);
    
    // Get the current game state
    const gameState = gameManager.games.get(roomPin);
    if (!gameState) return;
    
    // Reset the game state first
    const resetGameState = gameManager.resetGame(roomPin);
    
    // Clear ready players since we're starting immediately
    gameState.readyPlayers.clear();
    
    // Notify all players to reset their UI
    io.to(roomPin).emit('reset-game');
    
    // Short delay to ensure UI is reset before starting new game
    setTimeout(() => {
      // Start a new game
      const newGameState = gameManager.startGame(roomPin);
      
      if (newGameState) {
        console.log('New game started successfully:', {
          players: newGameState.players,
          currentTurn: newGameState.currentTurn,
          gameActive: newGameState.gameActive
        });
        
        // Notify all players of initial game state
        newGameState.players.forEach(playerId => {
          const playerState = gameManager.getGameStateForPlayer(roomPin, playerId);
          io.to(playerId).emit('game-state-update', playerState);
          
          if (playerId === newGameState.currentTurn) {
            io.to(playerId).emit('your-turn');
          } else {
            io.to(playerId).emit('opponent-turn');
          }
        });
      } else {
        console.error('Failed to start new game');
      }
    }, 1000); // 1000ms delay to ensure UI is reset
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    // Find rooms where this user was a player
    rooms.forEach((roomData, roomPin) => {
      const playerIndex = roomData.players.findIndex(player => player.id === socket.id);
      
      if (playerIndex !== -1) {
        const isHost = roomData.players[playerIndex].isHost;
        
        // Remove player from room
        roomData.players.splice(playerIndex, 1);
        
        if (isHost || roomData.players.length === 0) {
          // If host left or room is empty, close the room
          io.to(roomPin).emit('room-closed', { message: 'Host left the game' });
          rooms.delete(roomPin);
          console.log(`Room ${roomPin} closed because host left`);
        } else {
          // Notify remaining players that someone left
          io.to(roomPin).emit('player-left', {
            players: roomData.players
          });
        }
      }
    });
  });
});

// Start server
const PORT = process.env.PORT || 3002;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('Share this address with players on your local network');
  console.log('To make it accessible to others, use your local IP address instead of localhost');
});

