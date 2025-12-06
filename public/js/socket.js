/**
 * Socket.io Event Handlers
 * Manages all real-time communication between client and server
 */

const socket = io();

// Connect handlers
socket.on('connect', () => {
  AppState.statusEl.textContent = 'Connected to server';
  socket.emit('requestMessages');
});

socket.on('connect_error', (err) => {
  console.error('Socket connect_error', err);
  AppState.statusEl.textContent = 'Socket error';
});

socket.on('error', (err) => {
  console.error('Socket error', err);
});

// QR & Status handlers
socket.on('qr', dataUrl => {
  AppState.qrImg.src = dataUrl;
  AppState.statusEl.textContent = 'Scan QR to link WhatsApp';
});

socket.on('ready', () => {
  AppState.statusEl.textContent = 'WhatsApp Ready';
  document.getElementById('qrWrap').style.display = 'none';
  hideLoadingOverlay();
});

socket.on('not_ready', () => {
  AppState.statusEl.textContent = 'WhatsApp initializing...';
  showLoadingOverlay('Initializing WhatsApp...');
});

socket.on('authenticated', () => {
  AppState.statusEl.textContent = 'Authenticated, loading...';
  showLoadingOverlay('Authenticated. Loading chats...');
});

socket.on('loading_screen', (percent, message) => {
  showLoadingOverlay(message || 'Loading...', percent);
});

// Helper to manage loading overlay
function showLoadingOverlay(message, percent = 0) {
  const overlay = document.getElementById('loading-overlay');
  const text = overlay.querySelector('.loading-text');
  const bar = document.getElementById('loading-progress');

  if (overlay.style.display !== 'flex') {
    overlay.style.display = 'flex';
    overlay.style.opacity = '1';
  }

  if (message) text.textContent = message;
  if (percent) bar.style.width = `${percent}%`;
}

function hideLoadingOverlay() {
  const overlay = document.getElementById('loading-overlay');
  overlay.style.opacity = '0';
  setTimeout(() => {
    overlay.style.display = 'none';
  }, 300);
}

// Chat handlers
socket.on('chats', list => {
  AppState.chats = list || [];
  renderChats();
  // If we get chats, we can assume loading is mostly done if not already hidden
  if (AppState.chats.length > 0) {
    hideLoadingOverlay();
  }
});

socket.on('sent', ({ chatId, text }) => {
  const c = AppState.chats.find(x => x.chatId === chatId);
  const display = c ? (c.name || c.chatId) : chatId;
  AppState.statusEl.textContent = `Sent to ${display}`;
  socket.emit('requestMessages');
});

// Archive handlers
socket.on('archive_success', ({ chatId }) => {
  const c = AppState.chats.find(x => x.chatId === chatId);
  const display = c ? (c.name || c.chatId) : chatId;
  AppState.statusEl.textContent = `Archived ${display}`;
  loadTagsFromServer();
});

socket.on('archive_error', ({ chatId, error }) => {
  const c = AppState.chats.find(x => x.chatId === chatId);
  const display = c ? (c.name || c.chatId) : chatId;
  AppState.statusEl.textContent = `Failed to archive ${display}: ${error}`;
});

socket.on('unarchive_success', ({ chatId }) => {
  const c = AppState.chats.find(x => x.chatId === chatId);
  const display = c ? (c.name || c.chatId) : chatId;
  AppState.statusEl.textContent = `Unarchived ${display}`;
  loadTagsFromServer();
});

socket.on('unarchive_error', ({ chatId, error }) => {
  const c = AppState.chats.find(x => x.chatId === chatId);
  const display = c ? (c.name || c.chatId) : chatId;
  AppState.statusEl.textContent = `Failed to unarchive ${display}: ${error}`;
});

// Tag updates from server
socket.on('tags_updated', () => {
  loadTagsFromServer();
  renderTagFilterChips();
});

// Notes updates from server
socket.on('notes_updated', () => {
  loadNotesCountsFromServer();
});

// Quick replies updates from server
socket.on('quick_replies_updated', () => {
  loadQuickRepliesFromServer();
  renderQuickReplies();
});

// Export socket for use in other modules
window.socket = socket;
