/**
 * Context Menu UI Module
 * Handles right-click context menu for chats
 */

function openTagContextMenu(x, y, chatId) {
  if (AppState.currentContextMenu) {
    AppState.currentContextMenu.remove();
    AppState.currentContextMenu = null;
  }

  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.style.position = 'fixed';
  menu.style.left = (x) + 'px';
  menu.style.top = (y) + 'px';
  menu.style.background = 'var(--bg-context-menu)';
  menu.style.border = '1px solid var(--border-medium)';
  menu.style.borderRadius = '6px';
  menu.style.padding = '0';
  menu.style.zIndex = 9999;
  menu.style.minWidth = '240px';
  menu.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
  menu.style.overflow = 'hidden';

  const title = document.createElement('div');
  title.style.fontWeight = 'bold';
  title.style.padding = '10px 12px';
  title.style.fontSize = '13px';
  title.style.color = 'var(--text-secondary)';
  title.style.borderBottom = '1px solid var(--border-light)';
  title.textContent = 'Tags';
  menu.appendChild(title);

  // Get Archived tag ID to filter it out
  const archivedTag = AppState.tags.find(t => t.name === 'Archived' && t.is_system);
  const archivedTagId = archivedTag ? archivedTag.id : null;
  const isArchived = archivedTagId ? (AppState.tagAssignments[chatId] || []).some(id => String(id) === String(archivedTagId)) : false;

  // list tags as clickable menu items (excluding Archived tag)
  const nonSystemTags = AppState.tags.filter(t => !(t.name === 'Archived' && t.is_system));
  if (nonSystemTags && nonSystemTags.length > 0) {
    for (const t of nonSystemTags) {
      const isAssigned = (AppState.tagAssignments[chatId] || []).some(id => String(id) === String(t.id));
      const row = document.createElement('div');
      row.style.padding = '10px 12px';
      row.style.cursor = 'pointer';
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.userSelect = 'none';
      row.style.fontSize = '13px';
      row.style.backgroundColor = isAssigned ? 'var(--bg-card-hover)' : 'transparent';
      row.style.borderBottom = '1px solid var(--border-light)';

      row.addEventListener('mouseenter', () => {
        row.style.backgroundColor = 'var(--bg-card-hover)';
      });
      row.addEventListener('mouseleave', () => {
        row.style.backgroundColor = isAssigned ? 'var(--bg-card-hover)' : 'transparent';
      });

      const checkmark = document.createElement('span');
      checkmark.style.width = '16px';
      checkmark.style.marginRight = '10px';
      checkmark.style.display = 'inline-block';
      checkmark.textContent = isAssigned ? '✓' : '';
      checkmark.style.fontWeight = 'bold';
      checkmark.style.color = t.color || 'var(--text-secondary)';

      const colorDot = document.createElement('span');
      colorDot.style.width = '10px';
      colorDot.style.height = '10px';
      colorDot.style.borderRadius = '5px';
      colorDot.style.background = t.color || 'var(--text-secondary)';
      colorDot.style.display = 'inline-block';
      colorDot.style.marginRight = '8px';
      colorDot.style.flexShrink = 0;

      const lbl = document.createElement('span');
      lbl.textContent = t.name;
      lbl.style.flex = 1;

      row.appendChild(checkmark);
      row.appendChild(colorDot);
      row.appendChild(lbl);

      row.addEventListener('click', async () => {
        try {
          if (isAssigned) {
            await unassignTagOnServer(t.id, chatId);
          } else {
            await assignTagOnServer(t.id, chatId);
          }
          await loadTagsFromServer();
          if (AppState.currentContextMenu) {
            AppState.currentContextMenu.remove();
            AppState.currentContextMenu = null;
          }
        } catch (err) {
          console.error(err);
          alert('Failed to update tag assignment');
        }
      });

      menu.appendChild(row);
    }
  } else {
    const empty = document.createElement('div');
    empty.style.padding = '10px 12px';
    empty.style.fontSize = '13px';
    empty.style.color = 'var(--text-secondary)';
    empty.textContent = 'No tags yet';
    menu.appendChild(empty);
  }

  // separator
  const sep = document.createElement('div');
  sep.style.height = '1px';
  sep.style.background = 'var(--border-light)';
  menu.appendChild(sep);

  // create new tag action
  const createRow = document.createElement('div');
  createRow.style.padding = '10px 12px';
  createRow.style.cursor = 'pointer';
  createRow.style.fontSize = '13px';
  createRow.style.userSelect = 'none';
  createRow.textContent = '+ Create New Tag';
  createRow.addEventListener('mouseenter', () => {
    createRow.style.backgroundColor = 'var(--bg-card-hover)';
  });
  createRow.addEventListener('mouseleave', () => {
    createRow.style.backgroundColor = 'transparent';
  });
  createRow.addEventListener('click', () => {
    if (AppState.currentContextMenu) {
      AppState.currentContextMenu.remove();
      AppState.currentContextMenu = null;
    }
    openTagEditor('', '#ffcc00', async (v) => {
      if (!v) return;
      const created = await createTagOnServer(v.name, v.color);
      await assignTagOnServer(created.id, chatId);
      await loadTagsFromServer();
    });
  });
  menu.appendChild(createRow);

  // Notes actions
  const notesTitle = document.createElement('div');
  notesTitle.style.padding = '8px 12px';
  notesTitle.style.fontSize = '13px';
  notesTitle.style.color = 'var(--text-secondary)';
  notesTitle.style.borderTop = '1px solid var(--border-light)';
  notesTitle.textContent = 'Notes';
  menu.appendChild(notesTitle);

  const addNoteRow = document.createElement('div');
  addNoteRow.style.padding = '10px 12px';
  addNoteRow.style.cursor = 'pointer';
  addNoteRow.style.fontSize = '13px';
  addNoteRow.style.userSelect = 'none';
  addNoteRow.textContent = '+ Add Note';
  addNoteRow.addEventListener('mouseenter', () => {
    addNoteRow.style.backgroundColor = 'var(--bg-card-hover)';
  });
  addNoteRow.addEventListener('mouseleave', () => {
    addNoteRow.style.backgroundColor = 'transparent';
  });
  addNoteRow.addEventListener('click', () => {
    if (AppState.currentContextMenu) {
      AppState.currentContextMenu.remove();
      AppState.currentContextMenu = null;
    }
    const c = AppState.chats.find(x => x.chatId === chatId);
    const title = c ? (c.name || c.chatId) : chatId;
    openNotesModal(chatId, title);
  });
  menu.appendChild(addNoteRow);

  const viewNotesRow = document.createElement('div');
  viewNotesRow.style.padding = '10px 12px';
  viewNotesRow.style.cursor = 'pointer';
  viewNotesRow.style.fontSize = '13px';
  viewNotesRow.style.userSelect = 'none';
  viewNotesRow.textContent = 'Edit Notes';
  viewNotesRow.addEventListener('mouseenter', () => {
    viewNotesRow.style.backgroundColor = 'var(--bg-card-hover)';
  });
  viewNotesRow.addEventListener('mouseleave', () => {
    viewNotesRow.style.backgroundColor = 'transparent';
  });
  viewNotesRow.addEventListener('click', () => {
    if (AppState.currentContextMenu) {
      AppState.currentContextMenu.remove();
      AppState.currentContextMenu = null;
    }
    const c = AppState.chats.find(x => x.chatId === chatId);
    const title = c ? (c.name || c.chatId) : chatId;
    openNotesModal(chatId, title);
  });
  menu.appendChild(viewNotesRow);

  // Archive action
  const actionsTitle = document.createElement('div');
  actionsTitle.style.padding = '8px 12px';
  actionsTitle.style.fontSize = '13px';
  actionsTitle.style.color = 'var(--text-secondary)';
  actionsTitle.style.borderTop = '1px solid var(--border-light)';
  actionsTitle.textContent = 'Actions';
  menu.appendChild(actionsTitle);

  // Open full chat action
  const openChatRow = document.createElement('div');
  openChatRow.style.padding = '10px 12px';
  openChatRow.style.cursor = 'pointer';
  openChatRow.style.fontSize = '13px';
  openChatRow.style.userSelect = 'none';
  openChatRow.textContent = '💬 Open Full Chat';

  openChatRow.addEventListener('mouseenter', () => {
    openChatRow.style.backgroundColor = 'var(--bg-card-hover)';
  });
  openChatRow.addEventListener('mouseleave', () => {
    openChatRow.style.backgroundColor = 'transparent';
  });
  openChatRow.addEventListener('click', () => {
    if (AppState.currentContextMenu) {
      AppState.currentContextMenu.remove();
      AppState.currentContextMenu = null;
    }
    const c = AppState.chats.find(x => x.chatId === chatId);
    const title = c ? (c.name || c.chatId) : chatId;
    openFullChat(chatId, title);
  });
  menu.appendChild(openChatRow);

  const archiveRow = document.createElement('div');
  archiveRow.style.padding = '10px 12px';
  archiveRow.style.cursor = 'pointer';
  archiveRow.style.fontSize = '13px';
  archiveRow.style.userSelect = 'none';
  archiveRow.textContent = isArchived ? '📂 Unarchive Chat' : '📦 Archive Chat';

  archiveRow.addEventListener('mouseenter', () => {
    archiveRow.style.backgroundColor = 'var(--bg-card-hover)';
  });
  archiveRow.addEventListener('mouseleave', () => {
    archiveRow.style.backgroundColor = 'transparent';
  });
  archiveRow.addEventListener('click', () => {
    if (AppState.currentContextMenu) {
      AppState.currentContextMenu.remove();
      AppState.currentContextMenu = null;
    }
    if (isArchived) {
      unarchiveChat(chatId);
    } else {
      archiveChat(chatId);
    }
  });
  menu.appendChild(archiveRow);

  // Mark as Read action
  const markReadRow = document.createElement('div');
  markReadRow.style.padding = '10px 12px';
  markReadRow.style.cursor = 'pointer';
  markReadRow.style.fontSize = '13px';
  markReadRow.style.userSelect = 'none';
  markReadRow.textContent = '✓ Mark as Read';

  markReadRow.addEventListener('mouseenter', () => {
    markReadRow.style.backgroundColor = 'var(--bg-card-hover)';
  });
  markReadRow.addEventListener('mouseleave', () => {
    markReadRow.style.backgroundColor = 'transparent';
  });
  markReadRow.addEventListener('click', () => {
    if (AppState.currentContextMenu) {
      AppState.currentContextMenu.remove();
      AppState.currentContextMenu = null;
    }
    markChatsAsRead([chatId]);
  });
  menu.appendChild(markReadRow);

  document.body.appendChild(menu);
  AppState.currentContextMenu = menu;

  const removeMenu = () => {
    if (AppState.currentContextMenu && AppState.currentContextMenu === menu) {
      AppState.currentContextMenu.remove();
      AppState.currentContextMenu = null;
    }
    document.removeEventListener('click', removeMenu);
  };

  setTimeout(() => document.addEventListener('click', removeMenu), 50);
}
