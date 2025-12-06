/**
 * Modals UI Module
 * Handles modal dialogs (full chat, etc.)
 */

function openFullChat(chatId, title) {
  const modal = document.createElement('div');
  modal.className = 'modal';
  const panel = document.createElement('div');
  panel.className = 'panel';
  const header = document.createElement('div');
  header.className = 'header';
  const hTitle = document.createElement('div');
  hTitle.textContent = title;
  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close';
  header.appendChild(hTitle);
  header.appendChild(closeBtn);

  const body = document.createElement('div');
  body.className = 'body';
  const composer = document.createElement('div');
  composer.className = 'composer';
  const input = document.createElement('input');
  input.placeholder = 'Message...';
  const send = document.createElement('button');
  send.textContent = 'Send';
  composer.appendChild(input);
  composer.appendChild(send);

  panel.appendChild(header);
  panel.appendChild(body);
  panel.appendChild(composer);
  modal.appendChild(panel);
  document.body.appendChild(modal);

  closeBtn.addEventListener('click', () => {
    document.body.removeChild(modal);
  });

  // Keyboard handlers for full chat modal
  const handleFullChatKeydown = (e) => {
    if (e.key === 'Enter' && e.target === input) {
      e.preventDefault();
      send.click();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeBtn.click();
    }
  };

  document.addEventListener('keydown', handleFullChatKeydown);

  // request full chat from server
  socket.emit('getFullChat', chatId);
  // show loading
  body.innerHTML = '<em>Loading...</em>';

  // handle send from composer
  send.addEventListener('click', () => {
    const txt = input.value && input.value.trim();
    if (!txt) return;
    socket.emit('sendPreset', { chatId, text: txt });
    input.value = '';
  });

  // receive full chat
  const handler = (payload) => {
    if (!payload || payload.chatId !== chatId) return;
    const msgs = payload.messages || [];
    renderFullChatBody(body, msgs);
    // scroll to bottom
    body.scrollTop = body.scrollHeight;
    // Auto-focus the input field
    input.focus();
  };
  socket.on('full_chat', handler);

  // cleanup listener when modal closed
  modal.addEventListener('remove', () => {
    socket.off('full_chat', handler);
    document.removeEventListener('keydown', handleFullChatKeydown);
  });
}

function renderFullChatBody(container, messages) {
  container.innerHTML = '';
  for (const m of messages) {
    const row = document.createElement('div');
    const bubble = document.createElement('div');
    bubble.className = 'bubble ' + (m.fromMe ? 'right' : 'left');

    if (m.media && m.media.data) {
      const mt = (m.media.mimetype || '').toLowerCase();
      if (mt.startsWith('image/')) {
        const img = document.createElement('img');
        img.src = m.media.data;
        img.style.maxWidth = '100%';
        img.style.borderRadius = '8px';
        bubble.appendChild(img);
        if (m.media.filename) {
          const fn = document.createElement('div');
          fn.style.fontSize = '12px';
          fn.style.color = 'var(--text-secondary)';
          fn.textContent = m.media.filename;
          bubble.appendChild(fn);
        }
      } else if (mt === 'application/pdf') {
        const iframe = document.createElement('iframe');
        iframe.src = m.media.data;
        iframe.style.width = '100%';
        iframe.style.height = '300px';
        iframe.style.border = 'none';
        bubble.appendChild(iframe);
        if (m.media.filename) {
          const a = document.createElement('a');
          a.href = m.media.data;
          a.download = m.media.filename;
          a.textContent = 'Download PDF';
          a.style.display = 'block';
          a.style.marginTop = '6px';
          bubble.appendChild(a);
        }
      } else {
        const a = document.createElement('a');
        a.href = m.media.data;
        a.download = m.media.filename || 'file';
        a.textContent = m.media.filename || 'Download file';
        bubble.appendChild(a);
      }
      if (m.body) {
        const cap = document.createElement('div');
        cap.style.marginTop = '6px';
        cap.textContent = m.body;
        bubble.appendChild(cap);
      }
    } else {
      const textNode = document.createElement('div');
      textNode.textContent = m.body;
      bubble.appendChild(textNode);
    }

    const ts = document.createElement('div');
    ts.className = 'timestamp';
    ts.textContent = new Date(m.timestamp * 1000).toLocaleString();
    bubble.appendChild(ts);
    row.appendChild(bubble);
    container.appendChild(row);
  }
}
