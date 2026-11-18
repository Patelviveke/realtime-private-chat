
const express = require('express');
const path = require('path');
const http = require('http');
const multer = require('multer');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = require('socket.io')(server);

const PORT = process.env.PORT || 4000;

const uploadDir = path.join(__dirname, 'uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadDir));

const users = new Map();

const allowedTypes = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp'
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),

  filename: (req, file, cb) => {
    const extension = allowedTypes[file.mimetype];
    const filename = crypto.randomBytes(16).toString('hex') + extension;
    cb(null, filename);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (allowedTypes[file.mimetype]) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG, PNG, GIF and WEBP images are allowed.'));
    }
  }
});

// Clean reply data received from client
function cleanReply(reply) {
  if (!reply || typeof reply !== 'object') return null;

  return {
    messageId: String(reply.messageId || '').slice(0, 100),
    name: String(reply.name || '').slice(0, 20),
    text: String(reply.text || '').slice(0, 200),
    isImage: Boolean(reply.isImage)
  };
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('register-user', (name) => {
    if (users.has(socket.id)) {
      socket.emit('registration-error', 'You are already registered.');
      return;
    }

    const username = String(name || '').trim().slice(0, 20);

    if (!username) {
      socket.emit('registration-error', 'Please enter a username.');
      return;
    }

    const alreadyExists = [...users.values()].some(
      (user) => user.name.toLowerCase() === username.toLowerCase()
    );

    if (alreadyExists) {
      socket.emit('registration-error', 'Username already taken.');
      return;
    }

    users.set(socket.id, { name: username });

    socket.emit('registration-success', { name: username });
    updateUsers();
  });

  // Private text message with reply support
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

    const cleanMessage = String(data.message || '').trim().slice(0, 2000);

    if (!cleanMessage) return;

    const messageData = {
      messageId: String(data.messageId || crypto.randomBytes(16).toString('hex')).slice(0, 100),
      from: socket.id,
      name: sender.name,
      message: cleanMessage,
      replyTo: cleanReply(data.replyTo),
      dateTime: new Date().toISOString()
    };

    io.to(to).emit('private-message', messageData);
  });

  socket.on('disconnect', () => {
    if (users.has(socket.id)) {
      users.delete(socket.id);
      updateUsers();
    }

    console.log('User disconnected:', socket.id);
  });
});

// Image upload route with reply support
app.post(
  '/upload-image',
  (req, res, next) => {
    const senderId = req.headers['x-socket-id'];

    if (!senderId || !users.has(senderId)) {
      return res.status(401).json({ error: 'Please register first.' });
    }

    next();
  },
  upload.single('image'),
  (req, res) => {
    const senderId = req.headers['x-socket-id'];
    const to = req.body.to;

    const sender = users.get(senderId);
    const recipient = users.get(to);

    if (!sender || !recipient || to === senderId) {
      if (req.file) fs.unlink(req.file.path, () => {});

      return res.status(400).json({
        error: 'Recipient is not available.'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        error: 'Please select an image.'
      });
    }

    let replyTo = null;

    try {
      replyTo = cleanReply(
        req.body.replyTo ? JSON.parse(req.body.replyTo) : null
      );
    } catch {
      if (req.file) fs.unlink(req.file.path, () => {});

      return res.status(400).json({
        error: 'Invalid reply information.'
      });
    }

    const imageData = {
      messageId: String(req.body.messageId || crypto.randomBytes(16).toString('hex')).slice(0, 100),
      from: senderId,
      name: sender.name,
      imageUrl: '/uploads/' + req.file.filename,
      replyTo,
      dateTime: new Date().toISOString()
    };

    io.to(to).emit('private-image', imageData);

    res.json({
      success: true,
      image: imageData
    });
  }
);

// Upload errors
app.use((err, req, res, next) => {
  console.error('Upload error:', err.message);

  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      error: err.code === 'LIMIT_FILE_SIZE'
        ? 'Image must be 5 MB or smaller.'
        : err.message
    });
  }

  res.status(400).json({
    error: err.message || 'Image upload failed.'
  });
});

function updateUsers() {
  const userList = [...users.entries()].map(([socketId, user]) => ({
    socketId,
    name: user.name
  }));

  io.emit('users-list', userList);
  io.emit('clients-total', users.size);
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Chat server running on port ${PORT}`);
});
