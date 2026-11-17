
const express = require('express');
const path = require('path');
const http = require('http');

const app = express();
const server = http.createServer(app);
const io = require('socket.io')(server);

const PORT = process.env.PORT || 4000;

// Serve frontend files
app.use(express.static(path.join(__dirname, 'public')));

// Store connected users
const users = new Map();

// Socket.IO connection
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Register username
  socket.on('register-user', (name) => {
    // Prevent registering multiple times
    if (users.has(socket.id)) {
      socket.emit('registration-error', 'You are already registered.');
      return;
    }

    const username = String(name || '').trim().slice(0, 20);

    if (!username) {
      socket.emit('registration-error', 'Please enter a username.');
      return;
    }

    // Check duplicate username
    const alreadyExists = [...users.values()].some(
      (user) => user.name.toLowerCase() === username.toLowerCase()
    );

    if (alreadyExists) {
      socket.emit('registration-error', 'Username already taken.');
      return;
    }

    users.set(socket.id, { name: username });

    socket.emit('registration-success', {
      name: username
    });

    updateUsers();
  });

  // Private messaging
  socket.on('private-message', (data = {}) => {
    const sender = users.get(socket.id);
    const to = data.to;
    const recipient = users.get(to);

    if (!sender) {
      socket.emit('chat-error', 'Please register first.');
      return;
    }

    if (!recipient || !to || to === socket.id) {
      socket.emit('chat-error', 'User is not available.');
      return;
    }

    const cleanMessage = String(data.message || '')
      .trim()
      .slice(0, 2000);

    if (!cleanMessage) return;

    const messageData = {
      from: socket.id,
      name: sender.name,
      message: cleanMessage,
      dateTime: new Date().toISOString()
    };

    // Send only to selected recipient
    io.to(to).emit('private-message', messageData);
  });

  // Disconnect user
  socket.on('disconnect', () => {
    if (users.has(socket.id)) {
      users.delete(socket.id);
      updateUsers();
    }

    console.log('User disconnected:', socket.id);
  });
});

// Update online users list
function updateUsers() {
  const userList = [...users.entries()].map(
    ([socketId, user]) => ({
      socketId,
      name: user.name
    })
  );

  io.emit('users-list', userList);
  io.emit('clients-total', users.size);
}

// Start server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Chat server running on port ${PORT}`);
});
