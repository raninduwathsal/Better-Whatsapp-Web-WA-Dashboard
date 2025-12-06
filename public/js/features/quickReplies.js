/**
 * Quick Replies Feature Module
 * Handles all quick reply functionality
 */

const QUICK_REPLIES_API = '/api/quick-replies';

// Load quick replies from server
async function loadQuickRepliesFromServer() {
  try {
    const res = await fetch(QUICK_REPLIES_API);
    if (!res.ok) throw new Error('failed');
    AppState.quickReplies = await res.json();
  } catch (err) {
    console.error('Failed to load quick replies', err);
    AppState.quickReplies = [];
  }
  renderQuickReplies();
}

// Create quick reply on server
async function createQuickReplyOnServer(text) {
  const res = await fetch(QUICK_REPLIES_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });
  if (!res.ok) throw new Error('create failed');
  return await res.json();
}

// Update quick reply on server
async function updateQuickReplyOnServer(id, text) {
  const res = await fetch(`${QUICK_REPLIES_API}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });
  if (!res.ok) throw new Error('update failed');
  return await res.json();
}

// Delete quick reply on server
async function deleteQuickReplyOnServer(id) {
  const res = await fetch(`${QUICK_REPLIES_API}/${id}`, {
    method: 'DELETE'
  });
  if (!res.ok) throw new Error('delete failed');
  return await res.json();
}

// Render quick replies
function renderQuickReplies() {
  let container = document.getElementById('quick-replies-container');
  if (!container) {
    const messagesEl = document.getElementById('messages');
    if (!messagesEl) return;
    container = document.createElement('div');
    container.id = 'quick-replies-container';
    container.style.padding = '8px 12px';
    container.style.borderBottom = '1px solid var(--border-light)';
    messagesEl.parentNode.insertBefore(container, messagesEl);
  }

  container.innerHTML = '';

  if (!AppState.quickReplies || AppState.quickReplies.length === 0) {
    const empty = document.createElement('div');
    empty.style.color = 'var(--text-secondary)';
    empty.style.fontSize = '12px';
    empty.textContent = 'No quick replies configured';
    container.appendChild(empty);
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.style.display = 'flex';
  wrapper.style.flexWrap = 'wrap';
  wrapper.style.gap = '6px';

  const displayCount = AppState.showAllQuickReplies ? AppState.quickReplies.length : Math.min(3, AppState.quickReplies.length);

  for (let i = 0; i < displayCount; i++) {
    const qr = AppState.quickReplies[i];
    const btn = document.createElement('button');
    btn.className = 'qr-btn';
    btn.textContent = qr.text.length > 15 ? qr.text.substring(0, 15) + '...' : qr.text;
    btn.title = qr.text;
    btn.style.fontSize = '11px';
    btn.style.padding = '4px 8px';
    btn.addEventListener('click', () => {
      // Send the message to all selected chats
      if (AppState.selectedChats.size === 0) {
        alert('Please select at least one chat first');
        return;
      }

      for (const chatId of AppState.selectedChats) {
        socket.emit('sendPreset', { chatId, text: qr.text });
      }
    });
    wrapper.appendChild(btn);
  }

  if (AppState.quickReplies.length > 3) {
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'qr-btn';
    toggleBtn.textContent = AppState.showAllQuickReplies ? '▲ Less' : '▼ More';
    toggleBtn.style.fontSize = '11px';
    toggleBtn.style.padding = '4px 8px';
    toggleBtn.addEventListener('click', () => {
      AppState.showAllQuickReplies = !AppState.showAllQuickReplies;
      renderQuickReplies();
    });
    wrapper.appendChild(toggleBtn);
  }

  container.appendChild(wrapper);
}

// Open quick reply editor modal
function openQuickReplyEditor(initialText, onSave) {
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.style.backgroundColor = 'var(--overlay-modal)';

  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.style.width = '90%';
  panel.style.maxWidth = '500px';
  panel.style.borderRadius = '12px';
  panel.style.backgroundColor = 'var(--bg-card)';
  panel.style.boxShadow = 'var(--shadow-modal)';

  const header = document.createElement('div');
  header.className = 'header';
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'center';
  header.style.paddingBottom = '12px';
  header.style.borderBottom = '1px solid var(--border-light)';

  const hTitle = document.createElement('div');
  hTitle.textContent = initialText ? 'Edit Quick Reply' : 'New Quick Reply';
  hTitle.style.fontSize = '16px';
  hTitle.style.fontWeight = '500';
  hTitle.style.color = 'var(--text-primary)';

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style.background = 'none';
  closeBtn.style.border = 'none';
  closeBtn.style.fontSize = '20px';
  closeBtn.style.color = 'var(--text-secondary)';
  closeBtn.style.cursor = 'pointer';
  closeBtn.style.padding = '4px 8px';

  header.appendChild(hTitle);
  header.appendChild(closeBtn);

  const body = document.createElement('div');
  body.className = 'body';
  body.style.padding = '16px 0';

  const ta = document.createElement('textarea');
  ta.placeholder = 'Enter your quick reply text...';
  ta.style.width = '100%';
  ta.style.height = '160px';
  ta.style.padding = '12px';
  ta.style.background = 'var(--bg-input)';
  ta.style.color = 'var(--text-primary)';
  ta.style.border = '1px solid var(--border-medium)';
  ta.style.borderRadius = '8px';
  ta.style.fontSize = '14px';
  ta.style.fontFamily = 'inherit';
  ta.style.resize = 'none';
  ta.style.boxSizing = 'border-box';
  ta.style.transition = 'border-color 0.2s';
  ta.value = initialText || '';

  ta.addEventListener('focus', () => {
    ta.style.borderColor = 'var(--color-accent)';
    ta.style.outline = 'none';
  });
  ta.addEventListener('blur', () => {
    ta.style.borderColor = 'var(--border-medium)';
  });

  body.appendChild(ta);

  const composer = document.createElement('div');
  composer.className = 'composer';
  composer.style.display = 'flex';
  composer.style.gap = '8px';
  composer.style.justifyContent = 'flex-end';
  composer.style.marginTop = '16px';
  composer.style.paddingTop = '12px';
  composer.style.borderTop = '1px solid var(--border-light)';

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.padding = '8px 16px';
  cancelBtn.style.border = '1px solid var(--border-medium)';
  cancelBtn.style.borderRadius = '8px';
  cancelBtn.style.background = 'var(--bg-card)';
  cancelBtn.style.color = 'var(--text-secondary)';
  cancelBtn.style.cursor = 'pointer';
  cancelBtn.style.fontSize = '14px';
  cancelBtn.style.fontWeight = '500';
  cancelBtn.style.transition = 'all 0.2s';

  cancelBtn.addEventListener('mouseenter', () => {
    cancelBtn.style.backgroundColor = 'var(--bg-card-hover)';
    cancelBtn.style.borderColor = 'var(--text-secondary)';
  });
  cancelBtn.addEventListener('mouseleave', () => {
    cancelBtn.style.backgroundColor = 'var(--bg-card)';
    cancelBtn.style.borderColor = 'var(--border-medium)';
  });

  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save (Ctrl+Enter)';
  saveBtn.style.padding = '8px 20px';
  saveBtn.style.background = 'var(--color-accent)';
  saveBtn.style.color = '#fff';
  saveBtn.style.border = 'none';
  saveBtn.style.borderRadius = '8px';
  saveBtn.style.cursor = 'pointer';
  saveBtn.style.fontSize = '14px';
  saveBtn.style.fontWeight = '500';
  saveBtn.style.transition = 'all 0.2s';

  saveBtn.addEventListener('mouseenter', () => {
    saveBtn.style.backgroundColor = 'var(--color-accent-hover)';
    saveBtn.style.boxShadow = '0 2px 8px rgba(37,211,102,0.3)';
  });
  saveBtn.addEventListener('mouseleave', () => {
    saveBtn.style.backgroundColor = 'var(--color-accent)';
    saveBtn.style.boxShadow = 'none';
  });

  composer.appendChild(cancelBtn);
  composer.appendChild(saveBtn);

  panel.appendChild(header);
  panel.appendChild(body);
  panel.appendChild(composer);
  panel.style.padding = '16px';

  modal.appendChild(panel);
  document.body.appendChild(modal);

  function close(v) {
    document.body.removeChild(modal);
    onSave(v);
  }

  function handleSave() {
    close(ta.value.trim());
  }

  const handleModalKeydown = (e) => {
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close(null);
    }
  };

  closeBtn.addEventListener('click', () => close(null));
  cancelBtn.addEventListener('click', () => close(null));
  saveBtn.addEventListener('click', handleSave);
  document.addEventListener('keydown', handleModalKeydown);

  // Focus textarea automatically
  ta.focus();

  // Clean up keyboard handler when modal closes
  const originalClose = close;
  close = function (v) {
    document.removeEventListener('keydown', handleModalKeydown);
    originalClose(v);
  };
}

// Render quick replies settings panel
function renderQuickRepliesSettings() {
  let panel = document.getElementById('sidebar-quick-replies');
  if (!panel) {
    const contentContainer = document.getElementById('settings-content');
    if (contentContainer) {
      panel = document.createElement('div');
      panel.id = 'sidebar-quick-replies';
      panel.style.padding = '8px';
      panel.style.borderBottom = '1px solid var(--border-light)';
      contentContainer.appendChild(panel);
    } else {
      return;
    }
  }

  if (!AppState.quickRepliesSettingsOpen) {
    panel.style.display = 'none';
    return;
  }

  panel.style.display = 'block';
  panel.innerHTML = '';
  panel.style.padding = '12px';

  const title = document.createElement('div');
  title.style.fontWeight = 'bold';
  title.textContent = 'Quick Replies';
  title.style.marginBottom = '12px';
  panel.appendChild(title);

  const createBtn = document.createElement('button');
  createBtn.textContent = '+ Add Quick Reply';
  createBtn.className = 'qr-btn';
  createBtn.style.marginBottom = '12px';
  createBtn.addEventListener('click', () => {
    openQuickReplyEditor('', async (text) => {
      if (!text) return;
      await createQuickReplyOnServer(text);
      await loadQuickRepliesFromServer();
      renderQuickReplies();
      renderQuickRepliesSettings();
    });
  });
  panel.appendChild(createBtn);

  if (!AppState.quickReplies || AppState.quickReplies.length === 0) {
    const empty = document.createElement('div');
    empty.style.marginTop = '8px';
    empty.style.color = '#999';
    empty.textContent = 'No quick replies yet';
    panel.appendChild(empty);
    return;
  }

  AppState.quickReplies.forEach((qr, idx) => {
    const row = document.createElement('div');
    row.style.padding = '12px';
    row.style.background = idx % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-card-hover)';
    row.style.borderBottom = '1px solid var(--border-light)';
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '8px';

    const text = document.createElement('div');
    text.style.flex = '1';
    text.textContent = qr.text.length > 50 ? qr.text.substring(0, 50) + '...' : qr.text;
    text.title = qr.text;
    row.appendChild(text);

    const editBtn = document.createElement('button');
    editBtn.className = 'qr-btn';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => {
      openQuickReplyEditor(qr.text, async (text) => {
        if (!text) return;
        await updateQuickReplyOnServer(qr.id, text);
        await loadQuickRepliesFromServer();
        renderQuickReplies();
        renderQuickRepliesSettings();
      });
    });
    row.appendChild(editBtn);

    const delBtn = document.createElement('button');
    delBtn.className = 'qr-btn';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', async () => {
      if (confirm('Delete this quick reply?')) {
        await deleteQuickReplyOnServer(qr.id);
        await loadQuickRepliesFromServer();
        renderQuickReplies();
        renderQuickRepliesSettings();
      }
    });
    row.appendChild(delBtn);

    panel.appendChild(row);
  });
}
