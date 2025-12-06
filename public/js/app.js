/**
 * Main Application Initialization
 * Coordinates all modules and sets up the application
 */

// Get DOM elements
AppState.qrImg = document.getElementById('qr');
AppState.statusEl = document.getElementById('status');
AppState.messagesEl = document.getElementById('messages');
AppState.presetInput = document.getElementById('preset');
AppState.sendBtn = document.getElementById('sendBtn');
AppState.refreshBtn = document.getElementById('refresh');

// Initialize all features on page load
function initializeApp() {
  // Initialize keyboard shortcuts
  initKeyboardShortcuts();

  // Create settings sidebar
  createSettingsSidebar();

  // Load initial data from server
  loadTagsFromServer();
  loadNotesCountsFromServer();
  loadQuickRepliesFromServer();

  // Preset input send functionality
  if (AppState.sendBtn) {
    AppState.sendBtn.addEventListener('click', sendPreset);
  }

  if (AppState.refreshBtn) {
    AppState.refreshBtn.addEventListener('click', () => {
      socket.emit('requestMessages');
    });
  }

  // Allow pressing Enter in the preset input to send the preset
  if (AppState.presetInput) {
    AppState.presetInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendPreset();
      }
    });
  }
}

function sendPreset() {
  const ids = Array.from(AppState.selectedChats);
  const text = AppState.presetInput.value && AppState.presetInput.value.trim();
  if (!ids.length) {
    AppState.statusEl.textContent = 'No chat selected';
    return;
  }
  if (!text) {
    AppState.statusEl.textContent = 'No preset text';
    return;
  }
  for (const id of ids) {
    socket.emit('sendPreset', { chatId: id, text });
  }
}

function createSettingsSidebar() {
  const header = document.querySelector('header');
  if (!header) return;

  // Check if sidebar already exists
  if (document.getElementById('settings-sidebar')) return;

  const sidebar = document.createElement('div');
  sidebar.id = 'settings-sidebar';
  sidebar.style.position = 'fixed';
  sidebar.style.left = '-308px';
  sidebar.style.top = '60px';
  sidebar.style.width = '300px';
  sidebar.style.height = 'calc(100vh - 60px)';
  sidebar.style.background = 'var(--bg-card)';
  sidebar.style.borderRight = '1px solid var(--border-medium)';
  sidebar.style.overflowY = 'auto';
  sidebar.style.zIndex = '1000';
  sidebar.style.transition = 'left 0.3s ease';
  sidebar.style.boxShadow = '2px 0 10px rgba(0,0,0,0.1)';
  sidebar.style.display = 'flex';
  sidebar.style.flexDirection = 'column';

  document.body.appendChild(sidebar);

  // Create settings header in sidebar
  const sidebarHeader = document.createElement('div');
  sidebarHeader.style.padding = '12px';
  sidebarHeader.style.borderBottom = '1px solid var(--border-medium)';
  sidebarHeader.style.fontWeight = 'bold';
  sidebarHeader.textContent = 'Settings';
  sidebar.appendChild(sidebarHeader);

  // Create toggles container (fixed at top)
  const togglesContainer = document.createElement('div');
  togglesContainer.style.display = 'flex';
  togglesContainer.style.flexDirection = 'column';
  togglesContainer.style.borderBottom = '1px solid var(--border-medium)';
  togglesContainer.style.flexShrink = '0';

  // Tags settings toggle
  const tagsToggle = document.createElement('div');
  tagsToggle.style.padding = '8px 12px';
  tagsToggle.style.borderBottom = '1px solid var(--border-light)';
  tagsToggle.style.cursor = 'pointer';
  tagsToggle.style.display = 'flex';
  tagsToggle.style.justifyContent = 'space-between';
  tagsToggle.style.alignItems = 'center';
  const tagsLabel = document.createElement('span');
  tagsLabel.textContent = 'Tags';
  const tagsChevron = document.createElement('span');
  tagsChevron.textContent = '▼';
  tagsChevron.style.fontSize = '10px';
  tagsToggle.appendChild(tagsLabel);
  tagsToggle.appendChild(tagsChevron);
  tagsToggle.addEventListener('click', () => {
    AppState.tagsSettingsOpen = !AppState.tagsSettingsOpen;
    tagsChevron.textContent = AppState.tagsSettingsOpen ? '▲' : '▼';
    renderTagsSettings();
  });
  togglesContainer.appendChild(tagsToggle);

  // Notes settings toggle
  const notesToggle = document.createElement('div');
  notesToggle.style.padding = '8px 12px';
  notesToggle.style.borderBottom = '1px solid var(--border-light)';
  notesToggle.style.cursor = 'pointer';
  notesToggle.style.display = 'flex';
  notesToggle.style.justifyContent = 'space-between';
  notesToggle.style.alignItems = 'center';
  const notesLabel = document.createElement('span');
  notesLabel.textContent = 'Notes';
  const notesChevron = document.createElement('span');
  notesChevron.textContent = '▼';
  notesChevron.style.fontSize = '10px';
  notesToggle.appendChild(notesLabel);
  notesToggle.appendChild(notesChevron);
  notesToggle.addEventListener('click', () => {
    AppState.notesSettingsOpen = !AppState.notesSettingsOpen;
    notesChevron.textContent = AppState.notesSettingsOpen ? '▲' : '▼';
    renderNotesSettings();
  });
  togglesContainer.appendChild(notesToggle);

  // Quick Replies settings toggle
  const quickRepliesToggle = document.createElement('div');
  quickRepliesToggle.style.padding = '8px 12px';
  quickRepliesToggle.style.borderBottom = '1px solid var(--border-light)';
  quickRepliesToggle.style.cursor = 'pointer';
  quickRepliesToggle.style.display = 'flex';
  quickRepliesToggle.style.justifyContent = 'space-between';
  quickRepliesToggle.style.alignItems = 'center';
  const quickRepliesLabel = document.createElement('span');
  quickRepliesLabel.textContent = 'Quick Replies';
  const quickRepliesChevron = document.createElement('span');
  quickRepliesChevron.textContent = '▼';
  quickRepliesChevron.style.fontSize = '10px';
  quickRepliesToggle.appendChild(quickRepliesLabel);
  quickRepliesToggle.appendChild(quickRepliesChevron);
  quickRepliesToggle.addEventListener('click', () => {
    AppState.quickRepliesSettingsOpen = !AppState.quickRepliesSettingsOpen;
    quickRepliesChevron.textContent = AppState.quickRepliesSettingsOpen ? '▲' : '▼';
    renderQuickRepliesSettings();
  });
  togglesContainer.appendChild(quickRepliesToggle);

  // Keyboard Shortcuts button
  const shortcutsBtn = document.createElement('div');
  shortcutsBtn.style.padding = '8px 12px';
  shortcutsBtn.style.borderBottom = '1px solid var(--border-light)';
  shortcutsBtn.style.cursor = 'pointer';
  shortcutsBtn.style.display = 'flex';
  shortcutsBtn.style.justifyContent = 'space-between';
  shortcutsBtn.style.alignItems = 'center';
  shortcutsBtn.style.background = 'var(--bg-status)';
  shortcutsBtn.textContent = '⌨️ Keyboard Shortcuts';
  shortcutsBtn.style.fontWeight = '500';
  shortcutsBtn.style.color = 'var(--color-accent)';
  shortcutsBtn.addEventListener('mouseenter', () => {
    shortcutsBtn.style.backgroundColor = 'var(--bg-card-hover)';
  });
  shortcutsBtn.addEventListener('mouseleave', () => {
    shortcutsBtn.style.backgroundColor = 'var(--bg-status)';
  });
  shortcutsBtn.addEventListener('click', () => {
    showShortcutsGuide();
  });
  togglesContainer.appendChild(shortcutsBtn);

  // Logout button
  const logoutBtn = document.createElement('div');
  logoutBtn.style.padding = '8px 12px';
  logoutBtn.style.borderBottom = '1px solid var(--border-light)';
  logoutBtn.style.cursor = 'pointer';
  logoutBtn.style.display = 'flex';
  logoutBtn.style.justifyContent = 'space-between';
  logoutBtn.style.alignItems = 'center';
  logoutBtn.style.background = 'var(--bg-card)';
  logoutBtn.textContent = '🚪 Logout from WhatsApp';
  logoutBtn.style.fontWeight = '500';
  logoutBtn.style.color = '#e74c3c';
  logoutBtn.addEventListener('mouseenter', () => {
    logoutBtn.style.backgroundColor = 'var(--bg-card-hover)';
  });
  logoutBtn.addEventListener('mouseleave', () => {
    logoutBtn.style.backgroundColor = 'var(--bg-card)';
  });
  logoutBtn.addEventListener('click', async () => {
    if (confirm('Are you sure you want to logout from WhatsApp? You will need to scan the QR code again.')) {
      try {
        const response = await fetch('/api/logout', { method: 'POST' });
        if (response.ok) {
          alert('Logged out successfully. The page will reload.');
          window.location.reload();
        } else {
          alert('Failed to logout. Please try again.');
        }
      } catch (err) {
        console.error('Logout error:', err);
        alert('Error during logout: ' + err.message);
      }
    }
  });
  togglesContainer.appendChild(logoutBtn);

  sidebar.appendChild(togglesContainer);

  // Create content container (scrollable)
  const contentContainer = document.createElement('div');
  contentContainer.id = 'settings-content';
  contentContainer.style.flex = '1';
  contentContainer.style.overflowY = 'auto';
  contentContainer.style.padding = '8px 0';
  sidebar.appendChild(contentContainer);

  // Setup hamburger menu button
  const existingHamburger = document.getElementById('hamburger-menu');
  if (existingHamburger) {
    existingHamburger.style.display = 'block';
    existingHamburger.innerHTML = '☰';
    existingHamburger.style.background = 'none';
    existingHamburger.style.border = 'none';
    existingHamburger.style.fontSize = '24px';
    existingHamburger.style.cursor = 'pointer';
    existingHamburger.style.padding = '8px 12px';
    existingHamburger.style.marginRight = '12px';
    existingHamburger.style.color = 'var(--text-secondary)';
    existingHamburger.addEventListener('click', () => toggleSidebar());
  }

  // Setup quick reply add button
  const quickReplyAddBtn = document.getElementById('quick-reply-add-btn');
  if (quickReplyAddBtn) {
    quickReplyAddBtn.addEventListener('click', () => {
      openQuickReplyEditor('', async (text) => {
        if (!text) return;
        await createQuickReplyOnServer(text);
        await loadQuickRepliesFromServer();
        renderQuickReplies();
        renderQuickRepliesSettings();
      });
    });
  }
}

function toggleSidebar() {
  const sidebar = document.getElementById('settings-sidebar');
  const messages = document.getElementById('messages');
  if (!sidebar) return;

  AppState.sidebarVisible = !AppState.sidebarVisible;
  if (AppState.sidebarVisible) {
    sidebar.style.left = '0';
    if (messages) messages.style.marginLeft = '308px';
  } else {
    sidebar.style.left = '-308px';
    if (messages) messages.style.marginLeft = '0';
  }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', initializeApp);
