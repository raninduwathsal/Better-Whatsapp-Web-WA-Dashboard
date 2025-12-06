/**
 * Chats UI Module
 * Handles rendering of chat list and messages
 */

function renderChats() {
  const messagesEl = document.getElementById('messages');
  if (!messagesEl) return;

  messagesEl.innerHTML = '';
  const now = Date.now();
  const sorted = Array.from(AppState.chats);
  sorted.sort((a, b) => {
    // pinned top
    const pa = AppState.pinned.has(a.chatId) ? 1 : 0;
    const pb = AppState.pinned.has(b.chatId) ? 1 : 0;
    if (pa !== pb) return pb - pa;
    // unread next
    if ((b.unreadCount > 0) - (a.unreadCount > 0) !== 0) return (b.unreadCount > 0) - (a.unreadCount > 0);
    return b.lastTimestamp - a.lastTimestamp;
  });

  for (const c of sorted) {
    // filter by selectedTagFilters (if any)
    if (AppState.selectedTagFilters.size > 0) {
      const assigned = AppState.tagAssignments[c.chatId] || [];
      const match = assigned.some(tid => AppState.selectedTagFilters.has(String(tid)) || AppState.selectedTagFilters.has(Number(tid)));
      if (!match) continue;
    }

    const el = document.createElement('div');
    el.className = 'msg';
    el.dataset.chatId = c.chatId;
    if (AppState.selectedChats.has(c.chatId)) el.classList.add('selected');
    if (c.unreadCount > 0) el.classList.add('unread');

    // Add colored left border for assigned tags (thicker border)
    const assignedIds = AppState.tagAssignments[c.chatId] || [];
    if (assignedIds.length > 0) {
      const tagColors = assignedIds.map(tid => {
        const t = AppState.tags.find(x => Number(x.id) === Number(tid));
        return t ? (t.color || 'var(--text-secondary)') : 'var(--text-secondary)';
      });
      if (tagColors.length === 1) {
        el.style.borderLeft = `6px solid ${tagColors[0]}`;
      } else if (tagColors.length > 1) {
        const gradientStops = tagColors.map((color, idx) => {
          const start = (idx / tagColors.length) * 100;
          const end = ((idx + 1) / tagColors.length) * 100;
          return `${color} ${start}%, ${color} ${end}%`;
        }).join(', ');
        el.style.borderLeft = `6px solid transparent`;
        el.style.backgroundImage = `linear-gradient(to bottom, ${gradientStops})`;
        el.style.backgroundPosition = 'left';
        el.style.backgroundSize = '6px 100%';
        el.style.backgroundRepeat = 'no-repeat';
      }
    }
    
    // Add hover and selection animation
    el.style.transition = 'transform 0.2s ease, box-shadow 0.2s ease';
    
    // Check if this chat has notes for preview
    const noteCount = AppState.notesCounts[c.chatId] || 0;
    
    el.addEventListener('mouseenter', () => {
      if (!AppState.selectedChats.has(c.chatId)) {
        el.style.transform = 'scale(1.02)';
        el.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)'; // Keep shadow as is, or use var if needed, but shadows are usually fine

      }
      // Show notes preview if this chat has notes
      if (noteCount > 0 && typeof showNotesPreviewBubble === 'function') {
        showNotesPreviewBubble(el, c.chatId);
      }
    });
    el.addEventListener('mouseleave', () => {
      if (!AppState.selectedChats.has(c.chatId)) {
        el.style.transform = 'scale(1)';
        el.style.boxShadow = 'var(--shadow-card)';
      }
      // Hide notes preview
      if (noteCount > 0 && typeof hideNotesPreviewBubble === 'function') {
        hideNotesPreviewBubble(el);
      }
    });
    if (AppState.selectedChats.has(c.chatId)) {
      el.style.transform = 'scale(1.03)';
      el.style.boxShadow = '0 6px 16px rgba(0,0,0,0.2)';
    }

    // header: phone/name + unread count
    const header = document.createElement('div');
    header.className = 'meta';
    header.style.paddingBottom = '10px';
    header.style.marginBottom = '10px';
    header.style.borderBottom = '1px solid var(--border-light)';
    const left = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = c.name || '';
    title.style.fontSize = '15px';
    left.appendChild(title);

    // show notes badge if any
    if (noteCount > 0) {
      const noteBadge = document.createElement('span');
      noteBadge.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-left:8px;margin-right:4px"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>${noteCount}`;
      noteBadge.style.fontSize = '13px';
      noteBadge.style.color = 'var(--text-secondary)';
      noteBadge.title = `${noteCount} note${noteCount !== 1 ? 's' : ''}`;
      left.appendChild(noteBadge);
    }

    // tag badges container
    const badgeWrap = document.createElement('span');
    badgeWrap.className = 'tag-badges';
    badgeWrap.style.marginLeft = '8px';
    for (const tid of assignedIds) {
      const t = AppState.tags.find(x => Number(x.id) === Number(tid));
      if (!t) continue;
      const dot = document.createElement('span');
      dot.className = 'tag-dot';
      dot.title = t.name;
      dot.style.display = 'inline-block';
      dot.style.width = '12px';
      dot.style.height = '12px';
      dot.style.borderRadius = '6px';
      dot.style.background = t.color || 'var(--text-secondary)';
      dot.style.marginRight = '6px';
      badgeWrap.appendChild(dot);
    }
    left.appendChild(badgeWrap);

    const info = document.createElement('span');
    info.style.marginLeft = '8px';
    info.style.fontSize = '14px';
    info.style.color = 'var(--text-secondary)';
    info.textContent = c.unreadCount > 0 ? `${c.unreadCount} unread` : '';
    left.appendChild(info);
    header.appendChild(left);

    const pinBtn = document.createElement('button');
    pinBtn.className = 'pinBtn';
    pinBtn.innerHTML = AppState.pinned.has(c.chatId) 
      ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z"/></svg>' 
      : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 17v5m-3-2 3 3 3-3M9 4v7.586a1 1 0 0 1-.293.707l-1.414 1.414a1 1 0 0 1-.707.293H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2zm6 0v7.586a1 1 0 0 0 .293.707l1.414 1.414a1 1 0 0 0 .707.293H19a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2z"/></svg>';
    pinBtn.style.background = 'none';
    pinBtn.style.border = 'none';
    pinBtn.style.cursor = 'pointer';
    pinBtn.style.padding = '4px';
    pinBtn.style.color = AppState.pinned.has(c.chatId) ? 'var(--color-accent)' : 'var(--text-secondary)';
    pinBtn.style.display = 'flex';
    pinBtn.style.alignItems = 'center';
    pinBtn.style.justifyContent = 'center';
    pinBtn.title = AppState.pinned.has(c.chatId) ? 'Unpin' : 'Pin';
    pinBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (AppState.pinned.has(c.chatId)) AppState.pinned.delete(c.chatId);
      else AppState.pinned.add(c.chatId);
      renderChats();
    });
    header.appendChild(pinBtn);

    // history (last 3 messages) as bubbles
    const hist = document.createElement('div');
    hist.className = 'history';
    hist.style.display = 'flex';
    hist.style.flexDirection = 'column';
    hist.style.gap = '6px';
    for (const m of c.history) {
      const isMine = !!m.fromMe;
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.justifyContent = isMine ? 'flex-end' : 'flex-start';
      const bubble = document.createElement('div');
      bubble.className = 'bubble ' + (isMine ? 'right' : 'left');

      if (m.hasMedia) {
        const mt = (m.mimetype || '').toLowerCase();
        if (m.isSticker && m.media && m.media.data) {
          const img = document.createElement('img');
          img.src = m.media.data;
          img.style.width = '72px';
          img.style.height = '72px';
          img.style.objectFit = 'contain';
          img.style.borderRadius = '8px';
          img.alt = m.filename || 'sticker';
          bubble.appendChild(img);
        } else {
          let label = '📄 File';
          if (mt.startsWith('image/')) label = '🖼️ Image';
          else if (mt === 'application/pdf') label = '📄 PDF';
          else if (mt.startsWith('video/')) label = '📹 Video';
          const textNode = document.createElement('div');
          textNode.textContent = `${label}${m.filename ? ' — ' + m.filename : ''}`;
          bubble.appendChild(textNode);
          if (m.filename) bubble.title = m.filename;
        }
      } else {
        const fullText = String(m.body || '');
        const truncated = fullText.length > 40 ? fullText.slice(0, 40) + '...' : fullText;
        const textNode = document.createElement('div');
        textNode.textContent = truncated;
        if (fullText.length > 40) bubble.title = fullText;
        bubble.appendChild(textNode);
      }

      const ts = document.createElement('span');
      ts.className = 'timestamp';
      ts.textContent = new Date(m.timestamp * 1000).toLocaleTimeString();
      bubble.appendChild(ts);
      row.appendChild(bubble);
      hist.appendChild(row);
    }

    el.appendChild(header);
    el.appendChild(hist);

    // Handle single and double-click
    let clickCount = 0;
    let clickTimer;
    
    el.addEventListener('click', (e) => {
      clickCount++;
      
      if (clickCount === 1) {
        clickTimer = setTimeout(() => {
          // Single click - select chat
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            if (AppState.selectedChats.has(c.chatId)) AppState.selectedChats.delete(c.chatId);
            else AppState.selectedChats.add(c.chatId);
          } else {
            AppState.selectedChats.clear();
            AppState.selectedChats.add(c.chatId);
          }
          renderChats();
          clickCount = 0;
        }, 300);
      } else if (clickCount === 2) {
        // Double click - open full chat
        clearTimeout(clickTimer);
        clickCount = 0;
        openFullChat(c.chatId, c.name || '');
      }
    });

    // right-click context menu
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openTagContextMenu(e.clientX, e.clientY, c.chatId);
    });

    messagesEl.appendChild(el);
  }

  // Add click handler to messages container to deselect on empty space click
  messagesEl.addEventListener('click', (e) => {
    // Only deselect if clicking directly on the container (not on a child element)
    if (e.target === messagesEl) {
      AppState.selectedChats.clear();
      keyboardFocusedChatId = null;
      renderChats();
    }
  });
}
