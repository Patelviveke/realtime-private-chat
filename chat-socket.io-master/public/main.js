
const socket = io();

// DOM elements
const nameInput = document.getElementById('name-input');
const usernameForm = document.getElementById('username-form');
const chatApp = document.getElementById('chat-app');
const userList = document.getElementById('user-list');
const messageContainer = document.getElementById('message-container');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const activeUserName = document.getElementById('active-user-name');
const clientsTotal = document.getElementById('client-total');

const imageButton = document.getElementById('image-button');
const imageInput = document.getElementById('image-input');
const imagePreviewBox = document.getElementById('image-preview-box');
const imagePreview = document.getElementById('image-preview');
const cancelImageButton = document.getElementById('cancel-image');
const sendImageButton = document.getElementById('send-image');

const replyPreviewBox = document.getElementById('reply-preview-box');
const replyPreviewName = document.getElementById('reply-preview-name');
const replyPreviewText = document.getElementById('reply-preview-text');
const cancelReplyButton = document.getElementById('cancel-reply');

const messageTone = new Audio('/message-tone.mp3');

let currentUser = null;
let selectedUser = null;
let users = [];
let selectedImage = null;
let previewUrl = null;
let uploadingImage = false;
let replyingTo = null;

const conversations = new Map();

chatApp.hidden = true;
imagePreviewBox.hidden = true;
replyPreviewBox.hidden = true;

// Generate message ID
function createMessageId() {
  if (window.crypto && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return Date.now().toString(36) +
    Math.random().toString(36).slice(2);
}

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

socket.on('registration-error', (message) => {
  alert(message);
});

// Online users
socket.on('clients-total', (total) => {
  clientsTotal.textContent = `Online: ${total}`;
});

socket.on('users-list', (data) => {
  users = data.filter((user) => user.socketId !== socket.id);

  if (
    selectedUser &&
    !users.some((user) => user.socketId === selectedUser.socketId)
  ) {
    selectedUser = null;
    activeUserName.textContent = 'Select a user';
    messageInput.disabled = true;
    messageForm.querySelector('button[type="submit"]').disabled = true;
    imageButton.disabled = true;
    clearImagePreview();
    clearReply();
    messageContainer.replaceChildren();
  }

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
      messageForm.querySelector('button[type="submit"]').disabled = false;
      imageButton.disabled = false;

      clearImagePreview();
      clearReply();

      renderUsers();
      renderMessages();

      messageInput.focus();
    });

    userList.appendChild(button);
  });
}

// Render conversation
function renderMessages() {
  messageContainer.replaceChildren();

  if (!selectedUser) return;

  const messages = conversations.get(selectedUser.socketId) || [];

  messages.forEach((item) => {
    addMessageToUI(item.data, item.isOwnMessage);
  });
}

// Send text message
messageForm.addEventListener('submit', (e) => {
  e.preventDefault();

  const message = messageInput.value.trim();

  if (!selectedUser || !message) return;

  if (!socket.connected) {
    alert('Connection lost. Please refresh the page.');
    return;
  }

  const messageData = {
    messageId: createMessageId(),
    to: selectedUser.socketId,
    message,
    replyTo: replyingTo
  };

  socket.emit('private-message', messageData);

  saveMessage(
    selectedUser.socketId,
    {
      messageId: messageData.messageId,
      name: currentUser,
      message,
      replyTo: replyingTo,
      dateTime: new Date().toISOString()
    },
    true
  );

  messageInput.value = '';
  clearReply();
});

// Receive text message
socket.on('private-message', (data) => {
  saveMessage(data.from, data, false);

  if (selectedUser?.socketId === data.from) {
    messageTone.play().catch(() => {});
  }
});

// Image button
imageButton.addEventListener('click', () => {
  if (!selectedUser || uploadingImage) return;
  imageInput.click();
});

// Select image
imageInput.addEventListener('change', () => {
  const file = imageInput.files?.[0];

  if (!file) return;

  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp'
  ];

  if (!allowedTypes.includes(file.type)) {
    alert('Please select a JPG, PNG, GIF or WEBP image.');
    imageInput.value = '';
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    alert('Image size must be 5 MB or smaller.');
    imageInput.value = '';
    return;
  }

  selectedImage = file;

  clearPreviewURL();

  previewUrl = URL.createObjectURL(file);
  imagePreview.src = previewUrl;
  imagePreviewBox.hidden = false;
});

// Preview URL
function clearPreviewURL() {
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
    previewUrl = null;
  }
}

// Cancel image
cancelImageButton.addEventListener('click', clearImagePreview);

function clearImagePreview() {
  selectedImage = null;
  imageInput.value = '';
  imagePreview.removeAttribute('src');
  imagePreviewBox.hidden = true;
  clearPreviewURL();
}

// Send image with reply information
sendImageButton.addEventListener('click', async () => {
  if (!selectedImage || !selectedUser || uploadingImage) return;

  if (!socket.connected) {
    alert('Connection lost. Please refresh the page.');
    return;
  }

  const file = selectedImage;
  const recipientId = selectedUser.socketId;

  const formData = new FormData();

  formData.append('image', file);
  formData.append('to', recipientId);
  formData.append('messageId', createMessageId());

  if (replyingTo) {
    formData.append('replyTo', JSON.stringify(replyingTo));
  }

  uploadingImage = true;
  sendImageButton.disabled = true;
  imageButton.disabled = true;
  sendImageButton.textContent = 'Uploading...';

  try {
    const response = await fetch('/upload-image', {
      method: 'POST',
      headers: {
        'x-socket-id': socket.id
      },
      body: formData
    });

    const responseText = await response.text();

    let result;

    try {
      result = JSON.parse(responseText);
    } catch {
      console.error('Server response:', responseText);
      throw new Error(
        `Invalid server response. HTTP Status: ${response.status}`
      );
    }

    if (!response.ok) {
      throw new Error(result.error || 'Image upload failed.');
    }

    if (!result.image || !result.image.imageUrl) {
      throw new Error('Image details are missing.');
    }

    saveMessage(recipientId, result.image, true);

    clearImagePreview();
    clearReply();

  } catch (error) {
    console.error('Image upload error:', error);
    alert(error.message || 'Unable to send image.');

  } finally {
    uploadingImage = false;
    sendImageButton.disabled = false;
    imageButton.disabled = !selectedUser;
    sendImageButton.textContent = 'Send Image ➤';
  }
});

// Receive image
socket.on('private-image', (data) => {
  saveMessage(data.from, data, false);

  if (selectedUser?.socketId === data.from) {
    messageTone.play().catch(() => {});
  }
});

// Save message
function saveMessage(userId, data, isOwnMessage) {
  if (!conversations.has(userId)) {
    conversations.set(userId, []);
  }

  conversations.get(userId).push({
    data,
    isOwnMessage
  });

  if (selectedUser?.socketId === userId) {
    addMessageToUI(data, isOwnMessage);
  }
}

// Get reply preview text
function getMessagePreview(data) {
  if (data.imageUrl) return '📷 Image';

  return String(data.message || 'Message').slice(0, 200);
}

// Select message to reply
function startReply(data) {
  replyingTo = {
    messageId: data.messageId,
    name: data.name || 'User',
    text: getMessagePreview(data),
    isImage: Boolean(data.imageUrl)
  };

  replyPreviewName.textContent = replyingTo.name;
  replyPreviewText.textContent = replyingTo.text;

  replyPreviewBox.hidden = false;
  messageInput.focus();
}

// Cancel reply
cancelReplyButton.addEventListener('click', clearReply);

function clearReply() {
  replyingTo = null;
  replyPreviewBox.hidden = true;
  replyPreviewName.textContent = '';
  replyPreviewText.textContent = '';
}

// Jump to original message
function jumpToMessage(messageId) {
  if (!messageId) return;

  const target = [...messageContainer.querySelectorAll('[data-message-id]')]
    .find((element) => element.dataset.messageId === messageId);

  if (!target) {
    alert('Original message is not available in this chat session.');
    return;
  }

  target.scrollIntoView({
    behavior: 'smooth',
    block: 'center'
  });

  target.classList.add('message-highlight');

  setTimeout(() => {
    target.classList.remove('message-highlight');
  }, 1600);
}

// Display message
function addMessageToUI(data, isOwnMessage) {
  const li = document.createElement('li');

  li.className = isOwnMessage
    ? 'message-right'
    : 'message-left';

  li.dataset.messageId = data.messageId || '';

  const paragraph = document.createElement('div');
  paragraph.className = 'message';

  // Quoted original message
  if (data.replyTo) {
    const quote = document.createElement('button');

    quote.type = 'button';
    quote.className = 'quoted-message';

    const quoteName = document.createElement('strong');
    quoteName.textContent = data.replyTo.name || 'User';

    const quoteText = document.createElement('span');
    quoteText.textContent = data.replyTo.text || 'Message';

    quote.append(quoteName, quoteText);

    quote.addEventListener('click', () => {
      jumpToMessage(data.replyTo.messageId);
    });

    paragraph.appendChild(quote);
  }

  // Image or text content
  if (data.imageUrl) {
    const image = document.createElement('img');

    image.src = data.imageUrl;
    image.alt = 'Shared image';
    image.className = 'chat-image';
    image.loading = 'lazy';

    image.addEventListener('click', () => {
      window.open(image.src, '_blank', 'noopener,noreferrer');
    });

    paragraph.appendChild(image);

  } else {
    const text = document.createElement('span');

    text.className = 'message-text';
    text.textContent = data.message || '';

    paragraph.appendChild(text);
  }

  // Message details
  const details = document.createElement('span');

  details.className = 'message-details';
  details.textContent =
    `${data.name} • ${new Date(data.dateTime).toLocaleTimeString()}`;

  paragraph.appendChild(details);

  // Reply button
  const replyButton = document.createElement('button');

  replyButton.type = 'button';
  replyButton.className = 'reply-button';
  replyButton.textContent = '↩ Reply';
  replyButton.setAttribute('aria-label', 'Reply to this message');

  replyButton.addEventListener('click', () => {
    startReply(data);
  });

  li.append(paragraph, replyButton);

  // Mobile swipe-to-reply
  let touchStartX = 0;
  let touchStartY = 0;

  li.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;

    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  li.addEventListener('touchend', (e) => {
    if (!touchStartX) return;

    const deltaX = e.changedTouches[0].clientX - touchStartX;
    const deltaY = e.changedTouches[0].clientY - touchStartY;

    if (deltaX > 65 && Math.abs(deltaX) > Math.abs(deltaY) * 1.3) {
      startReply(data);
    }

    touchStartX = 0;
    touchStartY = 0;
  }, { passive: true });

  messageContainer.appendChild(li);
  messageContainer.scrollTop = messageContainer.scrollHeight;
}

// Chat error
socket.on('chat-error', (message) => {
  alert(message);
});

// Connection errors
socket.on('connect_error', (error) => {
  console.error('Socket connection error:', error);
});

socket.on('disconnect', () => {
  console.log('Disconnected from chat server.');
});
