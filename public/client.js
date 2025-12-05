const socket = io();

const qrImg = document.getElementById('qr');
const statusEl = document.getElementById('status');
const messagesEl = document.getElementById('messages');
const presetInput = document.getElementById('preset');
const sendBtn = document.getElementById('sendBtn');
const refreshBtn = document.getElementById('refresh');

// state
let chats = []; // array of chat objects from server
const pinned = new Set();
// selection supports multi-select (ctrl/cmd click)
const selectedChats = new Set();
// notes counts map: chatId -> count
let notesCounts = {};

// tags state
let tags = []; // {id, name, color}
let tagAssignments = {}; // chatId -> [tagId]
let selectedTagFilters = new Set();
let tagsSettingsOpen = false;
let tagsImportHandlerAttached = false;
let notesSettingsOpen = false;
let sidebarVisible = false;

// quick replies (server-backed)
let quickReplies = []; // {id, text, created_at}
let showAllQuickReplies = false;
let quickRepliesSettingsOpen = false;
const QUICK_REPLIES_API = '/api/quick-replies';

async function loadQuickRepliesFromServer(){
  try {
    const res = await fetch(QUICK_REPLIES_API);
    if (!res.ok) throw new Error('failed');
    quickReplies = await res.json();
  } catch (err) {
    console.error('Failed to load quick replies', err);
    quickReplies = [];
  }
  renderQuickReplies();
}

async function createQuickReplyOnServer(text){
  const res = await fetch(QUICK_REPLIES_API, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ text }) });
  if (!res.ok) throw new Error('create failed');
  return await res.json();
}

async function updateQuickReplyOnServer(id, text){
  const res = await fetch(`${QUICK_REPLIES_API}/${id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ text }) });
  if (!res.ok) throw new Error('update failed');
  return await res.json();
}

async function deleteQuickReplyOnServer(id){
  const res = await fetch(`${QUICK_REPLIES_API}/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('delete failed');
  return await res.json();
}

// subscribe to server-side updates
socket.on('quick_replies_updated', ()=> { loadQuickRepliesFromServer(); renderQuickReplies(); });
// initial load
loadQuickRepliesFromServer();
// tags
socket.on('tags_updated', ()=> { loadTagsFromServer(); renderTagFilterChips(); });
loadTagsFromServer();
// ensure central settings sidebar
createSettingsSidebar();

// notes counts loader
async function loadNotesCountsFromServer(){
  try {
    const res = await fetch('/api/notes/counts');
    if (!res.ok) throw new Error('failed');
    const rows = await res.json();
    notesCounts = {};
    for (const r of rows) notesCounts[r.chatId] = Number(r.count) || 0;
  } catch (err){ console.error('Failed to load note counts', err); notesCounts = {}; }
  renderChats();
}
socket.on('notes_updated', ()=> loadNotesCountsFromServer());
loadNotesCountsFromServer();


socket.on('connect', () => {
  statusEl.textContent = 'Connected to server';
  socket.emit('requestMessages');
});

socket.on('connect_error', (err)=>{
  console.error('Socket connect_error', err);
  statusEl.textContent = 'Socket error';
});

socket.on('error', (err)=>{
  console.error('Socket error', err);
});

socket.on('qr', dataUrl => {
  qrImg.src = dataUrl;
  statusEl.textContent = 'Scan QR to link WhatsApp';
});

socket.on('ready', () => {
  statusEl.textContent = 'WhatsApp Ready';
  document.getElementById('qrWrap').style.display = 'none';
});

socket.on('chats', list => {
  // update local chats list
  chats = list || [];
  renderChats();
});

socket.on('not_ready', ()=>{
  statusEl.textContent = 'WhatsApp initializing...';
});

socket.on('sent', ({chatId, text}) => {
  // show friendly name if available
  const c = chats.find(x=>x.chatId === chatId);
  const display = c ? (c.name || c.chatId) : chatId;
  statusEl.textContent = `Sent to ${display}`;
  // after sending, refresh chats from server so unread state updates
  socket.emit('requestMessages');
});

socket.on('archive_success', ({ chatId }) => {
  const c = chats.find(x => x.chatId === chatId);
  const display = c ? (c.name || c.chatId) : chatId;
  statusEl.textContent = `Archived ${display}`;
  loadTagsFromServer();
});

socket.on('archive_error', ({ chatId, error }) => {
  const c = chats.find(x => x.chatId === chatId);
  const display = c ? (c.name || c.chatId) : chatId;
  statusEl.textContent = `Failed to archive ${display}: ${error}`;
});

socket.on('unarchive_success', ({ chatId }) => {
  const c = chats.find(x => x.chatId === chatId);
  const display = c ? (c.name || c.chatId) : chatId;
  statusEl.textContent = `Unarchived ${display}`;
  loadTagsFromServer();
});

socket.on('unarchive_error', ({ chatId, error }) => {
  const c = chats.find(x => x.chatId === chatId);
  const display = c ? (c.name || c.chatId) : chatId;
  statusEl.textContent = `Failed to unarchive ${display}: ${error}`;
});

socket.on('error', e => {
  statusEl.textContent = `Error: ${e.message || e}`;
});

function renderChats(){
  messagesEl.innerHTML = '';
  // render pinned first
  messagesEl.innerHTML = '';
  const now = Date.now();
  const sorted = Array.from(chats);
  sorted.sort((a,b)=>{
    // pinned top
    const pa = pinned.has(a.chatId) ? 1 : 0;
    const pb = pinned.has(b.chatId) ? 1 : 0;
    if (pa !== pb) return pb - pa;
    // unread next
    if ((b.unreadCount>0) - (a.unreadCount>0) !== 0) return (b.unreadCount>0) - (a.unreadCount>0);
    return b.lastTimestamp - a.lastTimestamp;
  });

  for (const c of sorted){
    // filter by selectedTagFilters (if any)
    if (selectedTagFilters.size > 0){
      const assigned = tagAssignments[c.chatId] || [];
      const match = assigned.some(tid => selectedTagFilters.has(String(tid)) || selectedTagFilters.has(Number(tid)));
      if (!match) continue;
    }
    const el = document.createElement('div');
    el.className = 'msg';
    el.dataset.chatId = c.chatId;
    if (selectedChats.has(c.chatId)) el.classList.add('selected');
    if (c.unreadCount > 0) el.classList.add('unread');

    // Add colored left border for assigned tags
    const assignedIds = tagAssignments[c.chatId] || [];
    if (assignedIds.length > 0) {
      const tagColors = assignedIds.map(tid => {
        const t = tags.find(x => Number(x.id) === Number(tid));
        return t ? (t.color || '#999') : '#999';
      });
      if (tagColors.length === 1) {
        el.style.borderLeft = `4px solid ${tagColors[0]}`;
      } else if (tagColors.length > 1) {
        // Create gradient for multiple tags
        const gradientStops = tagColors.map((color, idx) => {
          const start = (idx / tagColors.length) * 100;
          const end = ((idx + 1) / tagColors.length) * 100;
          return `${color} ${start}%, ${color} ${end}%`;
        }).join(', ');
        el.style.borderLeft = `4px solid transparent`;
        el.style.backgroundImage = `linear-gradient(to bottom, ${gradientStops})`;
        el.style.backgroundPosition = 'left';
        el.style.backgroundSize = '4px 100%';
        el.style.backgroundRepeat = 'no-repeat';
      }
    }

    // header: phone/name + unread count
    const header = document.createElement('div'); header.className='meta';
    const left = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = c.name || '';
    left.appendChild(title);
    // show notes badge if any
    const noteCount = notesCounts[c.chatId] || 0;
    if (noteCount > 0) {
      const noteBadge = document.createElement('span');
      noteBadge.textContent = ` 📝${noteCount}`;
      noteBadge.style.marginLeft = '8px';
      noteBadge.style.fontSize = '12px';
      noteBadge.title = `${noteCount} note${noteCount !== 1 ? 's' : ''}`;
      left.appendChild(noteBadge);
    }
    // tag badges container
    const badgeWrap = document.createElement('span'); badgeWrap.className = 'tag-badges'; badgeWrap.style.marginLeft='8px';
    for (const tid of assignedIds){
      const t = tags.find(x=>Number(x.id) === Number(tid));
      if (!t) continue;
      const dot = document.createElement('span');
      dot.className = 'tag-dot';
      dot.title = t.name;
      dot.style.display='inline-block';
      dot.style.width='12px'; dot.style.height='12px'; dot.style.borderRadius='6px'; dot.style.background = t.color || '#999'; dot.style.marginRight='6px';
      badgeWrap.appendChild(dot);
    }
    left.appendChild(badgeWrap);
    const info = document.createElement('span');
    info.style.marginLeft = '8px';
    info.textContent = c.unreadCount>0 ? `${c.unreadCount} unread` : '';
    left.appendChild(info);
    header.appendChild(left);

    const pinBtn = document.createElement('button');
    pinBtn.className = 'pinBtn';
    pinBtn.textContent = pinned.has(c.chatId) ? 'Unpin' : 'Pin';
    pinBtn.addEventListener('click', (e)=>{
      e.stopPropagation();
      if (pinned.has(c.chatId)) pinned.delete(c.chatId); else pinned.add(c.chatId);
      renderChats();
    });

    // history (last 3 messages) as bubbles
    const hist = document.createElement('div'); hist.className='history';
    for (const m of c.history){
      const isMine = !!m.fromMe;
      const row = document.createElement('div');
      const bubble = document.createElement('div');
      bubble.className = 'bubble ' + (isMine ? 'right' : 'left');

      if (m.hasMedia) {
        const mt = (m.mimetype || '').toLowerCase();
        // stickers: render small inline sticker image if media data is available
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
          // show compact placeholder for media
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
        // message text (truncate to 40 chars in the card)
        const fullText = String(m.body || '');
        const truncated = fullText.length > 40 ? fullText.slice(0,40) + '...' : fullText;
        const textNode = document.createElement('div');
        textNode.textContent = truncated;
        if (fullText.length > 40) bubble.title = fullText;
        bubble.appendChild(textNode);
      }

      // timestamp
      const ts = document.createElement('span'); ts.className='timestamp'; ts.textContent = new Date(m.timestamp*1000).toLocaleTimeString();
      bubble.appendChild(ts);
      row.appendChild(bubble);
      hist.appendChild(row);
    }

    el.appendChild(header);
    el.appendChild(pinBtn);
    el.appendChild(hist);

    el.addEventListener('click', (e)=>{
      const id = c.chatId;
      if (e.ctrlKey || e.metaKey) {
        // toggle
        if (selectedChats.has(id)) selectedChats.delete(id); else selectedChats.add(id);
      } else {
        // single select
        selectedChats.clear();
        selectedChats.add(id);
      }
      // update visuals
      document.querySelectorAll('.msg').forEach(x=> x.classList.toggle('selected', selectedChats.has(x.dataset.chatId)));
    });

    // right-click context menu for tags
    el.addEventListener('contextmenu', (e)=>{
      e.preventDefault();
      e.stopPropagation();
      openTagContextMenu(e.pageX, e.pageY, c.chatId);
    });

    // hover preview: show notes preview bubble after 1.5s hover
    el.addEventListener('mouseenter', (ev)=>{
      // start timer to show preview
      if (el._noteTimer) clearTimeout(el._noteTimer);
      el._noteTimer = setTimeout(()=>{
        showNotesPreviewBubble(c.chatId, el);
      }, 1500);
    });
    el.addEventListener('mouseleave', (ev)=>{
      // cancel timer
      if (el._noteTimer) { clearTimeout(el._noteTimer); el._noteTimer = null; }
      // if bubble exists, schedule removal shortly to allow moving to bubble
      if (el._noteBubble){
        setTimeout(()=>{ if (el._noteBubble && !el._noteBubble.matches(':hover')) { hideNotesPreviewBubble(el); } }, 150);
      }
    });

      // double-click to open full chat view
      el.addEventListener('dblclick', ()=>{
        openFullChat(c.chatId, c.name || c.chatId);
      });

    messagesEl.appendChild(el);
  }

  renderQuickReplies();
}

function renderQuickReplies(){
  let container = document.getElementById('quick-replies-container');
  if (!container) return;
  container.innerHTML = '';
  // Add button to create new quick reply
  const addBtn = document.createElement('button');
  addBtn.className = 'qr-btn';
  addBtn.textContent = '+';
  addBtn.title = 'Create quick reply';
  addBtn.addEventListener('click', ()=>{
    // Open a modal editor so we can accept multiline quick replies
    openQuickReplyEditor('', (v)=>{
      if (v != null && v.trim() !== ''){
        createQuickReplyOnServer(v).then(()=> loadQuickRepliesFromServer()).catch(err=>{ console.error(err); statusEl.textContent='Failed to create quick reply'; });
      }
    });
  });
  container.appendChild(addBtn);

  // Show quick reply buttons, collapse if many
  const maxVisible = showAllQuickReplies ? quickReplies.length : 6;
  for (let i=0;i<Math.min(quickReplies.length, maxVisible);i++){
    const qr = quickReplies[i];
    const b = document.createElement('button');
    b.className = 'qr-btn';
    const txt = (qr && qr.text) ? qr.text : '';
    const label = txt.length > 24 ? txt.slice(0,24) + '...' : txt;
    b.textContent = label;
    b.title = txt;
    b.addEventListener('click', ()=>{
      // send qr text to all selected chats
      const ids = getSelectedChatIds();
      if (!ids.length) { statusEl.textContent = 'No chats selected'; return; }
      for (const id of ids) socket.emit('sendPreset', { chatId: id, text: txt });
      statusEl.textContent = `Sent quick reply to ${ids.length} chat(s)`;
    });
    container.appendChild(b);
  }

  if (quickReplies.length > 6){
    const more = document.createElement('button'); more.className='qr-btn';
    more.textContent = showAllQuickReplies ? 'Show less' : `+${quickReplies.length-6} more`;
    more.addEventListener('click', ()=>{ showAllQuickReplies = !showAllQuickReplies; renderQuickReplies(); });
    container.appendChild(more);
  }

  // render settings panel state if open
  renderQuickRepliesSettings();
}

function renderQuickRepliesSettings(){
  // render quick replies settings inline into sidebar if present
  let panel = document.getElementById('sidebar-quick-replies');
  if (!panel){
    // create container inside sidebar if exists
    const sidebar = document.getElementById('settings-sidebar');
    if (sidebar){ panel = document.createElement('div'); panel.id = 'sidebar-quick-replies'; panel.style.padding='8px'; panel.style.borderBottom='1px solid #eee'; sidebar.appendChild(panel); }
    else { panel = document.getElementById('qr-settings-panel'); if (!panel){ panel = document.createElement('div'); panel.id='qr-settings-panel'; panel.style.border='1px solid #ddd'; panel.style.padding='8px'; panel.style.marginTop='8px'; panel.style.background='#fff'; const header = document.querySelector('header'); if (header) header.parentNode.insertBefore(panel, header.nextSibling); else document.body.appendChild(panel); } }
  }
  // hide when closed
  if (!quickRepliesSettingsOpen){ panel.style.display = 'none'; return; }
  panel.style.display = 'block'; panel.innerHTML = ''; panel.style.padding = '12px';
  const titleRow = document.createElement('div'); titleRow.style.display='flex'; titleRow.style.alignItems='center'; titleRow.style.justifyContent='space-between';
  const title = document.createElement('div'); title.style.fontWeight='bold'; title.textContent = 'Quick Replies Settings';
  const toolbar = document.createElement('div'); toolbar.style.display='flex'; toolbar.style.gap='8px';
  // export button
  const exportBtn = document.createElement('button'); exportBtn.className='qr-btn'; exportBtn.textContent='Export';
  exportBtn.addEventListener('click', async ()=>{
    try {
      const res = await fetch('/api/quick-replies/export');
      if (!res.ok) { statusEl.textContent = 'Export failed'; return; }
      const rows = await res.json();
      const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `quick-replies-${Date.now()}.json`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      statusEl.textContent = 'Exported quick replies';
    } catch (err){ console.error(err); statusEl.textContent='Export failed'; }
  });
  // import button
  const importBtn = document.createElement('button'); importBtn.className='qr-btn'; importBtn.textContent='Import';
  // hidden file input
  let importInput = document.getElementById('qr-import-input');
  if (!importInput) {
    importInput = document.createElement('input'); importInput.type='file'; importInput.id='qr-import-input'; importInput.accept='.json,application/json'; importInput.style.display='none'; document.body.appendChild(importInput);
  }
  importBtn.addEventListener('click', ()=>{
    importInput.value = '';
    importInput.click();
  });
  importInput.addEventListener('change', async (ev)=>{
    const f = ev.target.files && ev.target.files[0];
    if (!f) return;
    try {
      const txt = await f.text();
      const parsed = JSON.parse(txt);
      const items = Array.isArray(parsed) ? parsed.map(x=> ({ text: x.text || x })) : (parsed.items || []);
      if (!items.length) { statusEl.textContent = 'No items to import'; return; }
      const replace = confirm('Replace existing quick replies? Click OK to replace, Cancel to append.');
      const res = await fetch('/api/quick-replies/import', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ items, replace }) });
      if (!res.ok) { statusEl.textContent = 'Import failed'; return; }
      await loadQuickRepliesFromServer();
      renderQuickRepliesSettings();
      statusEl.textContent = 'Imported quick replies';
    } catch (err) { console.error(err); statusEl.textContent='Import failed'; }
  });

  toolbar.appendChild(exportBtn); toolbar.appendChild(importBtn);
  titleRow.appendChild(title); titleRow.appendChild(toolbar);
  panel.appendChild(titleRow);
  if (!quickReplies || quickReplies.length === 0){ const empty = document.createElement('div'); empty.style.marginTop='8px'; empty.textContent = 'No quick replies defined.'; panel.appendChild(empty); return; }

  // list items
  quickReplies.forEach((qr, idx)=>{
    const row = document.createElement('div'); row.style.display='flex'; row.style.alignItems='center'; row.style.gap='8px'; row.style.padding='12px'; row.style.marginTop='0'; row.style.background= idx % 2 === 0 ? '#fff' : '#f9f9f9'; row.style.borderBottom='1px solid #e0e0e0';
    const label = document.createElement('div'); label.style.flex='1'; label.style.whiteSpace='pre-wrap'; label.style.fontSize='13px'; label.textContent = qr.text || '';
    const edit = document.createElement('button'); edit.className='qr-btn'; edit.textContent='Edit';
    edit.addEventListener('click', ()=>{
      openQuickReplyEditor(qr.text, (v)=>{
        if (v != null && v.trim() !== ''){
          updateQuickReplyOnServer(qr.id, v).then(()=>{ loadQuickRepliesFromServer(); renderQuickRepliesSettings(); }).catch(err=>{ console.error(err); statusEl.textContent='Failed to update'; });
        }
      });
    });
    const del = document.createElement('button'); del.className='qr-btn'; del.textContent='Delete';
    del.addEventListener('click', ()=>{
      if (!confirm('Delete this quick reply?')) return;
      deleteQuickReplyOnServer(qr.id).then(()=>{ loadQuickRepliesFromServer(); renderQuickRepliesSettings(); }).catch(err=>{ console.error(err); statusEl.textContent='Failed to delete'; });
    });
    row.appendChild(label); row.appendChild(edit); row.appendChild(del);
    panel.appendChild(row);
  });
}

// Ensure quick replies UI is present immediately
renderQuickReplies();

// Quick reply editor modal (multiline)
function openQuickReplyEditor(initialText, onSave){
  const modal = document.createElement('div'); modal.className='modal';
  const panel = document.createElement('div'); panel.className='panel';
  const header = document.createElement('div'); header.className='header';
  const hTitle = document.createElement('div'); hTitle.textContent = 'Quick Reply';
  const closeBtn = document.createElement('button'); closeBtn.textContent='Cancel';
  header.appendChild(hTitle); header.appendChild(closeBtn);
  const body = document.createElement('div'); body.className='body';
  const ta = document.createElement('textarea'); ta.style.width='100%'; ta.style.height='160px'; ta.value = initialText || '';
  body.appendChild(ta);
  const composer = document.createElement('div'); composer.className='composer';
  const saveBtn = document.createElement('button'); saveBtn.textContent='Save'; saveBtn.className='qr-btn primary';
  const cancelBtn = document.createElement('button'); cancelBtn.textContent='Cancel';
  composer.appendChild(cancelBtn); composer.appendChild(saveBtn);
  panel.appendChild(header); panel.appendChild(body); panel.appendChild(composer);
  modal.appendChild(panel); document.body.appendChild(modal);

  function close(v){ document.body.removeChild(modal); onSave(v); }
  closeBtn.addEventListener('click', ()=> close(null));
  cancelBtn.addEventListener('click', ()=> close(null));
  saveBtn.addEventListener('click', ()=> close(ta.value));
}

// ------------------ Tags client functions ------------------
async function loadTagsFromServer(){
  try {
    const res = await fetch('/api/tags/export');
    if (!res.ok) throw new Error('failed to load tags');
    const data = await res.json();
    tags = Array.isArray(data.tags) ? data.tags : (data || []);
    // build assignments map
    tagAssignments = {};
    const assigns = Array.isArray(data.assignments) ? data.assignments : (data.assignments || []);
    for (const a of assigns){
      if (!a.chat_id && !a.chatId) continue;
      const cid = a.chat_id || a.chatId;
      const tid = a.tag_id || a.tagId;
      if (!tagAssignments[cid]) tagAssignments[cid] = [];
      tagAssignments[cid].push(tid);
    }
  } catch (err){
    console.error('Failed to load tags', err);
    tags = [];
    tagAssignments = {};
  }
  renderTagFilterChips();
  renderChats();
}

async function createTagOnServer(name, color){
  const res = await fetch('/api/tags', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name, color }) });
  if (!res.ok) throw new Error('create tag failed');
  return await res.json();
}

async function updateTagOnServer(id, name, color){
  const res = await fetch(`/api/tags/${id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name, color }) });
  if (!res.ok) throw new Error('update tag failed');
  return await res.json();
}

async function deleteTagOnServer(id){
  const res = await fetch(`/api/tags/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('delete tag failed');
  return await res.json();
}

async function assignTagOnServer(tagId, chatId){
  const res = await fetch('/api/tags/assign', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ tagId, chatId }) });
  if (!res.ok) throw new Error('assign failed');
  return await res.json();
}

async function unassignTagOnServer(tagId, chatId){
  const res = await fetch('/api/tags/unassign', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ tagId, chatId }) });
  if (!res.ok) throw new Error('unassign failed');
  return await res.json();
}

function openTagEditor(initialName, initialColor, onSave){
  const modal = document.createElement('div'); modal.className='modal';
  const panel = document.createElement('div'); panel.className='panel';
  const header = document.createElement('div'); header.className='header';
  const hTitle = document.createElement('div'); hTitle.textContent = initialName ? 'Edit Tag' : 'New Tag';
  const closeBtn = document.createElement('button'); closeBtn.textContent='Cancel';
  header.appendChild(hTitle); header.appendChild(closeBtn);
  const body = document.createElement('div'); body.className='body';
  const nameInput = document.createElement('input'); nameInput.placeholder='Tag name'; nameInput.value = initialName || '';
  const colorInput = document.createElement('input'); colorInput.type='color'; colorInput.value = initialColor || '#ffcc00';
  body.appendChild(nameInput); body.appendChild(document.createElement('br'));
  body.appendChild(colorInput);
  const composer = document.createElement('div'); composer.className='composer';
  const saveBtn = document.createElement('button'); saveBtn.textContent='Save'; saveBtn.className='qr-btn primary';
  const cancelBtn = document.createElement('button'); cancelBtn.textContent='Cancel';
  composer.appendChild(cancelBtn); composer.appendChild(saveBtn);
  panel.appendChild(header); panel.appendChild(body); panel.appendChild(composer); modal.appendChild(panel); document.body.appendChild(modal);
  function close(v){ document.body.removeChild(modal); onSave(v); }
  closeBtn.addEventListener('click', ()=> close(null));
  cancelBtn.addEventListener('click', ()=> close(null));
  saveBtn.addEventListener('click', ()=> close({ name: nameInput.value.trim(), color: colorInput.value }));
}

// ------------------ Notes client functions ------------------
const NOTES_API = '/api/notes';

async function loadNotesForChat(chatId){
  try {
    const res = await fetch(`${NOTES_API}?chatId=${encodeURIComponent(chatId)}`);
    if (!res.ok) throw new Error('failed to load notes');
    return await res.json();
  } catch (err){
    console.error('Failed to load notes', err);
    return [];
  }
}

async function createNoteOnServer(chatId, text){
  const res = await fetch(NOTES_API, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ chatId, text }) });
  if (!res.ok) throw new Error('create note failed');
  return await res.json();
}

async function updateNoteOnServer(id, text){
  const res = await fetch(`${NOTES_API}/${id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ text }) });
  if (!res.ok) throw new Error('update note failed');
  return await res.json();
}

async function deleteNoteOnServer(id){
  const res = await fetch(`${NOTES_API}/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('delete note failed');
  return await res.json();
}

function openNotesModal(chatId, title){
  const modal = document.createElement('div'); modal.className='modal';
  const panel = document.createElement('div'); panel.className='panel';
  const header = document.createElement('div'); header.className='header';
  const hTitle = document.createElement('div'); hTitle.textContent = `Notes — ${title}`;
  const closeBtn = document.createElement('button'); closeBtn.textContent='Close';
  // export/import controls
  const exportBtn = document.createElement('button'); exportBtn.className='qr-btn'; exportBtn.textContent='Export';
  const importBtn = document.createElement('button'); importBtn.className='qr-btn'; importBtn.textContent='Import';
  // hidden file input for import
  let notesImportInput = document.getElementById('notes-import-input');
  if (!notesImportInput) { notesImportInput = document.createElement('input'); notesImportInput.type = 'file'; notesImportInput.id = 'notes-import-input'; notesImportInput.accept = '.json,application/json'; notesImportInput.style.display = 'none'; document.body.appendChild(notesImportInput); }

  exportBtn.addEventListener('click', async ()=>{
    try {
      const res = await fetch(`/api/notes/export?chatId=${encodeURIComponent(chatId)}`);
      if (!res.ok) { statusEl.textContent = 'Export failed'; return; }
      const rows = await res.json();
      const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `notes-${chatId || 'all'}-${Date.now()}.json`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      statusEl.textContent = 'Exported notes';
    } catch (err) { console.error(err); statusEl.textContent = 'Export failed'; }
  });

  importBtn.addEventListener('click', ()=>{ notesImportInput.value = ''; notesImportInput.click(); });
  notesImportInput.addEventListener('change', async (ev)=>{
    const f = ev.target.files && ev.target.files[0]; if (!f) return;
    try {
      const txt = await f.text();
      const parsed = JSON.parse(txt);
      // expect array or object { notes: [...] }
      const items = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.notes) ? parsed.notes : []);
      if (!items.length) { statusEl.textContent = 'No notes to import'; return; }
      const append = true; // default to append as requested
      const res = await fetch('/api/notes/import', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ notes: items, replace: !append }) });
      if (!res.ok) { statusEl.textContent = 'Import failed'; return; }
      const js = await res.json();
      statusEl.textContent = `Imported notes: ${js.imported || 0}`;
      await loadNotesCountsFromServer();
      await refresh();
    } catch (err) { console.error(err); statusEl.textContent = 'Import failed'; }
  });

  header.appendChild(hTitle); header.appendChild(exportBtn); header.appendChild(importBtn); header.appendChild(closeBtn);
  const body = document.createElement('div'); body.className='body';
  const composer = document.createElement('div'); composer.className='composer';
  const input = document.createElement('textarea'); input.placeholder='Type note (Ctrl+Enter to save)'; input.style.width='100%'; input.style.height='64px';
  composer.appendChild(input);
  const saveRow = document.createElement('div'); saveRow.style.display='flex'; saveRow.style.justifyContent='flex-end'; saveRow.style.marginTop='6px';
  const saveBtn = document.createElement('button'); saveBtn.className='qr-btn primary'; saveBtn.textContent='Add Note';
  saveRow.appendChild(saveBtn);
  panel.appendChild(header); panel.appendChild(body); panel.appendChild(composer); panel.appendChild(saveRow); modal.appendChild(panel); document.body.appendChild(modal);

  closeBtn.addEventListener('click', ()=>{ document.body.removeChild(modal); });

  async function refresh(){
    body.innerHTML = '<em>Loading...</em>';
    const notes = await loadNotesForChat(chatId);
    body.innerHTML = '';
    if (!notes || notes.length === 0){ body.innerHTML = '<div style="color:#666">No notes</div>'; return; }
    for (const n of notes){
      const row = document.createElement('div'); row.style.display='flex'; row.style.flexDirection='column'; row.style.gap='6px'; row.style.marginBottom='12px'; row.style.padding='8px'; row.style.border='1px solid #eee'; row.style.borderRadius='6px'; row.style.background='#fff';
      const txt = document.createElement('div'); txt.style.whiteSpace='pre-wrap'; txt.style.fontSize='13px'; txt.textContent = n.text;
      const metaRow = document.createElement('div'); metaRow.style.display='flex'; metaRow.style.justifyContent='space-between'; metaRow.style.alignItems='center';
      const meta = document.createElement('div'); meta.style.fontSize='11px'; meta.style.color='#666'; meta.textContent = n.updatedAt ? `Updated ${new Date(n.updatedAt).toLocaleString()}` : (n.createdAt ? new Date(n.createdAt).toLocaleString() : '');
      const actions = document.createElement('div');
      const edit = document.createElement('button'); edit.className='qr-btn'; edit.textContent='Edit';
      const del = document.createElement('button'); del.className='qr-btn'; del.textContent='Delete';
      edit.addEventListener('click', ()=>{
        const emodal = document.createElement('div'); emodal.className='modal';
        const epanel = document.createElement('div'); epanel.className='panel';
        const eheader = document.createElement('div'); eheader.className='header'; const eh = document.createElement('div'); eh.textContent='Edit Note'; const eclose = document.createElement('button'); eclose.textContent='Cancel'; eheader.appendChild(eh); eheader.appendChild(eclose);
        const ebody = document.createElement('div'); ebody.className='body';
        const ta = document.createElement('textarea'); ta.style.width='100%'; ta.style.height='160px'; ta.value = n.text || '';
        ebody.appendChild(ta);
        const ecomp = document.createElement('div'); ecomp.className='composer'; const esave = document.createElement('button'); esave.className='qr-btn primary'; esave.textContent='Save'; const ecancel = document.createElement('button'); ecancel.textContent='Cancel'; ecomp.appendChild(ecancel); ecomp.appendChild(esave);
        epanel.appendChild(eheader); epanel.appendChild(ebody); epanel.appendChild(ecomp); emodal.appendChild(epanel); document.body.appendChild(emodal);
        eclose.addEventListener('click', ()=> document.body.removeChild(emodal)); ecancel.addEventListener('click', ()=> document.body.removeChild(emodal));
        esave.addEventListener('click', async ()=>{
          const v = ta.value && ta.value.trim();
          if (!v) { alert('Note cannot be empty'); return; }
          try { await updateNoteOnServer(n.id, v); document.body.removeChild(emodal); await refresh(); statusEl.textContent = 'Note updated'; await loadNotesCountsFromServer(); } catch (err){ console.error(err); alert('Failed to update'); }
        });
      });
      del.addEventListener('click', ()=>{
        if (!confirm('Delete this note?')) return;
        deleteNoteOnServer(n.id).then(async ()=>{ await refresh(); await loadNotesCountsFromServer(); }).catch(err=>{ console.error(err); alert('Failed to delete'); });
      });
      actions.appendChild(edit); actions.appendChild(del);
      metaRow.appendChild(meta); metaRow.appendChild(actions);
      row.appendChild(txt); row.appendChild(metaRow);
      body.appendChild(row);
    }
  }

  saveBtn.addEventListener('click', async ()=>{
    const v = input.value && input.value.trim();
    if (!v) return; try { await createNoteOnServer(chatId, v); input.value = ''; await refresh(); statusEl.textContent = 'Note added'; await loadNotesCountsFromServer(); } catch (err){ console.error(err); statusEl.textContent='Failed to add note'; }
  });

  input.addEventListener('keydown', async (e)=>{ if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { saveBtn.click(); } });

  refresh();
}

// Show a floating notes preview bubble near an anchor element.
async function showNotesPreviewBubble(chatId, anchorEl){
  // Avoid duplicate
  if (anchorEl._noteBubble) return;

  const notes = await loadNotesForChat(chatId);
  // Don't show bubble if no notes available
  if (!notes || notes.length === 0) return;

  const rect = anchorEl.getBoundingClientRect();
  const bubble = document.createElement('div');
  bubble.className = 'context-menu';
  bubble.style.position = 'fixed';
  // try to place to the right, fallback to left when off-screen
  const width = 320;
  let left = rect.right + 8;
  if (left + width > window.innerWidth) left = Math.max(8, rect.left - width - 8);
  let top = rect.top;
  if (top + 200 > window.innerHeight) top = Math.max(8, window.innerHeight - 220);
  bubble.style.left = left + 'px';
  bubble.style.top = top + 'px';
  bubble.style.width = width + 'px';
  bubble.style.maxHeight = '220px';
  bubble.style.overflowY = 'auto';
  bubble.style.background = '#fff';
  bubble.style.border = '1px solid #ccc';
  bubble.style.borderRadius = '8px';
  bubble.style.padding = '8px';
  bubble.style.boxShadow = '0 8px 24px rgba(0,0,0,0.12)';
  bubble.style.zIndex = 99999;

  const hdr = document.createElement('div'); hdr.style.fontWeight='bold'; hdr.style.marginBottom='6px'; hdr.textContent = 'Notes Preview';
  bubble.appendChild(hdr);

  const list = document.createElement('div'); list.style.display='flex'; list.style.flexDirection='column'; list.style.gap='8px';
  const showCount = Math.min(3, notes.length);
  for (let i=0;i<showCount;i++){
    const n = notes[i];
    const item = document.createElement('div'); item.style.padding='8px'; item.style.border='1px solid #f0f0f0'; item.style.borderRadius='6px'; item.style.background='#fff';
    const t = document.createElement('div'); t.style.whiteSpace='pre-wrap'; t.style.fontSize='13px'; t.textContent = n.text;
    const meta = document.createElement('div'); meta.style.fontSize='11px'; meta.style.color='#666'; meta.style.marginTop='6px'; meta.textContent = n.updatedAt ? `Updated ${new Date(n.updatedAt).toLocaleString()}` : (n.createdAt ? new Date(n.createdAt).toLocaleString() : '');
    item.appendChild(t); item.appendChild(meta);
    list.appendChild(item);
  }
  if (notes.length > 3){
    // make list scrollable (bubble already has overflow)
    const more = document.createElement('div'); more.style.fontSize='12px'; more.style.color='#666'; more.style.marginTop='6px'; more.textContent = `${notes.length - 3} more... scroll to see`;
    list.appendChild(more);
  }
  bubble.appendChild(list);

  // attach hover behavior: when mouse leaves both anchor and bubble, remove
  let hovered = false;
  bubble.addEventListener('mouseenter', ()=>{ hovered = true; });
  bubble.addEventListener('mouseleave', ()=>{ hovered = false; setTimeout(()=>{ if (!hovered && anchorEl._noteBubble){ anchorEl._noteBubble.remove(); anchorEl._noteBubble = null; } }, 120); });

  document.body.appendChild(bubble);
  anchorEl._noteBubble = bubble;
}

// Remove preview bubble if exists for element
function hideNotesPreviewBubble(anchorEl){
  if (!anchorEl) return;
  if (anchorEl._noteBubble){
    try { anchorEl._noteBubble.remove(); } catch (e) {}
    anchorEl._noteBubble = null;
  }
}

// small context menu implementation
let currentContextMenu = null;
function openTagContextMenu(x, y, chatId){
  if (currentContextMenu) { currentContextMenu.remove(); currentContextMenu = null; }
  const menu = document.createElement('div'); menu.className='context-menu';
  menu.style.position='fixed'; menu.style.left = (x) + 'px'; menu.style.top = (y) + 'px'; menu.style.background='#fff'; menu.style.border='1px solid #ccc'; menu.style.borderRadius='6px'; menu.style.padding='0'; menu.style.zIndex = 9999; menu.style.minWidth='240px'; menu.style.boxShadow='0 2px 10px rgba(0,0,0,0.2)'; menu.style.overflow='hidden';
  const title = document.createElement('div'); title.style.fontWeight='bold'; title.style.padding='10px 12px'; title.style.fontSize='13px'; title.style.color='#666'; title.style.borderBottom='1px solid #eee'; title.textContent = 'Tags'; menu.appendChild(title);
  
  // Get Archived tag ID to filter it out and check archive status
  const archivedTag = tags.find(t => t.name === 'Archived' && t.is_system);
  const archivedTagId = archivedTag ? archivedTag.id : null;
  const isArchived = archivedTagId ? (tagAssignments[chatId]||[]).some(id => String(id) === String(archivedTagId)) : false;
  
  // list tags as clickable menu items (excluding Archived tag)
  const nonSystemTags = tags.filter(t => !(t.name === 'Archived' && t.is_system));
  if (nonSystemTags && nonSystemTags.length > 0) {
    for (const t of nonSystemTags){
      const isAssigned = (tagAssignments[chatId]||[]).some(id => String(id) === String(t.id));
      const row = document.createElement('div'); row.style.padding='10px 12px'; row.style.cursor='pointer'; row.style.display='flex'; row.style.alignItems='center'; row.style.userSelect='none'; row.style.fontSize='13px';
      row.style.backgroundColor = isAssigned ? '#f0f0f0' : '#fff';
      row.style.borderBottom='1px solid #f0f0f0';
      row.addEventListener('mouseenter', ()=>{ row.style.backgroundColor = '#e8e8e8'; });
      row.addEventListener('mouseleave', ()=>{ row.style.backgroundColor = isAssigned ? '#f0f0f0' : '#fff'; });
      const checkmark = document.createElement('span'); checkmark.style.width='16px'; checkmark.style.marginRight='10px'; checkmark.style.display='inline-block'; checkmark.textContent = isAssigned ? '✓' : ''; checkmark.style.fontWeight='bold'; checkmark.style.color=t.color || '#999';
      const colorDot = document.createElement('span'); colorDot.style.width='10px'; colorDot.style.height='10px'; colorDot.style.borderRadius='5px'; colorDot.style.background = t.color || '#999'; colorDot.style.display='inline-block'; colorDot.style.marginRight='8px'; colorDot.style.flexShrink = 0;
      const lbl = document.createElement('span'); lbl.textContent = t.name; lbl.style.flex = 1;
      row.appendChild(checkmark); row.appendChild(colorDot); row.appendChild(lbl);
      row.addEventListener('click', async ()=>{
        try {
          if (isAssigned) await unassignTagOnServer(t.id, chatId); else await assignTagOnServer(t.id, chatId);
          await loadTagsFromServer();
          if (currentContextMenu) currentContextMenu.remove(); currentContextMenu = null;
        } catch (err){ console.error(err); alert('Failed to update tag assignment'); }
      });
      menu.appendChild(row);
    }
  } else {
    const empty = document.createElement('div'); empty.style.padding='10px 12px'; empty.style.fontSize='13px'; empty.style.color='#999'; empty.textContent = 'No tags yet'; menu.appendChild(empty);
  }
  // separator
  const sep = document.createElement('div'); sep.style.height='1px'; sep.style.background='#ddd'; menu.appendChild(sep);
  // create new tag action
  const createRow = document.createElement('div'); createRow.style.padding='10px 12px'; createRow.style.cursor='pointer'; createRow.style.fontSize='13px'; createRow.style.userSelect='none'; createRow.textContent = '+ Create New Tag';
  createRow.addEventListener('mouseenter', ()=>{ createRow.style.backgroundColor = '#e8e8e8'; });
  createRow.addEventListener('mouseleave', ()=>{ createRow.style.backgroundColor = '#fff'; });
  createRow.addEventListener('click', ()=>{
    if (currentContextMenu) currentContextMenu.remove(); currentContextMenu = null;
    openTagEditor('', '#ffcc00', async (v)=>{ if (!v) return; const created = await createTagOnServer(v.name, v.color); await assignTagOnServer(created.id, chatId); await loadTagsFromServer(); });
  });
  menu.appendChild(createRow);

  // Notes actions
  const notesTitle = document.createElement('div'); notesTitle.style.padding='8px 12px'; notesTitle.style.fontSize='13px'; notesTitle.style.color='#666'; notesTitle.style.borderTop='1px solid #eee'; notesTitle.textContent = 'Notes'; menu.appendChild(notesTitle);
  const addNoteRow = document.createElement('div'); addNoteRow.style.padding='10px 12px'; addNoteRow.style.cursor='pointer'; addNoteRow.style.fontSize='13px'; addNoteRow.style.userSelect='none'; addNoteRow.textContent = '+ Add Note';
  addNoteRow.addEventListener('mouseenter', ()=>{ addNoteRow.style.backgroundColor = '#e8e8e8'; });
  addNoteRow.addEventListener('mouseleave', ()=>{ addNoteRow.style.backgroundColor = '#fff'; });
  addNoteRow.addEventListener('click', ()=>{
    if (currentContextMenu) currentContextMenu.remove(); currentContextMenu = null;
    const c = chats.find(x=>x.chatId === chatId);
    const title = c ? (c.name || c.chatId) : chatId;
    openNotesModal(chatId, title);
  });
  menu.appendChild(addNoteRow);
  const viewNotesRow = document.createElement('div'); viewNotesRow.style.padding='10px 12px'; viewNotesRow.style.cursor='pointer'; viewNotesRow.style.fontSize='13px'; viewNotesRow.style.userSelect='none'; viewNotesRow.textContent = 'Edit Notes';
  viewNotesRow.addEventListener('mouseenter', ()=>{ viewNotesRow.style.backgroundColor = '#e8e8e8'; });
  viewNotesRow.addEventListener('mouseleave', ()=>{ viewNotesRow.style.backgroundColor = '#fff'; });
  viewNotesRow.addEventListener('click', ()=>{
    if (currentContextMenu) currentContextMenu.remove(); currentContextMenu = null;
    const c = chats.find(x=>x.chatId === chatId);
    const title = c ? (c.name || c.chatId) : chatId;
    openNotesModal(chatId, title);
  });
  menu.appendChild(viewNotesRow);

  // Archive action - dynamic text based on current archive state
  const actionsTitle = document.createElement('div'); actionsTitle.style.padding='8px 12px'; actionsTitle.style.fontSize='13px'; actionsTitle.style.color='#666'; actionsTitle.style.borderTop='1px solid #eee'; actionsTitle.textContent = 'Actions'; menu.appendChild(actionsTitle);
  const archiveRow = document.createElement('div'); archiveRow.style.padding='10px 12px'; archiveRow.style.cursor='pointer'; archiveRow.style.fontSize='13px'; archiveRow.style.userSelect='none';
  archiveRow.textContent = isArchived ? '📂 Unarchive Chat' : '📦 Archive Chat';
  archiveRow.addEventListener('mouseenter', ()=>{ archiveRow.style.backgroundColor = '#e8e8e8'; });
  archiveRow.addEventListener('mouseleave', ()=>{ archiveRow.style.backgroundColor = '#fff'; });
  archiveRow.addEventListener('click', ()=>{
    if (currentContextMenu) currentContextMenu.remove(); currentContextMenu = null;
    if (isArchived) {
      unarchiveChat(chatId);
    } else {
      archiveChat(chatId);
    }
  });
  menu.appendChild(archiveRow);

  document.body.appendChild(menu); currentContextMenu = menu;
  const removeMenu = ()=>{ if (currentContextMenu && currentContextMenu === menu){ currentContextMenu.remove(); currentContextMenu = null; } document.removeEventListener('click', removeMenu); };
  setTimeout(()=> document.addEventListener('click', removeMenu), 50);
}

// Archive a chat in WhatsApp and assign the Archived tag
function archiveChat(chatId){
  socket.emit('archiveChat', { chatId });
  statusEl.textContent = 'Archiving chat...';
}

// Unarchive a chat in WhatsApp and remove the Archived tag
function unarchiveChat(chatId){
  socket.emit('unarchiveChat', { chatId });
  statusEl.textContent = 'Unarchiving chat...';
}

function renderTagFilterChips(){
  let container = document.getElementById('tag-filter-chips');
  if (!container) return;
  container.innerHTML = '';
  if (tags && tags.length > 0) {
    tags.forEach(t=>{
      const chip = document.createElement('button');
      chip.className='tag-chip';
      chip.textContent = t.name;
      const isActive = selectedTagFilters.has(String(t.id));
      if (isActive) {
        chip.style.background = t.color || '#25D366';
        chip.style.borderColor = t.color || '#25D366';
        chip.style.color = '#fff';
      } else {
        chip.style.background = '#fff';
        chip.style.borderColor = '#d1d7db';
        chip.style.color = '#3b4a54';
      }
      chip.addEventListener('click', ()=>{ if (selectedTagFilters.has(String(t.id))) selectedTagFilters.delete(String(t.id)); else selectedTagFilters.add(String(t.id)); renderTagFilterChips(); renderChats(); });
      container.appendChild(chip);
    });
    // show 'All Chats' button only when filters are active
    if (selectedTagFilters.size > 0) {
      const allBtn = document.createElement('button');
      allBtn.textContent = 'All Chats';
      allBtn.title = 'Show all chats';
      allBtn.className = 'qr-btn';
      allBtn.style.marginLeft = '8px';
      allBtn.addEventListener('click', ()=>{ selectedTagFilters.clear(); renderTagFilterChips(); renderChats(); });
      container.appendChild(allBtn);
    }
  }
  // settings moved to central sidebar (created at init)
  createSettingsSidebar();
}

// Create a left settings sidebar with inline areas for Tags, Notes, Quick Replies
function createSettingsSidebar(){
  if (document.getElementById('settings-sidebar')) return;
  const sidebar = document.createElement('div'); sidebar.id = 'settings-sidebar';
  sidebar.style.position = 'fixed'; sidebar.style.left = '-308px'; sidebar.style.top = '0'; sidebar.style.width = '308px'; sidebar.style.height = '100vh'; sidebar.style.overflowY = 'auto'; sidebar.style.background = '#fff'; sidebar.style.borderRight = '1px solid #e1e1e1'; sidebar.style.boxShadow = '2px 0 8px rgba(0,0,0,0.1)'; sidebar.style.zIndex = 1200; sidebar.style.transition = 'left 0.3s ease';

  const headerRow = document.createElement('div'); headerRow.style.display='flex'; headerRow.style.alignItems='center'; headerRow.style.justifyContent='space-between'; headerRow.style.padding='16px'; headerRow.style.borderBottom='1px solid #f0f0f0'; headerRow.style.background='#f7f7f7';
  const title = document.createElement('div'); title.style.fontWeight='600'; title.style.fontSize='18px'; title.textContent = 'Settings';
  const closeBtn = document.createElement('button'); closeBtn.textContent = '✕'; closeBtn.style.background='none'; closeBtn.style.border='none'; closeBtn.style.fontSize='20px'; closeBtn.style.cursor='pointer'; closeBtn.style.color='#666';
  closeBtn.addEventListener('click', ()=> toggleSidebar());
  headerRow.appendChild(title); headerRow.appendChild(closeBtn); sidebar.appendChild(headerRow);

  // containers with WhatsApp-style section headers (clickable rows)
  const tagsSection = document.createElement('div'); tagsSection.style.borderBottom='1px solid #f0f0f0';
  const tagsHdr = document.createElement('div'); tagsHdr.style.padding='16px'; tagsHdr.style.cursor='pointer'; tagsHdr.style.display='flex'; tagsHdr.style.justifyContent='space-between'; tagsHdr.style.alignItems='center'; tagsHdr.style.background='#fff'; tagsHdr.addEventListener('mouseenter', ()=> tagsHdr.style.background='#f5f5f5'); tagsHdr.addEventListener('mouseleave', ()=> tagsHdr.style.background='#fff');
  const tagsLabel = document.createElement('div'); tagsLabel.textContent = 'Tags'; tagsLabel.style.fontSize='15px';
  const tagsChevron = document.createElement('span'); tagsChevron.textContent = '›'; tagsChevron.style.fontSize='20px'; tagsChevron.style.color='#999';
  tagsHdr.appendChild(tagsLabel); tagsHdr.appendChild(tagsChevron); tagsSection.appendChild(tagsHdr);
  const tagsContent = document.createElement('div'); tagsContent.id = 'sidebar-tags'; tagsContent.style.display='none'; tagsContent.style.padding='0'; tagsContent.style.background='#fafafa'; tagsSection.appendChild(tagsContent);
  tagsHdr.addEventListener('click', ()=>{ tagsSettingsOpen = !tagsSettingsOpen; tagsChevron.textContent = tagsSettingsOpen ? '▾' : '›'; renderTagsSettings(); });
  sidebar.appendChild(tagsSection);

  const notesSection = document.createElement('div'); notesSection.style.borderBottom='1px solid #f0f0f0';
  const notesHdr = document.createElement('div'); notesHdr.style.padding='16px'; notesHdr.style.cursor='pointer'; notesHdr.style.display='flex'; notesHdr.style.justifyContent='space-between'; notesHdr.style.alignItems='center'; notesHdr.style.background='#fff'; notesHdr.addEventListener('mouseenter', ()=> notesHdr.style.background='#f5f5f5'); notesHdr.addEventListener('mouseleave', ()=> notesHdr.style.background='#fff');
  const notesLabel = document.createElement('div'); notesLabel.textContent = 'Notes'; notesLabel.style.fontSize='15px';
  const notesChevron = document.createElement('span'); notesChevron.textContent = '›'; notesChevron.style.fontSize='20px'; notesChevron.style.color='#999';
  notesHdr.appendChild(notesLabel); notesHdr.appendChild(notesChevron); notesSection.appendChild(notesHdr);
  const notesContent = document.createElement('div'); notesContent.id = 'sidebar-notes'; notesContent.style.display='none'; notesContent.style.padding='0'; notesContent.style.background='#fafafa'; notesSection.appendChild(notesContent);
  notesHdr.addEventListener('click', ()=>{ notesSettingsOpen = !notesSettingsOpen; notesChevron.textContent = notesSettingsOpen ? '▾' : '›'; renderNotesSettings(); });
  sidebar.appendChild(notesSection);

  const qrSection = document.createElement('div'); qrSection.style.borderBottom='1px solid #f0f0f0';
  const qrHdr = document.createElement('div'); qrHdr.style.padding='16px'; qrHdr.style.cursor='pointer'; qrHdr.style.display='flex'; qrHdr.style.justifyContent='space-between'; qrHdr.style.alignItems='center'; qrHdr.style.background='#fff'; qrHdr.addEventListener('mouseenter', ()=> qrHdr.style.background='#f5f5f5'); qrHdr.addEventListener('mouseleave', ()=> qrHdr.style.background='#fff');
  const qrLabel = document.createElement('div'); qrLabel.textContent = 'Quick Replies'; qrLabel.style.fontSize='15px';
  const qrChevron = document.createElement('span'); qrChevron.textContent = '›'; qrChevron.style.fontSize='20px'; qrChevron.style.color='#999';
  qrHdr.appendChild(qrLabel); qrHdr.appendChild(qrChevron); qrSection.appendChild(qrHdr);
  const qrContent = document.createElement('div'); qrContent.id = 'sidebar-quick-replies'; qrContent.style.display='none'; qrContent.style.padding='0'; qrContent.style.background='#fafafa'; qrSection.appendChild(qrContent);
  qrHdr.addEventListener('click', ()=>{ quickRepliesSettingsOpen = !quickRepliesSettingsOpen; qrChevron.textContent = quickRepliesSettingsOpen ? '▾' : '›'; renderQuickRepliesSettings(); });
  sidebar.appendChild(qrSection);

  // Logout button at bottom
  const logoutSection = document.createElement('div'); logoutSection.style.borderTop='1px solid #f0f0f0'; logoutSection.style.marginTop='auto';
  const logout = document.createElement('div'); logout.style.padding='16px'; logout.style.cursor='pointer'; logout.style.textAlign='center'; logout.style.color='#d9534f'; logout.style.fontSize='15px'; logout.textContent='Logout WhatsApp Session'; logout.style.background='#fff'; logout.addEventListener('mouseenter', ()=> logout.style.background='#fff5f5'); logout.addEventListener('mouseleave', ()=> logout.style.background='#fff');
  logout.addEventListener('click', async ()=>{ if (!confirm('Logout WhatsApp session?')) return; try { const res = await fetch('/api/logout', { method: 'POST' }); if (!res.ok) { statusEl.textContent='Logout failed'; return; } statusEl.textContent='Logged out'; setTimeout(()=> location.reload(), 700); } catch (err){ console.error(err); statusEl.textContent='Logout failed'; } });
  logoutSection.appendChild(logout); sidebar.appendChild(logoutSection);

  document.body.appendChild(sidebar);

  // Add hamburger menu to header
  const header = document.querySelector('header');
  const existingHamburger = document.getElementById('hamburger-menu');
  if (existingHamburger){
    existingHamburger.style.display = 'block';
    existingHamburger.innerHTML = '☰';
    existingHamburger.style.background='none';
    existingHamburger.style.border='none';
    existingHamburger.style.fontSize='24px';
    existingHamburger.style.cursor='pointer';
    existingHamburger.style.padding='8px 12px';
    existingHamburger.style.marginRight='12px';
    existingHamburger.style.color='#54656f';
    existingHamburger.addEventListener('click', ()=> toggleSidebar());
  }
}

function toggleSidebar(){
  const sidebar = document.getElementById('settings-sidebar');
  const messages = document.getElementById('messages');
  if (!sidebar) return;
  sidebarVisible = !sidebarVisible;
  if (sidebarVisible){
    sidebar.style.left = '0';
    if (messages) messages.style.marginLeft = '308px';
  } else {
    sidebar.style.left = '-308px';
    if (messages) messages.style.marginLeft = '0';
  }
}

function renderNotesSettings(){
  // render notes settings inline into sidebar if present
  let panel = document.getElementById('sidebar-notes');
  if (!panel){
    const sidebar = document.getElementById('settings-sidebar');
    if (sidebar){
      panel = document.createElement('div'); panel.id = 'sidebar-notes'; panel.style.padding='8px'; panel.style.borderBottom='1px solid #eee'; sidebar.appendChild(panel);
    } else {
      // fallback to modal-like floating panel
      panel = document.createElement('div'); panel.id = 'notes-settings-panel'; panel.style.border = '1px solid #ddd'; panel.style.padding = '8px'; panel.style.marginTop = '8px'; panel.style.background = '#fff'; const header = document.querySelector('header'); if (header) header.parentNode.insertBefore(panel, header.nextSibling); else document.body.appendChild(panel);
    }
  }
  if (!notesSettingsOpen){ panel.style.display = 'none'; return; }
  panel.style.display = 'block'; panel.innerHTML = ''; panel.style.padding = '12px';

  const title = document.createElement('div'); title.style.fontWeight='bold'; title.textContent = 'Notes Settings'; title.style.marginBottom='12px'; panel.appendChild(title);
  const btnRow = document.createElement('div'); btnRow.style.display='flex'; btnRow.style.gap='8px'; btnRow.style.marginBottom='12px';
  const exportBtn = document.createElement('button'); exportBtn.className='qr-btn'; exportBtn.textContent = 'Export All Notes';
  const importBtn = document.createElement('button'); importBtn.className='qr-btn'; importBtn.textContent = 'Import Notes (Append)';
  btnRow.appendChild(exportBtn); btnRow.appendChild(importBtn); panel.appendChild(btnRow);
  const info = document.createElement('div'); info.style.marginTop = '8px'; info.style.color='#666'; info.style.fontSize='12px'; info.textContent = 'Export creates a JSON backup of all notes. Import will append notes to matching chats using chatId or phone number fallback.';
  panel.appendChild(info);

  // hidden input for import
  let importInput = document.getElementById('notes-import-all-input');
  if (!importInput){ importInput = document.createElement('input'); importInput.type='file'; importInput.id='notes-import-all-input'; importInput.accept='.json,application/json'; importInput.style.display='none'; document.body.appendChild(importInput); }

  exportBtn.addEventListener('click', async ()=>{
    try {
      const res = await fetch('/api/notes/export');
      if (!res.ok) { statusEl.textContent = 'Export failed'; return; }
      const rows = await res.json();
      const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `notes-all-${Date.now()}.json`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      statusEl.textContent = 'Exported all notes';
    } catch (err){ console.error(err); statusEl.textContent = 'Export failed'; }
  });

  importBtn.addEventListener('click', ()=>{ importInput.value = ''; importInput.click(); });
  importInput.addEventListener('change', async (ev)=>{
    const f = ev.target.files && ev.target.files[0]; if (!f) return;
    try {
      const txt = await f.text();
      const parsed = JSON.parse(txt);
      const items = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.notes) ? parsed.notes : []);
      if (!items.length) { statusEl.textContent = 'No notes to import'; return; }
      // append by default
      const res = await fetch('/api/notes/import', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ notes: items, replace: false }) });
      if (!res.ok) { statusEl.textContent = 'Import failed'; return; }
      const js = await res.json();
      statusEl.textContent = `Import: ${js.imported || 0} imported, ${js.failed || 0} failed`;
      await loadNotesCountsFromServer();
      renderNotesSettings();
    } catch (err){ console.error(err); statusEl.textContent = 'Import failed'; }
  });
}

function renderTagsSettings(){
  // prefer rendering inside the left settings sidebar if present
  let panel = document.getElementById('sidebar-tags');
  if (!panel){
    // create container inside sidebar if sidebar exists
    const sidebar = document.getElementById('settings-sidebar');
    if (sidebar){
      panel = document.createElement('div'); panel.id = 'sidebar-tags'; panel.style.padding = '8px'; panel.style.borderBottom = '1px solid #eee'; sidebar.appendChild(panel);
    } else {
      // fallback to old floating panel
      panel = document.getElementById('tags-settings-panel');
      if (!panel){ panel = document.createElement('div'); panel.id = 'tags-settings-panel'; panel.style.border = '1px solid #ddd'; panel.style.padding = '8px'; panel.style.marginTop = '8px'; panel.style.background = '#fff'; const header = document.querySelector('header'); if (header) header.parentNode.insertBefore(panel, header.nextSibling); else document.body.appendChild(panel); }
    }
  }

  if (!tagsSettingsOpen){ panel.style.display = 'none'; return; }
  panel.style.display = 'block'; panel.innerHTML = ''; panel.style.padding = '12px';

  const titleRow = document.createElement('div'); titleRow.style.display='flex'; titleRow.style.alignItems='center'; titleRow.style.justifyContent='space-between';
  const title = document.createElement('div'); title.style.fontWeight='bold'; title.textContent = 'Tags Settings';
  const toolbar = document.createElement('div'); toolbar.style.display='flex'; toolbar.style.gap='8px';
  const exportBtn = document.createElement('button'); exportBtn.className='qr-btn'; exportBtn.textContent='Export';
  exportBtn.addEventListener('click', async ()=>{ try { const res = await fetch('/api/tags/export'); if (!res.ok) { statusEl.textContent='Export failed'; return; } const js = await res.json(); const blob = new Blob([JSON.stringify(js, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `tags-${Date.now()}.json`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); statusEl.textContent='Exported tags'; } catch (err){ console.error(err); statusEl.textContent='Export failed'; } });
  const importBtn = document.createElement('button'); importBtn.className='qr-btn'; importBtn.textContent='Import';
  let importInput = document.getElementById('tags-import-input');
  if (!importInput){ importInput = document.createElement('input'); importInput.type='file'; importInput.id='tags-import-input'; importInput.accept='.json,application/json'; importInput.style.display='none'; document.body.appendChild(importInput); }
  importBtn.addEventListener('click', ()=>{ importInput.value=''; importInput.click(); });

  // Attach the change handler only once
  if (!tagsImportHandlerAttached) {
    tagsImportHandlerAttached = true;
    importInput.addEventListener('change', async (ev)=>{
      const f = ev.target.files && ev.target.files[0]; if (!f) return;
      try {
        const txt = await f.text(); const parsed = JSON.parse(txt);
        const replace = confirm('Replace existing tags? OK = replace, Cancel = append');
        const res = await fetch('/api/tags/import', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ tags: parsed.tags || parsed, assignments: parsed.assignments || parsed.assignments || [], replace }) });
        if (!res.ok) { statusEl.textContent='Import failed'; return; }
        const result = await res.json(); await loadTagsFromServer(); renderTagFilterChips(); renderTagsSettings(); statusEl.textContent='Imported tags';
        if (result && result.assignments){ const a = result.assignments; alert(`Tags Import Report:\n\nTags imported: ${result.imported || 0}\n\nAssignments:\n• Total: ${a.total || 0}\n• Imported: ${a.imported || 0}\n• Skipped (duplicates): ${a.skipped || 0}\n• Failed: ${a.failed || 0}`); }
      } catch (err){ console.error(err); statusEl.textContent='Import failed'; }
    });
  }

  toolbar.appendChild(exportBtn); toolbar.appendChild(importBtn);
  titleRow.appendChild(title); titleRow.appendChild(toolbar); panel.appendChild(titleRow);
  const createRow = document.createElement('div'); createRow.style.marginTop='8px'; createRow.style.marginBottom='12px'; const createBtn = document.createElement('button'); createBtn.textContent='Create Tag'; createBtn.className='qr-btn'; createBtn.addEventListener('click', ()=>{ openTagEditor('', '#ffcc00', async (v)=>{ if (!v) return; await createTagOnServer(v.name, v.color); await loadTagsFromServer(); renderTagFilterChips(); renderTagsSettings(); }); }); createRow.appendChild(createBtn); panel.appendChild(createRow);
  if (!tags || tags.length === 0){ const empty = document.createElement('div'); empty.style.marginTop='8px'; empty.style.color='#999'; empty.textContent='No tags defined.'; panel.appendChild(empty); return; }
  tags.forEach((t, idx)=>{ const row = document.createElement('div'); row.style.display='flex'; row.style.alignItems='center'; row.style.gap='8px'; row.style.padding='12px'; row.style.background= idx % 2 === 0 ? '#fff' : '#f9f9f9'; row.style.borderBottom='1px solid #e0e0e0'; const label = document.createElement('div'); label.style.flex='1'; label.textContent = t.name; 
  if (t.is_system) { const badge = document.createElement('span'); badge.textContent = 'System'; badge.style.fontSize='10px'; badge.style.background='#e0e0e0'; badge.style.color='#666'; badge.style.padding='2px 6px'; badge.style.borderRadius='4px'; badge.style.marginLeft='8px'; label.appendChild(badge); }
  const color = document.createElement('div'); color.style.width='24px'; color.style.height='16px'; color.style.background = t.color; color.style.border='1px solid #ccc'; 
  const edit = document.createElement('button'); edit.className='qr-btn'; edit.textContent='Edit'; 
  if (t.is_system) { edit.disabled = true; edit.style.opacity = '0.5'; edit.style.cursor = 'not-allowed'; edit.title = 'Cannot edit system tag'; } else { edit.addEventListener('click', ()=>{ openTagEditor(t.name, t.color, async (v)=>{ if (!v) return; await updateTagOnServer(t.id, v.name, v.color); await loadTagsFromServer(); renderTagFilterChips(); renderTagsSettings(); }); }); }
  const del = document.createElement('button'); del.className='qr-btn'; del.textContent='Delete'; 
  if (t.is_system) { del.disabled = true; del.style.opacity = '0.5'; del.style.cursor = 'not-allowed'; del.title = 'Cannot delete system tag'; } else { del.addEventListener('click', async ()=>{ try { const countRes = await fetch(`/api/tags/${t.id}/count`); if (!countRes.ok) throw new Error('Failed to get count'); const countData = await countRes.json(); const chatCount = countData.count || 0; const msg = chatCount > 0 ? `Delete tag "${t.name}"?\n\nThis tag is assigned to ${chatCount} chat${chatCount !== 1 ? 's' : ''}. Deleting it will remove the tag from these chats.` : `Delete tag "${t.name}"?`; if (!confirm(msg)) return; await deleteTagOnServer(t.id); await loadTagsFromServer(); renderTagFilterChips(); renderTagsSettings(); } catch (err) { console.error(err); alert('Failed to delete tag'); } }); }
  row.appendChild(label); row.appendChild(color); row.appendChild(edit); row.appendChild(del); panel.appendChild(row); });
}

function getSelectedChatIds(){
  return Array.from(selectedChats);
}

function sendPreset(){
  const ids = getSelectedChatIds();
  const text = presetInput.value && presetInput.value.trim();
  if (!ids.length) { statusEl.textContent = 'No chat selected'; return; }
  if (!text) { statusEl.textContent = 'No preset text'; return; }
  for (const id of ids) socket.emit('sendPreset', { chatId: id, text });
}

sendBtn.addEventListener('click', sendPreset);
refreshBtn.addEventListener('click', ()=> socket.emit('requestMessages'));

// allow pressing Enter in the preset input to send the preset
if (presetInput) {
  presetInput.addEventListener('keydown', (e)=>{
    if (e.key === 'Enter'){
      e.preventDefault();
      sendPreset();
    }
  });
}

// no periodic suppressed cleanup needed in this version

// --- full chat modal handling ---
function openFullChat(chatId, title){
  // create modal
  const modal = document.createElement('div'); modal.className='modal';
  const panel = document.createElement('div'); panel.className='panel';
  const header = document.createElement('div'); header.className='header';
  const hTitle = document.createElement('div'); hTitle.textContent = title;
  const closeBtn = document.createElement('button'); closeBtn.textContent='Close';
  header.appendChild(hTitle); header.appendChild(closeBtn);

  const body = document.createElement('div'); body.className='body';
  const composer = document.createElement('div'); composer.className='composer';
  const input = document.createElement('input'); input.placeholder='Message...';
  const send = document.createElement('button'); send.textContent='Send';
  composer.appendChild(input); composer.appendChild(send);

  panel.appendChild(header); panel.appendChild(body); panel.appendChild(composer);
  modal.appendChild(panel);
  document.body.appendChild(modal);

  closeBtn.addEventListener('click', ()=>{ document.body.removeChild(modal); });

  // request full chat from server
  socket.emit('getFullChat', chatId);
  // show loading
  body.innerHTML = '<em>Loading...</em>';

  // handle send from composer
  send.addEventListener('click', ()=>{
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
  };
  socket.on('full_chat', handler);

  // cleanup listener when modal closed
  modal.addEventListener('remove', ()=> socket.off('full_chat', handler));
}

function renderFullChatBody(container, messages){
  container.innerHTML = '';
  for (const m of messages){
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
          const fn = document.createElement('div'); fn.style.fontSize='12px'; fn.style.color='#666'; fn.textContent = m.media.filename; bubble.appendChild(fn);
        }
      } else if (mt === 'application/pdf') {
        // embed small PDF preview
        const iframe = document.createElement('iframe');
        iframe.src = m.media.data;
        iframe.style.width = '100%';
        iframe.style.height = '300px';
        iframe.style.border = 'none';
        bubble.appendChild(iframe);
        if (m.media.filename) {
          const a = document.createElement('a'); a.href = m.media.data; a.download = m.media.filename; a.textContent = 'Download PDF'; a.style.display='block'; a.style.marginTop='6px'; bubble.appendChild(a);
        }
      } else {
        const a = document.createElement('a'); a.href = m.media.data; a.download = m.media.filename || 'file'; a.textContent = m.media.filename || 'Download file';
        bubble.appendChild(a);
      }
      // if there's a caption/body show it below
      if (m.body) {
        const cap = document.createElement('div'); cap.style.marginTop='6px'; cap.textContent = m.body; bubble.appendChild(cap);
      }
    } else {
      const textNode = document.createElement('div'); textNode.textContent = m.body;
      bubble.appendChild(textNode);
    }

    const ts = document.createElement('div'); ts.className='timestamp'; ts.textContent = new Date(m.timestamp*1000).toLocaleString();
    bubble.appendChild(ts);
    row.appendChild(bubble);
    container.appendChild(row);
  }
}
