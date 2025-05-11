
// server.js - Socket.IO server for MathJack multiplayer game
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

// Initialize Express app and HTTP server
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files
app.use(express.static(path.join(__dirname, './')));

// Game rooms storage
const rooms = new Map();

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
  socket.on('start-game', ({ roomPin, startMusic }) => {
    if (!rooms.has(roomPin)) return;
    
    const roomData = rooms.get(roomPin);
    
    // Check if requester is the host
    if (roomData.host !== socket.id) {
      socket.emit('error', { message: 'Only the host can start the game' });
      return;
    }
    
    // Notify all players in room that game is starting
    io.to(roomPin).emit('game-started', { roomPin, startMusic });
    
    console.log(`Game started in room: ${roomPin} with music: ${startMusic}`);
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
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('Share this address with players on your local network');
  console.log('To make it accessible to others, use your local IP address instead of localhost');
});