/**
 * Keyboard Shortcuts Module
 * Handles all keyboard navigation and shortcuts
 */

// Keyboard shortcuts configuration
const SHORTCUTS = {
  navigation: [
    { keys: '↑ ↓ ← →', label: 'Navigate Between Chats (Grid)', action: 'navigate-grid' },
    { keys: 'Space', label: 'Add/Remove from Selection', action: 'toggle-selection' },
    { keys: 'Enter', label: 'Open Full Chat', action: 'open-chat' },
    { keys: 'Escape', label: 'Deselect All', action: 'deselect-all' },
    { keys: 'Ctrl+A', label: 'Select All Visible Chats', action: 'select-all' }
  ],
  quickReplies: [
    { keys: 'Ctrl+1', label: 'Send Quick Reply #1', action: 'quick-reply-1' },
    { keys: 'Ctrl+2', label: 'Send Quick Reply #2', action: 'quick-reply-2' },
    { keys: 'Ctrl+3', label: 'Send Quick Reply #3', action: 'quick-reply-3' },
    { keys: 'Ctrl+4', label: 'Send Quick Reply #4', action: 'quick-reply-4' },
    { keys: 'Ctrl+5', label: 'Send Quick Reply #5', action: 'quick-reply-5' },
    { keys: 'Ctrl+6', label: 'Send Quick Reply #6', action: 'quick-reply-6' },
    { keys: 'Ctrl+7', label: 'Send Quick Reply #7', action: 'quick-reply-7' },
    { keys: 'Ctrl+8', label: 'Send Quick Reply #8', action: 'quick-reply-8' },
    { keys: 'Ctrl+9', label: 'Send Quick Reply #9', action: 'quick-reply-9' },
    { keys: 'Ctrl+0', label: 'Create New Quick Reply', action: 'create-quick-reply' }
  ],
  ui: [
    { keys: 'Ctrl+/', label: 'Show Keyboard Shortcuts', action: 'show-shortcuts' },
    { keys: '?', label: 'Show Keyboard Shortcuts', action: 'show-shortcuts' },
    { keys: 'Ctrl+H', label: 'Toggle Sidebar', action: 'toggle-sidebar' },
    { keys: 'Ctrl+T', label: 'Create New Tag', action: 'create-tag' },
    { keys: 'Ctrl+R', label: 'Refresh Chats', action: 'refresh-chats' },
    { keys: 'Ctrl+M', label: 'Focus Message Input', action: 'focus-message' },
    { keys: 'Ctrl+Shift+R', label: 'Mark Selected as Read', action: 'mark-as-read' }
  ],
  modals: [
    { keys: 'Ctrl+Enter', label: 'Save/Confirm (Tags, Quick Replies, Notes)', action: 'modal-save' },
    { keys: 'Escape', label: 'Cancel/Close Modal', action: 'modal-cancel' },
    { keys: 'Enter', label: 'Send Message (Full Chat)', action: 'send-message' },
    { keys: 'Escape', label: 'Close Full Chat', action: 'close-full-chat' }
  ]
};

// Track currently focused/highlighted chat
let keyboardFocusedChatId = null;

// Initialize keyboard listeners
function initKeyboardShortcuts() {
  document.addEventListener('keydown', handleGlobalKeyboard);
}

// Global keyboard handler
function handleGlobalKeyboard(e) {
  const key = e.key;
  const ctrl = e.ctrlKey;
  const shift = e.shiftKey;

  // Don't intercept if typing in input
  if (e.target.matches('input, textarea')) {
    if (key === 'Escape') {
      e.target.blur();
      return;
    }
    return;
  }

  // Navigation
  if (key === 'ArrowUp') {
    e.preventDefault();
    navigateChats('up');
  } else if (key === 'ArrowDown') {
    e.preventDefault();
    navigateChats('down');
  } else if (key === 'ArrowLeft') {
    e.preventDefault();
    navigateChats('left');
  } else if (key === 'ArrowRight') {
    e.preventDefault();
    navigateChats('right');
  } else if (key === ' ') {
    e.preventDefault();
    if (keyboardFocusedChatId) toggleKeyboardSelection(keyboardFocusedChatId);
  } else if (key === 'Enter') {
    e.preventDefault();
    if (keyboardFocusedChatId) openFullChat(keyboardFocusedChatId, getDisplayNameForChat(keyboardFocusedChatId));
  } else if (key === 'Escape') {
    e.preventDefault();
    if (AppState.selectedChats.size > 0 || keyboardFocusedChatId) {
      AppState.selectedChats.clear();
      keyboardFocusedChatId = null;
      renderChats();
    }
  } else if (ctrl && key === 'a') {
    e.preventDefault();
    selectAllChats();
  } else if (key === '?' || (ctrl && key === '/')) {
    e.preventDefault();
    showShortcutsGuide();
  } else if (ctrl && key === 'h') {
    e.preventDefault();
    toggleSidebar();
  } else if (ctrl && key === 't') {
    e.preventDefault();
    openTagEditor('', '#ffcc00', async (v) => {
      if (!v) return;
      await createTagOnServer(v.name, v.color);
      await loadTagsFromServer();
      renderTagFilterChips();
      renderTagsSettings();
    });
  } else if (ctrl && key === 'r') {
    e.preventDefault();
    socket.emit('requestMessages');
  } else if (ctrl && key === 'm') {
    e.preventDefault();
    const presetInput = document.getElementById('preset');
    if (presetInput) presetInput.focus();
  } else if (ctrl && shift && key === 'R') {
    e.preventDefault();
    markChatsAsRead();
  } else if (ctrl && (key >= '0' && key <= '9')) {
    e.preventDefault();
    const num = parseInt(key);
    if (num === 0) {
      // Create new quick reply
      openQuickReplyEditor('', async (text) => {
        if (!text) return;
        await createQuickReplyOnServer(text);
        await loadQuickRepliesFromServer();
        renderQuickReplies();
        renderQuickRepliesSettings();
      });
    } else {
      // Send quick reply (num 1-9)
      sendQuickReplyByIndex(num - 1);
    }
  }
}

// Navigate between chats with arrow keys (4-directional grid navigation)
function navigateChats(direction) {
  const messagesEl = document.getElementById('messages');
  if (!messagesEl) return;

  const cards = Array.from(messagesEl.querySelectorAll('.msg'));
  if (cards.length === 0) return;

  let currentIndex = keyboardFocusedChatId
    ? cards.findIndex(c => c.dataset.chatId === keyboardFocusedChatId)
    : -1;

  if (currentIndex === -1) {
    // No focus yet, focus first card
    keyboardFocusedChatId = cards[0].dataset.chatId;
  } else {
    // Get grid layout information
    const firstCard = cards[0];
    const cardRect = firstCard.getBoundingClientRect();
    const cardWidth = cardRect.width;
    const cardHeight = cardRect.height;
    const containerRect = messagesEl.getBoundingClientRect();
    const containerWidth = containerRect.width;

    // Calculate columns (approximate based on container and card width)
    const cols = Math.max(1, Math.floor(containerWidth / (cardWidth + 12))); // 12px gap

    let newIndex = currentIndex;

    if (direction === 'down') {
      newIndex = Math.min(currentIndex + cols, cards.length - 1);
    } else if (direction === 'up') {
      newIndex = Math.max(currentIndex - cols, 0);
    } else if (direction === 'right') {
      if ((currentIndex + 1) % cols !== 0) {
        newIndex = Math.min(currentIndex + 1, cards.length - 1);
      }
    } else if (direction === 'left') {
      if (currentIndex % cols !== 0) {
        newIndex = Math.max(currentIndex - 1, 0);
      }
    }

    keyboardFocusedChatId = cards[newIndex].dataset.chatId;
  }

  highlightKeyboardFocus();
}

// Highlight the currently focused card
function highlightKeyboardFocus() {
  const cards = document.querySelectorAll('.msg');
  cards.forEach(card => {
    if (card.dataset.chatId === keyboardFocusedChatId) {
      card.style.outline = '3px solid var(--color-accent)';
      card.style.outlineOffset = '2px';
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      card.style.outline = 'none';
    }
  });
}

// Toggle selection for keyboard-focused chat
function toggleKeyboardSelection(chatId) {
  if (AppState.selectedChats.has(chatId)) {
    AppState.selectedChats.delete(chatId);
  } else {
    AppState.selectedChats.add(chatId);
  }
  renderChats();
  highlightKeyboardFocus();
}

// Select all visible chats
function selectAllChats() {
  const messagesEl = document.getElementById('messages');
  if (!messagesEl) return;

  const cards = Array.from(messagesEl.querySelectorAll('.msg'));
  cards.forEach(card => {
    AppState.selectedChats.add(card.dataset.chatId);
  });
  renderChats();
}

// Get display name for a chat
function getDisplayNameForChat(chatId) {
  const chat = AppState.chats.find(c => c.chatId === chatId);
  return chat ? (chat.name || chatId) : chatId;
}

// Send quick reply by index (0-based)
function sendQuickReplyByIndex(index) {
  if (AppState.selectedChats.size === 0) {
    AppState.statusEl.textContent = 'Please select a chat first';
    return;
  }

  if (index >= AppState.quickReplies.length) {
    return;
  }

  const qr = AppState.quickReplies[index];
  for (const chatId of AppState.selectedChats) {
    socket.emit('sendPreset', { chatId, text: qr.text });
  }
  AppState.statusEl.textContent = `Sent: ${qr.text.substring(0, 30)}${qr.text.length > 30 ? '...' : ''}`;
}

// Show keyboard shortcuts guide
function showShortcutsGuide() {
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.style.backgroundColor = 'var(--overlay-modal)';

  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.style.width = '90%';
  panel.style.maxWidth = '700px';
  panel.style.borderRadius = '12px';
  panel.style.boxShadow = '0 8px 32px rgba(0,0,0,0.15)';
  panel.style.padding = '16px';
  panel.style.display = 'flex';
  panel.style.flexDirection = 'column';
  panel.style.maxHeight = '80vh';

  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'center';
  header.style.paddingBottom = '12px';
  header.style.borderBottom = '1px solid var(--border-light)';
  header.style.marginBottom = '16px';

  const title = document.createElement('div');
  title.textContent = '⌨️ Keyboard Shortcuts';
  title.style.fontSize = '18px';
  title.style.fontWeight = '600';
  title.style.color = 'var(--text-primary)';

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style.background = 'none';
  closeBtn.style.border = 'none';
  closeBtn.style.fontSize = '24px';
  closeBtn.style.color = 'var(--text-secondary)';
  closeBtn.style.cursor = 'pointer';
  closeBtn.style.padding = '0';

  header.appendChild(title);
  header.appendChild(closeBtn);
  panel.appendChild(header);

  const content = document.createElement('div');
  content.style.flex = '1';
  content.style.overflowY = 'auto';
  content.style.paddingRight = '8px';

  // Navigation section
  const navSection = createShortcutSection('Navigation', SHORTCUTS.navigation);
  content.appendChild(navSection);

  // Quick Replies section
  const qrSection = createShortcutSection('Quick Replies', SHORTCUTS.quickReplies);
  content.appendChild(qrSection);

  // UI section
  const uiSection = createShortcutSection('Interface', SHORTCUTS.ui);
  content.appendChild(uiSection);

  // Modals section
  const modalsSection = createShortcutSection('Modals', SHORTCUTS.modals);
  content.appendChild(modalsSection);

  panel.appendChild(content);
  modal.appendChild(panel);
  document.body.appendChild(modal);

  closeBtn.addEventListener('click', () => {
    document.body.removeChild(modal);
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      document.body.removeChild(modal);
    }
  });

  // Close on Escape
  const escapeHandler = (e) => {
    if (e.key === 'Escape') {
      document.body.removeChild(modal);
      document.removeEventListener('keydown', escapeHandler);
    }
  };
  document.addEventListener('keydown', escapeHandler);
}

// Create a section in the shortcuts guide
function createShortcutSection(title, shortcuts) {
  const section = document.createElement('div');
  section.style.marginBottom = '20px';

  const sectionTitle = document.createElement('div');
  sectionTitle.textContent = title;
  sectionTitle.style.fontSize = '14px';
  sectionTitle.style.fontWeight = '600';
  sectionTitle.style.color = 'var(--color-accent)';
  sectionTitle.style.marginBottom = '8px';
  sectionTitle.style.textTransform = 'uppercase';
  section.appendChild(sectionTitle);

  const list = document.createElement('div');
  list.style.display = 'flex';
  list.style.flexDirection = 'column';
  list.style.gap = '8px';

  for (const shortcut of shortcuts) {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.justifyContent = 'space-between';
    row.style.alignItems = 'center';
    row.style.padding = '8px';
    row.style.background = 'var(--bg-card-hover)';
    row.style.borderRadius = '6px';
    row.style.borderLeft = '3px solid var(--color-accent)';

    const label = document.createElement('span');
    label.textContent = shortcut.label;
    label.style.flex = '1';
    label.style.color = 'var(--text-primary)';
    label.style.fontSize = '13px';

    const keys = document.createElement('span');
    keys.textContent = shortcut.keys;
    keys.style.background = 'var(--bg-card)';
    keys.style.padding = '4px 8px';
    keys.style.borderRadius = '4px';
    keys.style.border = '1px solid var(--border-medium)';
    keys.style.fontSize = '12px';
    keys.style.fontFamily = 'monospace';
    keys.style.color = 'var(--text-secondary)';
    keys.style.fontWeight = '500';

    row.appendChild(label);
    row.appendChild(keys);
    list.appendChild(row);
  }

  section.appendChild(list);
  return section;
}
