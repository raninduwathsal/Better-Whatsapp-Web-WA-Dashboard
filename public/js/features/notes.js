/**
 * Notes Feature Module
 * Handles all note-related functionality
 */

const NOTES_API = '/api/notes';

// Load notes counts from server
async function loadNotesCountsFromServer() {
  try {
    const res = await fetch('/api/notes/counts');
    if (!res.ok) throw new Error('failed');
    const rows = await res.json();
    AppState.notesCounts = {};
    for (const r of rows) AppState.notesCounts[r.chatId] = Number(r.count) || 0;
  } catch (err) {
    console.error('Failed to load note counts', err);
    AppState.notesCounts = {};
  }
  renderChats();
}

// Load notes for a specific chat
async function loadNotesForChat(chatId) {
  try {
    const res = await fetch(`${NOTES_API}?chatId=${encodeURIComponent(chatId)}`);
    if (!res.ok) throw new Error('failed');
    return await res.json();
  } catch (err) {
    console.error('Failed to load notes for chat', err);
    return [];
  }
}

// Create note on server
async function createNoteOnServer(chatId, text) {
  const res = await fetch(NOTES_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId, text })
  });
  if (!res.ok) throw new Error('create failed');
  return await res.json();
}

// Update note on server
async function updateNoteOnServer(id, text) {
  const res = await fetch(`${NOTES_API}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });
  if (!res.ok) throw new Error('update failed');
  return await res.json();
}

// Delete note on server
async function deleteNoteOnServer(id) {
  const res = await fetch(`${NOTES_API}/${id}`, {
    method: 'DELETE'
  });
  if (!res.ok) throw new Error('delete failed');
  return await res.json();
}

// Open notes modal
function openNotesModal(chatId, title) {
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.style.backgroundColor = 'var(--overlay-modal)';

  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.style.width = '90%';
  panel.style.maxWidth = '600px';
  panel.style.borderRadius = '12px';
  panel.style.backgroundColor = 'var(--bg-card)';
  panel.style.boxShadow = 'var(--shadow-modal)';
  panel.style.padding = '16px';
  panel.style.display = 'flex';
  panel.style.flexDirection = 'column';
  panel.style.height = '70vh';

  const header = document.createElement('div');
  header.className = 'header';
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'center';
  header.style.paddingBottom = '12px';
  header.style.borderBottom = '1px solid var(--border-light)';
  header.style.marginBottom = '16px';

  const hTitle = document.createElement('div');
  hTitle.textContent = `Notes for ${title}`;
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

  const composer = document.createElement('div');
  composer.className = 'composer';
  composer.style.display = 'flex';
  composer.style.gap = '8px';
  composer.style.marginBottom = '12px';
  composer.style.flexShrink = '0';

  const ta = document.createElement('textarea');
  ta.placeholder = 'Add a note...';
  ta.style.flex = '1';
  ta.style.height = '80px';
  ta.style.padding = '10px 12px';
  ta.style.background = 'var(--bg-input)';
  ta.style.color = 'var(--text-primary)';
  ta.style.border = '1px solid var(--border-medium)';
  ta.style.borderRadius = '8px';
  ta.style.fontFamily = 'inherit';
  ta.style.fontSize = '14px';
  ta.style.resize = 'none';
  ta.style.boxSizing = 'border-box';
  ta.style.transition = 'border-color 0.2s';

  ta.addEventListener('focus', () => {
    ta.style.borderColor = 'var(--color-accent)';
    ta.style.outline = 'none';
  });
  ta.addEventListener('blur', () => {
    ta.style.borderColor = 'var(--border-medium)';
  });

  const addBtn = document.createElement('button');
  addBtn.textContent = 'Add (Ctrl+Enter)';
  addBtn.style.padding = '10px 16px';
  addBtn.style.background = 'var(--color-accent)';
  addBtn.style.color = '#fff';
  addBtn.style.border = 'none';
  addBtn.style.borderRadius = '8px';
  addBtn.style.cursor = 'pointer';
  addBtn.style.fontSize = '14px';
  addBtn.style.fontWeight = '500';
  addBtn.style.transition = 'all 0.2s';
  addBtn.style.flexShrink = '0';

  addBtn.addEventListener('mouseenter', () => {
    addBtn.style.backgroundColor = 'var(--color-accent-hover)';
    addBtn.style.boxShadow = '0 2px 8px rgba(37,211,102,0.3)';
  });
  addBtn.addEventListener('mouseleave', () => {
    addBtn.style.backgroundColor = 'var(--color-accent)';
    addBtn.style.boxShadow = 'none';
  });

  composer.appendChild(ta);
  composer.appendChild(addBtn);

  const body = document.createElement('div');
  body.className = 'body';
  body.style.flex = '1';
  body.style.overflowY = 'auto';
  body.style.display = 'flex';
  body.style.flexDirection = 'column';
  body.style.gap = '8px';
  body.style.paddingRight = '4px';

  const notesList = document.createElement('div');
  notesList.style.display = 'flex';
  notesList.style.flexDirection = 'column';
  notesList.style.gap = '8px';

  panel.appendChild(header);
  panel.appendChild(composer);
  body.appendChild(notesList);
  panel.appendChild(body);
  modal.appendChild(panel);
  document.body.appendChild(modal);

  closeBtn.addEventListener('click', () => {
    document.body.removeChild(modal);
  });

  const handleModalKeydown = (e) => {
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      addBtn.click();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeBtn.click();
    }
  };

  document.addEventListener('keydown', handleModalKeydown);

  addBtn.addEventListener('click', async () => {
    const text = ta.value && ta.value.trim();
    if (!text) return;
    try {
      await createNoteOnServer(chatId, text);
      ta.value = '';
      await loadNotesCountsFromServer();
      const notes = await loadNotesForChat(chatId);
      renderNotesList(notesList, chatId, notes);
    } catch (err) {
      console.error(err);
      alert('Failed to create note');
    }
  });

  // Load and display existing notes
  loadNotesForChat(chatId).then(notes => {
    renderNotesList(notesList, chatId, notes);
  });
}

// Render notes list
function renderNotesList(container, chatId, notes) {
  container.innerHTML = '';
  if (!notes || notes.length === 0) {
    const empty = document.createElement('div');
    empty.style.color = 'var(--text-secondary)';
    empty.style.textAlign = 'center';
    empty.style.padding = '32px 16px';
    empty.style.fontSize = '14px';
    empty.textContent = 'No notes yet';
    container.appendChild(empty);
    return;
  }

  for (const note of notes) {
    const noteEl = document.createElement('div');
    noteEl.style.padding = '12px';
    noteEl.style.background = 'var(--bg-card-hover)';
    noteEl.style.border = '1px solid var(--border-light)';
    noteEl.style.borderRadius = '8px';
    noteEl.style.transition = 'all 0.2s';

    noteEl.addEventListener('mouseenter', () => {
      noteEl.style.backgroundColor = 'var(--bg-card)';
      noteEl.style.borderColor = 'var(--border-medium)';
    });
    noteEl.addEventListener('mouseleave', () => {
      noteEl.style.backgroundColor = 'var(--bg-card-hover)';
      noteEl.style.borderColor = 'var(--border-light)';
    });

    const text = document.createElement('div');
    text.style.marginBottom = '8px';
    text.style.color = 'var(--text-primary)';
    text.style.fontSize = '14px';
    text.style.lineHeight = '1.4';
    text.style.wordWrap = 'break-word';
    text.textContent = note.text;
    noteEl.appendChild(text);

    const controls = document.createElement('div');
    controls.style.display = 'flex';
    controls.style.gap = '12px';
    controls.style.fontSize = '12px';
    controls.style.alignItems = 'center';
    controls.style.justifyContent = 'space-between';

    const timestamp = document.createElement('span');
    timestamp.style.color = 'var(--text-secondary)';
    timestamp.style.fontSize = '12px';
    timestamp.textContent = new Date(note.created_at).toLocaleString();
    controls.appendChild(timestamp);

    const buttonsWrapper = document.createElement('div');
    buttonsWrapper.style.display = 'flex';
    buttonsWrapper.style.gap = '8px';

    const editBtn = document.createElement('button');
    editBtn.textContent = 'Edit';
    editBtn.style.background = 'none';
    editBtn.style.border = 'none';
    editBtn.style.color = 'var(--color-accent)';
    editBtn.style.cursor = 'pointer';
    editBtn.style.padding = '4px 8px';
    editBtn.style.fontSize = '12px';
    editBtn.style.fontWeight = '500';
    editBtn.style.transition = 'all 0.2s';
    editBtn.style.borderRadius = '4px';

    editBtn.addEventListener('mouseenter', () => {
      editBtn.style.background = 'rgba(37,211,102,0.1)';
    });
    editBtn.addEventListener('mouseleave', () => {
      editBtn.style.background = 'none';
    });

    editBtn.addEventListener('click', () => {
      const newText = prompt('Edit note:', note.text);
      if (newText && newText.trim()) {
        updateNoteOnServer(note.id, newText.trim()).then(() => {
          loadNotesForChat(chatId).then(notes => {
            renderNotesList(container, chatId, notes);
          });
        });
      }
    });
    buttonsWrapper.appendChild(editBtn);

    const delBtn = document.createElement('button');
    delBtn.textContent = 'Delete';
    delBtn.style.background = 'none';
    delBtn.style.border = 'none';
    delBtn.style.color = '#E74C3C';
    delBtn.style.cursor = 'pointer';
    delBtn.style.padding = '4px 8px';
    delBtn.style.fontSize = '12px';
    delBtn.style.fontWeight = '500';
    delBtn.style.transition = 'all 0.2s';
    delBtn.style.borderRadius = '4px';

    delBtn.addEventListener('mouseenter', () => {
      delBtn.style.background = 'rgba(231,76,60,0.1)';
    });
    delBtn.addEventListener('mouseleave', () => {
      delBtn.style.background = 'none';
    });

    delBtn.addEventListener('click', async () => {
      if (confirm('Delete this note?')) {
        await deleteNoteOnServer(note.id);
        await loadNotesCountsFromServer();
        const notes = await loadNotesForChat(chatId);
        renderNotesList(container, chatId, notes);
      }
    });
    buttonsWrapper.appendChild(delBtn);

    controls.appendChild(buttonsWrapper);
    noteEl.appendChild(controls);
    container.appendChild(noteEl);
  }
}

// Show notes preview bubble
function showNotesPreviewBubble(anchorEl, chatId) {
  hideNotesPreviewBubble(anchorEl);

  // Set a timeout to show preview after 1.5 seconds
  const timeoutId = setTimeout(() => {
    loadNotesForChat(chatId).then(notes => {
      if (!notes || notes.length === 0) return;

      const bubble = document.createElement('div');
      bubble.style.position = 'fixed';
      bubble.style.background = 'var(--bg-card)';
      bubble.style.border = '1px solid var(--border-medium)';
      bubble.style.borderRadius = '6px';
      bubble.style.padding = '8px';
      bubble.style.maxWidth = '200px';
      bubble.style.maxHeight = '200px';
      bubble.style.overflowY = 'auto';
      bubble.style.zIndex = '10000';
      bubble.style.fontSize = '12px';
      bubble.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';

      const rect = anchorEl.getBoundingClientRect();
      bubble.style.left = (rect.right + 8) + 'px';
      bubble.style.top = (rect.top) + 'px';

      const title = document.createElement('div');
      title.style.fontWeight = 'bold';
      title.style.marginBottom = '6px';
      title.textContent = `${notes.length} note${notes.length !== 1 ? 's' : ''}`;
      bubble.appendChild(title);

      for (const note of notes) {
        const line = document.createElement('div');
        line.style.marginBottom = '6px';
        line.style.paddingBottom = '6px';
        line.style.borderBottom = '1px solid var(--border-light)';
        line.textContent = note.text.substring(0, 50) + (note.text.length > 50 ? '...' : '');
        bubble.appendChild(line);
      }

      document.body.appendChild(bubble);
      anchorEl._noteBubble = bubble;
    });
  }, 1500);

  // Store the timeout ID so we can cancel it if mouse leaves
  anchorEl._noteTimeout = timeoutId;
}

// Hide notes preview bubble
function hideNotesPreviewBubble(anchorEl) {
  // Cancel the timeout if mouse leaves before 1.5 seconds
  if (anchorEl && anchorEl._noteTimeout) {
    clearTimeout(anchorEl._noteTimeout);
    anchorEl._noteTimeout = null;
  }

  if (anchorEl && anchorEl._noteBubble) {
    try {
      anchorEl._noteBubble.remove();
    } catch (e) { }
    anchorEl._noteBubble = null;
  }
}

// Render notes settings panel
function renderNotesSettings() {
  let panel = document.getElementById('sidebar-notes');
  if (!panel) {
    const contentContainer = document.getElementById('settings-content');
    if (contentContainer) {
      panel = document.createElement('div');
      panel.id = 'sidebar-notes';
      panel.style.padding = '8px';
      panel.style.borderBottom = '1px solid var(--border-light)';
      contentContainer.appendChild(panel);
    } else {
      return;
    }
  }

  if (!AppState.notesSettingsOpen) {
    panel.style.display = 'none';
    return;
  }

  panel.style.display = 'block';
  panel.innerHTML = '';
  panel.style.padding = '12px';

  const title = document.createElement('div');
  title.style.fontWeight = 'bold';
  title.textContent = 'Notes Settings';
  title.style.marginBottom = '12px';
  panel.appendChild(title);

  const btnRow = document.createElement('div');
  btnRow.style.display = 'flex';
  btnRow.style.gap = '8px';
  btnRow.style.marginBottom = '12px';

  const exportBtn = document.createElement('button');
  exportBtn.className = 'qr-btn';
  exportBtn.textContent = 'Export All Notes';

  const importBtn = document.createElement('button');
  importBtn.className = 'qr-btn';
  importBtn.textContent = 'Import Notes (Append)';

  btnRow.appendChild(exportBtn);
  btnRow.appendChild(importBtn);
  panel.appendChild(btnRow);

  const info = document.createElement('div');
  info.style.marginTop = '8px';
  info.style.color = 'var(--text-secondary)';
  info.style.fontSize = '12px';
  info.textContent = 'Export creates a JSON backup of all notes. Import will append notes to matching chats using chatId or phone number fallback.';
  panel.appendChild(info);

  // hidden input for import
  let importInput = document.getElementById('notes-import-all-input');
  if (!importInput) {
    importInput = document.createElement('input');
    importInput.type = 'file';
    importInput.id = 'notes-import-all-input';
    importInput.accept = '.json,application/json';
    importInput.style.display = 'none';
    document.body.appendChild(importInput);
  }

  exportBtn.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/notes/export');
      if (!res.ok) {
        AppState.statusEl.textContent = 'Export failed';
        return;
      }
      const rows = await res.json();
      const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `notes-all-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      AppState.statusEl.textContent = 'Exported all notes';
    } catch (err) {
      console.error(err);
      AppState.statusEl.textContent = 'Export failed';
    }
  });

  importBtn.addEventListener('click', () => {
    importInput.value = '';
    importInput.click();
  });

  importInput.addEventListener('change', async (ev) => {
    const f = ev.target.files && ev.target.files[0];
    if (!f) return;
    try {
      const txt = await f.text();
      const parsed = JSON.parse(txt);
      const items = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.notes) ? parsed.notes : []);
      if (!items.length) {
        AppState.statusEl.textContent = 'No notes to import';
        return;
      }
      const res = await fetch('/api/notes/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: items, replace: false })
      });
      if (!res.ok) {
        AppState.statusEl.textContent = 'Import failed';
        return;
      }
      const js = await res.json();
      AppState.statusEl.textContent = `Import: ${js.imported || 0} imported, ${js.failed || 0} failed`;
      await loadNotesCountsFromServer();
      renderNotesSettings();
    } catch (err) {
      console.error(err);
      AppState.statusEl.textContent = 'Import failed';
    }
  });
}
