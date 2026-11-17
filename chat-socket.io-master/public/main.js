
const socket = io();

const nameInput = document.getElementById('name-input');
const usernameForm = document.getElementById('username-form');
const chatApp = document.getElementById('chat-app');
const userList = document.getElementById('user-list');
const messageContainer = document.getElementById('message-container');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const activeUserName = document.getElementById('active-user-name');
const clientsTotal = document.getElementById('client-total');

const messageTone = new Audio('/message-tone.mp3');

let currentUser = null;
let selectedUser = null;
let users = [];

const conversations = new Map();

chatApp.hidden = true;

// Register username
usernameForm.addEventListener('submit', (e) => {
  e.preventDefault();

  const name = nameInput.value.trim();

  if (name) {
    socket.emit('register-user', name);
  }
});

// Registration success
socket.on('registration-success', (data) => {
  currentUser = data.name;

  usernameForm.hidden = true;
  chatApp.hidden = false;
});

// Registration error
socket.on('registration-error', (message) => {
  alert(message);
});

// Online users count
socket.on('clients-total', (total) => {
  clientsTotal.textContent = `Online: ${total}`;
});

// Receive online users
socket.on('users-list', (data) => {
  users = data.filter((user) => user.socketId !== socket.id);
  renderUsers();
});

// Render users
function renderUsers() {
  userList.replaceChildren();

  users.forEach((user) => {
    const button = document.createElement('button');

    button.className = 'user-item';
    button.textContent = user.name;

    if (selectedUser?.socketId === user.socketId) {
      button.classList.add('active');
    }

    button.addEventListener('click', () => {
      selectedUser = user;

      activeUserName.textContent = user.name;
      messageInput.disabled = false;
      messageForm.querySelector('button').disabled = false;

      renderUsers();
      renderMessages();

      messageInput.focus();
    });

    userList.appendChild(button);
  });
}

// Render messages
function renderMessages() {
  messageContainer.replaceChildren();

  if (!selectedUser) return;

  const messages = conversations.get(selectedUser.socketId) || [];

  messages.forEach((item) => {
    addMessageToUI(item.data, item.isOwnMessage);
  });
}

// Send private message
messageForm.addEventListener('submit', (e) => {
  e.preventDefault();

  const message = messageInput.value.trim();

  if (!selectedUser || !message) return;

  const data = {
    to: selectedUser.socketId,
    message: message
  };

  socket.emit('private-message', data);

  saveMessage(
    selectedUser.socketId,
    {
      name: currentUser,
      message: message,
      dateTime: new Date().toISOString()
    },
    true
  );

  messageInput.value = '';
});

// Receive private message
socket.on('private-message', (data) => {
  saveMessage(data.from, data, false);

  if (selectedUser?.socketId === data.from) {
    messageTone.play().catch(() => {});
  }
});

// Save conversation
function saveMessage(userId, data, isOwnMessage) {
  if (!conversations.has(userId)) {
    conversations.set(userId, []);
  }

  conversations.get(userId).push({
    data: data,
    isOwnMessage: isOwnMessage
  });

  if (selectedUser?.socketId === userId) {
    addMessageToUI(data, isOwnMessage);
  }
}

// Display message in chat
function addMessageToUI(data, isOwnMessage) {
  const li = document.createElement('li');

  li.className = isOwnMessage
    ? 'message-right'
    : 'message-left';

  const paragraph = document.createElement('p');
  paragraph.className = 'message';

  const text = document.createElement('span');
  text.textContent = data.message;

  const details = document.createElement('span');

  details.textContent =
    `${data.name} • ${new Date(data.dateTime).toLocaleTimeString()}`;

  paragraph.append(text, details);
  li.appendChild(paragraph);

  messageContainer.appendChild(li);

  messageContainer.scrollTop = messageContainer.scrollHeight;
}

// Chat error
socket.on('chat-error', (message) => {
  alert(message);
});
