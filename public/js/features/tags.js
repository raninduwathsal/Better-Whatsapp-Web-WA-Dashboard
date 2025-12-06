/**
 * Tags Feature Module
 * Handles all tag-related functionality
 */

const TAGS_API = '/api/tags';

// Load tags from server
async function loadTagsFromServer() {
  try {
    const res = await fetch('/api/tags/export');
    if (!res.ok) throw new Error('failed to load tags');
    const data = await res.json();
    AppState.tags = Array.isArray(data.tags) ? data.tags : (data || []);

    // build assignments map
    AppState.tagAssignments = {};
    const assigns = Array.isArray(data.assignments) ? data.assignments : (data.assignments || []);
    for (const a of assigns) {
      if (!a.chat_id && !a.chatId) continue;
      const cid = a.chat_id || a.chatId;
      const tid = a.tag_id || a.tagId;
      if (!AppState.tagAssignments[cid]) AppState.tagAssignments[cid] = [];
      AppState.tagAssignments[cid].push(tid);
    }
  } catch (err) {
    console.error('Failed to load tags', err);
    AppState.tags = [];
    AppState.tagAssignments = {};
  }
  renderTagFilterChips();
  renderChats();
}

// Create tag on server
async function createTagOnServer(name, color) {
  const res = await fetch(TAGS_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, color })
  });
  if (!res.ok) throw new Error('create tag failed');
  return await res.json();
}

// Update tag on server
async function updateTagOnServer(id, name, color) {
  const res = await fetch(`${TAGS_API}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, color })
  });
  if (!res.ok) throw new Error('update tag failed');
  return await res.json();
}

// Delete tag on server
async function deleteTagOnServer(id) {
  const res = await fetch(`${TAGS_API}/${id}`, {
    method: 'DELETE'
  });
  if (!res.ok) throw new Error('delete tag failed');
  return await res.json();
}

// Assign tag to chat
async function assignTagOnServer(tagId, chatId) {
  const res = await fetch('/api/tags/assign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tagId, chatId })
  });
  if (!res.ok) throw new Error('assign failed');
  return await res.json();
}

// Unassign tag from chat
async function unassignTagOnServer(tagId, chatId) {
  const res = await fetch('/api/tags/unassign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tagId, chatId })
  });
  if (!res.ok) throw new Error('unassign failed');
  return await res.json();
}

// Open tag editor modal
function openTagEditor(initialName, initialColor, onSave) {
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.style.backgroundColor = 'var(--overlay-modal)';

  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.style.width = '90%';
  panel.style.maxWidth = '400px';
  panel.style.borderRadius = '12px';
  panel.style.backgroundColor = 'var(--bg-card)';
  panel.style.boxShadow = 'var(--shadow-modal)';
  panel.style.padding = '16px';

  const header = document.createElement('div');
  header.className = 'header';
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'center';
  header.style.paddingBottom = '12px';
  header.style.borderBottom = '1px solid var(--border-light)';

  const hTitle = document.createElement('div');
  hTitle.textContent = initialName ? 'Edit Tag' : 'New Tag';
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
  body.style.display = 'flex';
  body.style.flexDirection = 'column';
  body.style.gap = '12px';

  const nameInput = document.createElement('input');
  nameInput.placeholder = 'Tag name';
  nameInput.value = initialName || '';
  nameInput.style.width = '100%';
  nameInput.style.padding = '10px 12px';
  nameInput.style.background = 'var(--bg-input)';
  nameInput.style.color = 'var(--text-primary)';
  nameInput.style.border = '1px solid var(--border-medium)';
  nameInput.style.borderRadius = '8px';
  nameInput.style.fontSize = '14px';
  nameInput.style.boxSizing = 'border-box';
  nameInput.style.transition = 'border-color 0.2s';

  nameInput.addEventListener('focus', () => {
    nameInput.style.borderColor = 'var(--color-accent)';
    nameInput.style.outline = 'none';
  });
  nameInput.addEventListener('blur', () => {
    nameInput.style.borderColor = 'var(--border-medium)';
  });

  const colorWrapper = document.createElement('div');
  colorWrapper.style.display = 'flex';
  colorWrapper.style.alignItems = 'center';
  colorWrapper.style.gap = '12px';

  const colorLabel = document.createElement('label');
  colorLabel.textContent = 'Color:';
  colorLabel.style.fontSize = '14px';
  colorLabel.style.fontWeight = '500';
  colorLabel.style.color = 'var(--text-secondary)';
  colorLabel.style.minWidth = '50px';

  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.value = initialColor || '#ffcc00';
  colorInput.style.width = '50px';
  colorInput.style.height = '40px';
  colorInput.style.border = '1px solid var(--border-medium)';
  colorInput.style.borderRadius = '8px';
  colorInput.style.cursor = 'pointer';

  const colorDisplay = document.createElement('div');
  colorDisplay.style.width = '40px';
  colorDisplay.style.height = '40px';
  colorDisplay.style.borderRadius = '8px';
  colorDisplay.style.background = colorInput.value;
  colorDisplay.style.border = '2px solid var(--border-light)';
  colorDisplay.style.flexShrink = '0';

  colorInput.addEventListener('change', () => {
    colorDisplay.style.background = colorInput.value;
  });

  colorWrapper.appendChild(colorLabel);
  colorWrapper.appendChild(colorInput);
  colorWrapper.appendChild(colorDisplay);

  body.appendChild(nameInput);
  body.appendChild(colorWrapper);

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
  modal.appendChild(panel);
  document.body.appendChild(modal);

  function close(v) {
    document.body.removeChild(modal);
    onSave(v);
  }

  function handleSave() {
    if (nameInput.value.trim()) {
      close({ name: nameInput.value.trim(), color: colorInput.value });
    }
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

  // Focus name input automatically
  nameInput.focus();

  // Clean up keyboard handler when modal closes
  const originalClose = close;
  close = function (v) {
    document.removeEventListener('keydown', handleModalKeydown);
    originalClose(v);
  };
}

// Render tag filter chips
function renderTagFilterChips() {
  let container = document.getElementById('tag-filter-chips');
  if (!container) {
    container = document.createElement('div');
    container.id = 'tag-filter-chips';
    container.style.display = 'flex';
    container.style.gap = '6px';
    container.style.flexWrap = 'wrap';
    container.style.marginBottom = '12px';
    container.style.padding = '0 12px';
    const messagesEl = document.getElementById('messages');
    if (messagesEl && messagesEl.parentNode) {
      messagesEl.parentNode.insertBefore(container, messagesEl);
    }
  }
  container.innerHTML = '';

  // Add "All" chip
  const allChip = document.createElement('button');
  allChip.textContent = 'All';
  allChip.style.padding = '4px 12px';
  allChip.style.background = AppState.selectedTagFilters.size === 0 ? 'var(--color-accent)' : 'var(--bg-card-hover)';
  allChip.style.color = AppState.selectedTagFilters.size === 0 ? '#fff' : 'var(--text-primary)';
  allChip.style.border = 'none';
  allChip.style.borderRadius = '12px';
  allChip.style.cursor = 'pointer';
  allChip.style.fontSize = '12px';
  allChip.addEventListener('click', () => {
    AppState.selectedTagFilters.clear();
    renderTagFilterChips();
    renderChats();
  });
  container.appendChild(allChip);

  // Add tag chips (include ALL tags, even Archived)
  for (const t of AppState.tags) {
    const chip = document.createElement('button');
    chip.textContent = t.name;
    chip.style.padding = '4px 12px';
    chip.style.background = AppState.selectedTagFilters.has(String(t.id)) ? t.color : 'var(--bg-card-hover)';
    chip.style.color = AppState.selectedTagFilters.has(String(t.id)) ? '#fff' : 'var(--text-primary)';
    chip.style.border = 'none';
    chip.style.borderRadius = '12px';
    chip.style.cursor = 'pointer';
    chip.style.fontSize = '12px';
    chip.addEventListener('click', () => {
      const tagId = String(t.id);
      if (AppState.selectedTagFilters.has(tagId)) {
        AppState.selectedTagFilters.delete(tagId);
      } else {
        AppState.selectedTagFilters.add(tagId);
      }
      renderTagFilterChips();
      renderChats();
    });
    container.appendChild(chip);
  }
}

// Render tags settings panel
function renderTagsSettings() {
  let panel = document.getElementById('sidebar-tags');
  if (!panel) {
    const contentContainer = document.getElementById('settings-content');
    if (contentContainer) {
      panel = document.createElement('div');
      panel.id = 'sidebar-tags';
      panel.style.padding = '8px';
      panel.style.borderBottom = '1px solid var(--border-light)';
      contentContainer.appendChild(panel);
    } else {
      return;
    }
  }

  if (!AppState.tagsSettingsOpen) {
    panel.style.display = 'none';
    return;
  }
  panel.style.display = 'block';
  panel.innerHTML = '';
  panel.style.padding = '12px';

  const titleRow = document.createElement('div');
  titleRow.style.display = 'flex';
  titleRow.style.alignItems = 'center';
  titleRow.style.justifyContent = 'space-between';
  const title = document.createElement('div');
  title.style.fontWeight = 'bold';
  title.textContent = 'Tags Settings';
  const toolbar = document.createElement('div');
  toolbar.style.display = 'flex';
  toolbar.style.gap = '8px';

  const exportBtn = document.createElement('button');
  exportBtn.className = 'qr-btn';
  exportBtn.textContent = 'Export';
  exportBtn.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/tags/export');
      if (!res.ok) {
        AppState.statusEl.textContent = 'Export failed';
        return;
      }
      const js = await res.json();
      const blob = new Blob([JSON.stringify(js, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tags-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      AppState.statusEl.textContent = 'Exported tags';
    } catch (err) {
      console.error(err);
      AppState.statusEl.textContent = 'Export failed';
    }
  });

  const importBtn = document.createElement('button');
  importBtn.className = 'qr-btn';
  importBtn.textContent = 'Import';
  let importInput = document.getElementById('tags-import-input');
  if (!importInput) {
    importInput = document.createElement('input');
    importInput.type = 'file';
    importInput.id = 'tags-import-input';
    importInput.accept = '.json,application/json';
    importInput.style.display = 'none';
    document.body.appendChild(importInput);
  }
  importBtn.addEventListener('click', () => {
    importInput.value = '';
    importInput.click();
  });

  if (!AppState.tagsImportHandlerAttached) {
    AppState.tagsImportHandlerAttached = true;
    importInput.addEventListener('change', async (ev) => {
      const f = ev.target.files && ev.target.files[0];
      if (!f) return;
      try {
        const txt = await f.text();
        const parsed = JSON.parse(txt);
        const replace = confirm('Replace existing tags? OK = replace, Cancel = append');
        const res = await fetch('/api/tags/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tags: parsed.tags || parsed,
            assignments: parsed.assignments || [],
            replace
          })
        });
        if (!res.ok) {
          AppState.statusEl.textContent = 'Import failed';
          return;
        }
        const result = await res.json();
        await loadTagsFromServer();
        renderTagFilterChips();
        renderTagsSettings();
        AppState.statusEl.textContent = 'Imported tags';
        if (result && result.assignments) {
          const a = result.assignments;
          alert(`Tags Import Report:\n\nTags imported: ${result.imported || 0}\n\nAssignments:\n• Total: ${a.total || 0}\n• Imported: ${a.imported || 0}\n• Skipped (duplicates): ${a.skipped || 0}\n• Failed: ${a.failed || 0}`);
        }
      } catch (err) {
        console.error(err);
        AppState.statusEl.textContent = 'Import failed';
      }
    });
  }

  toolbar.appendChild(exportBtn);
  toolbar.appendChild(importBtn);
  titleRow.appendChild(title);
  titleRow.appendChild(toolbar);
  panel.appendChild(titleRow);

  const createRow = document.createElement('div');
  createRow.style.marginTop = '8px';
  createRow.style.marginBottom = '12px';
  const createBtn = document.createElement('button');
  createBtn.textContent = 'Create Tag';
  createBtn.className = 'qr-btn';
  createBtn.addEventListener('click', () => {
    openTagEditor('', '#ffcc00', async (v) => {
      if (!v) return;
      await createTagOnServer(v.name, v.color);
      await loadTagsFromServer();
      renderTagFilterChips();
      renderTagsSettings();
    });
  });
  createRow.appendChild(createBtn);
  panel.appendChild(createRow);

  if (!AppState.tags || AppState.tags.length === 0) {
    const empty = document.createElement('div');
    empty.style.marginTop = '8px';
    empty.style.color = 'var(--text-secondary)';
    empty.textContent = 'No tags defined.';
    panel.appendChild(empty);
    return;
  }

  AppState.tags.forEach((t, idx) => {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '8px';
    row.style.padding = '12px';
    row.style.background = t.color;
    row.style.borderRadius = '6px';
    row.style.marginBottom = '6px';
    row.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';

    // Calculate text color based on background brightness
    const rgb = parseInt(t.color.slice(1), 16);
    const r = (rgb >> 16) & 255;
    const g = (rgb >> 8) & 255;
    const b = rgb & 255;
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    const textColor = brightness > 128 ? '#000' : '#fff';

    const label = document.createElement('div');
    label.style.flex = '1';
    label.style.color = textColor;
    label.style.fontWeight = '500';
    label.textContent = t.name;
    if (t.is_system) {
      const badge = document.createElement('span');
      badge.textContent = 'System';
      badge.style.fontSize = '10px';
      badge.style.background = textColor === '#fff' ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.3)';
      badge.style.color = textColor;
      badge.style.padding = '2px 6px';
      badge.style.borderRadius = '4px';
      badge.style.marginLeft = '8px';
      label.appendChild(badge);
    }

    const edit = document.createElement('button');
    edit.className = 'qr-btn';
    edit.textContent = 'Edit';
    edit.style.color = textColor;
    edit.style.borderColor = textColor;
    edit.style.backgroundColor = textColor === '#fff' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.2)';
    if (t.is_system) {
      edit.disabled = true;
      edit.style.opacity = '0.5';
      edit.style.cursor = 'not-allowed';
      edit.title = 'Cannot edit system tag';
    } else {
      edit.addEventListener('mouseenter', () => {
        edit.style.backgroundColor = textColor === '#fff' ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.3)';
      });
      edit.addEventListener('mouseleave', () => {
        edit.style.backgroundColor = textColor === '#fff' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.2)';
      });
      edit.addEventListener('click', () => {
        openTagEditor(t.name, t.color, async (v) => {
          if (!v) return;
          await updateTagOnServer(t.id, v.name, v.color);
          await loadTagsFromServer();
          renderTagFilterChips();
          renderTagsSettings();
        });
      });
    }

    const del = document.createElement('button');
    del.className = 'qr-btn';
    del.textContent = 'Delete';
    del.style.color = textColor;
    del.style.borderColor = textColor;
    del.style.backgroundColor = textColor === '#fff' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.2)';
    if (t.is_system) {
      del.disabled = true;
      del.style.opacity = '0.5';
      del.style.cursor = 'not-allowed';
      del.title = 'Cannot delete system tag';
    } else {
      del.addEventListener('mouseenter', () => {
        del.style.backgroundColor = textColor === '#fff' ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.3)';
      });
      del.addEventListener('mouseleave', () => {
        del.style.backgroundColor = textColor === '#fff' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.2)';
      });
      del.addEventListener('click', async () => {
        try {
          const countRes = await fetch(`/api/tags/${t.id}/count`);
          if (!countRes.ok) throw new Error('Failed to get count');
          const countData = await countRes.json();
          const chatCount = countData.count || 0;
          const msg = chatCount > 0
            ? `Delete tag "${t.name}"?\n\nThis tag is assigned to ${chatCount} chat${chatCount !== 1 ? 's' : ''}. Deleting it will remove the tag from these chats.`
            : `Delete tag "${t.name}"?`;
          if (!confirm(msg)) return;
          await deleteTagOnServer(t.id);
          await loadTagsFromServer();
          renderTagFilterChips();
          renderTagsSettings();
        } catch (err) {
          console.error(err);
          alert('Failed to delete tag');
        }
      });
    }

    row.appendChild(label);
    row.appendChild(edit);
    row.appendChild(del);
    panel.appendChild(row);
  });
}
