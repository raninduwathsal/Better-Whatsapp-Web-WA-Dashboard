const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');
const { Client, LocalAuth } = require('whatsapp-web.js');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: { headless: true }
});

let waReady = false;

client.on('qr', async (qr) => {
  try {
    const dataUrl = await qrcode.toDataURL(qr);
    io.emit('qr', dataUrl);
  } catch (e) {
    console.error('QR generation error', e);
  }
});

client.on('ready', async () => {
  console.log('WhatsApp client ready');
  waReady = true;
  io.emit('ready');
  // Emit initial chats with history
  try {
    const list = await fetchChats();
    io.emit('chats', list);
  } catch (err) {
    console.error('Error loading chats', err);
  }
});

client.on('message', async msg => {
  if (!msg.body) return;
  try {
    // whenever a new message arrives, emit updated chats list
    const list = await fetchChats();
    io.emit('chats', list);
  } catch (err) {
    console.error('Error fetching unread on new message', err);
  }
});


io.on('connection', socket => {
  console.log('UI connected');

  socket.on('requestMessages', async () => {
    // Only allow fetching messages when WhatsApp client is ready
    if (!waReady) {
      socket.emit('not_ready');
      socket.emit('messages', []);
      return;
    }

    try {
      const chats = await client.getChats();
      const messages = [];
      for (const chat of chats) {
        try {
          const msgs = await chat.fetchMessages({ limit: 5 });
          for (const m of msgs) {
            if (!m.body) continue;
            messages.push({
              id: m.id._serialized,
              chatId: m.from || chat.id._serialized,
              from: m.author || m.from || chat.name || chat.id.user,
              body: m.body,
              timestamp: m.timestamp
            });
          }
        } catch (err) {}
      }
      messages.sort((a,b)=>b.timestamp - a.timestamp);
      socket.emit('messages', messages.slice(0,200));
    } catch (err) {
      console.error('requestMessages failed', err);
      socket.emit('messages', []);
    }
  });

  socket.on('sendPreset', async ({ chatId, text }) => {
    if (!chatId || !text) return;
    try {
      await client.sendMessage(chatId, text);
      // mark chat as seen/read if possible (remove unread highlight)
      try { await client.sendSeen(chatId); } catch (e) {}

      // emit updated chats so UI can update (we don't hide chats after reply)
      try {
        const list = await fetchChats();
        io.emit('chats', list);
      } catch (e) {}
      socket.emit('sent', { chatId, text });
    } catch (err) {
      socket.emit('error', { message: err.message });
    }
  });

  socket.on('getFullChat', async (chatId) => {
    if (!waReady) { socket.emit('full_chat', { chatId, messages: [] }); return; }
    try {
      // try to get the chat and fetch a larger history
      let chatObj = null;
      try { chatObj = await client.getChatById(chatId); } catch(e) { /* fallback */ }
      if (!chatObj) {
        const all = await client.getChats();
        chatObj = all.find(c=>c.id && c.id._serialized === chatId);
      }
      if (!chatObj) { socket.emit('full_chat', { chatId, messages: [] }); return; }
      const msgs = await chatObj.fetchMessages({ limit: 200 });
      const messages = [];
      for (const m of msgs) {
        const item = { id: m.id._serialized, from: m.author || m.from, body: m.body, timestamp: m.timestamp, fromMe: !!m.fromMe };
        if (m.hasMedia) {
          try {
            const media = await m.downloadMedia();
            if (media && media.data) {
              item.media = { data: `data:${media.mimetype};base64,${media.data}`, mimetype: media.mimetype, filename: m.filename || null };
            }
          } catch (err) {
            console.error('downloadMedia failed for message', m.id && m.id._serialized, err && err.message);
          }
        }
        messages.push(item);
      }
      // sort oldest -> newest
      messages.sort((a,b)=>a.timestamp - b.timestamp);
      socket.emit('full_chat', { chatId, messages });
    } catch (err) {
      console.error('getFullChat failed', err);
      socket.emit('full_chat', { chatId, messages: [] });
    }
  });

  socket.on('archiveChat', async ({ chatId }) => {
    if (!waReady) { 
      socket.emit('archive_error', { chatId, error: 'WhatsApp not ready' }); 
      return; 
    }
    if (!chatId) {
      socket.emit('archive_error', { chatId, error: 'chatId required' });
      return;
    }
    try {
      // Get the chat object
      let chatObj = null;
      try { chatObj = await client.getChatById(chatId); } catch(e) { /* fallback */ }
      if (!chatObj) {
        const all = await client.getChats();
        chatObj = all.find(c=>c.id && c.id._serialized === chatId);
      }
      if (!chatObj) { 
        socket.emit('archive_error', { chatId, error: 'Chat not found' }); 
        return; 
      }
      
      // Archive the chat in WhatsApp
      await chatObj.archive();
      
      // Assign the Archived tag
      const archivedTagId = getArchivedTagId();
      if (archivedTagId) {
        assignArchivedTagIfNeeded(archivedTagId, chatId);
      }
      
      socket.emit('archive_success', { chatId });
      
      // Emit updated chats
      try {
        const list = await fetchChats();
        io.emit('chats', list);
      } catch (e) {
        console.error('Failed to fetch chats after archiving', e);
      }
    } catch (err) {
      console.error('archiveChat failed', err);
      socket.emit('archive_error', { chatId, error: err.message || 'Failed to archive' });
    }
  });

  socket.on('unarchiveChat', async ({ chatId }) => {
    if (!waReady) { 
      socket.emit('unarchive_error', { chatId, error: 'WhatsApp not ready' }); 
      return; 
    }
    if (!chatId) {
      socket.emit('unarchive_error', { chatId, error: 'chatId required' });
      return;
    }
    try {
      // Get the chat object
      let chatObj = null;
      try { chatObj = await client.getChatById(chatId); } catch(e) { /* fallback */ }
      if (!chatObj) {
        const all = await client.getChats();
        chatObj = all.find(c=>c.id && c.id._serialized === chatId);
      }
      if (!chatObj) { 
        socket.emit('unarchive_error', { chatId, error: 'Chat not found' }); 
        return; 
      }
      
      // Unarchive the chat in WhatsApp
      await chatObj.unarchive();
      
      // Remove the Archived tag
      const archivedTagId = getArchivedTagId();
      if (archivedTagId) {
        try {
          sqliteDb.run('DELETE FROM tag_assignments WHERE tag_id = ? AND chat_id = ?', [archivedTagId, chatId]);
          persistDb();
          io.emit('tags_updated');
        } catch (err) {
          console.error('Failed to remove Archived tag', err);
        }
      }
      
      socket.emit('unarchive_success', { chatId });
      
      // Emit updated chats
      try {
        const list = await fetchChats();
        io.emit('chats', list);
      } catch (e) {
        console.error('Failed to fetch chats after unarchiving', e);
      }
    } catch (err) {
      console.error('unarchiveChat failed', err);
      socket.emit('unarchive_error', { chatId, error: err.message || 'Failed to unarchive' });
    }
  });
});
async function fetchChats(){
  if (!waReady) return [];
  const chats = await client.getChats();
  const results = [];
  const cutoff = Date.now()/1000 - (24*60*60); // last 24 hours
  
  // Get Archived tag ID for auto-assignment
  const archivedTagId = getArchivedTagId();
  
  for (const chat of chats){
    try {
      const unread = chat.unreadCount || 0;

      // get last 3 messages and sort oldest -> newest for display
      const msgs = await chat.fetchMessages({ limit: 3 });
      const history = [];
      for (const m of msgs) {
        const item = { id: m.id._serialized, from: m.author || m.from, body: m.body, timestamp: m.timestamp, fromMe: !!m.fromMe, hasMedia: !!m.hasMedia, mimetype: m.mimetype || null, filename: m.filename || null, isSticker: !!m.isSticker };
        // For small stickers include the media in the summary so UI can render it in the compact card
        if (item.hasMedia && item.isSticker) {
          try {
            const media = await m.downloadMedia();
            if (media && media.data) {
              item.media = { data: `data:${media.mimetype};base64,${media.data}`, mimetype: media.mimetype, filename: m.filename || null };
            }
          } catch (err) {
            console.error('downloadMedia (sticker) failed for message', m.id && m.id._serialized, err && err.message);
          }
        }
        history.push(item);
      }
      history.sort((a,b)=> a.timestamp - b.timestamp);

      const lastTs = history.length ? history[history.length-1].timestamp : 0;
      // only include if unread or recent activity (last 24h)
      if (unread <= 0 && lastTs < cutoff) continue;

      // keep only chat name (if any) — do not derive or expose phone numbers/ids
      const displayName = chat.name || null;
      results.push({ chatId: chat.id._serialized, name: displayName, unreadCount: unread, history, lastTimestamp: lastTs });
      
      // Auto-assign Archived tag if chat is archived
      if (archivedTagId && chat.archived) {
        assignArchivedTagIfNeeded(archivedTagId, chat.id._serialized);
      }
    } catch (err) {
      // continue on errors
    }
  }
  // sort: pinned handling is client-side; here sort by unread first then recent
  results.sort((a,b)=>{
    if ((b.unreadCount>0) - (a.unreadCount>0) !== 0) return (b.unreadCount>0) - (a.unreadCount>0);
    return b.lastTimestamp - a.lastTimestamp;
  });
  return results;
}

// Assign the Archived tag to a chat if not already assigned
function assignArchivedTagIfNeeded(archivedTagId, chatId){
  try {
    // Check if already assigned
    const existing = rowsFromExec(sqliteDb.exec(`SELECT id FROM tag_assignments WHERE tag_id = ${archivedTagId} AND chat_id = "${String(chatId).replace(/"/g, '\\"')}"`));
    if (existing && existing.length > 0) {
      return; // Already assigned
    }
    
    // Assign the tag
    const phoneNumber = extractPhoneFromChatId(chatId);
    sqliteDb.run('INSERT INTO tag_assignments (tag_id, chat_id, phone_number) VALUES (?, ?, ?)', [archivedTagId, chatId, phoneNumber]);
    persistDb();
    io.emit('tags_updated');
  } catch (err) {
    console.error('Failed to assign Archived tag', err);
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Server listening on port', PORT));

// --- SQLite quick replies persistence using sql.js (WASM) ---
const initSqlJs = require('sql.js');
let SQL; // sql.js namespace
let sqliteDb = null;
const SQLITE_FILE = path.join(__dirname, 'data.sqlite');
let dbReady = false;

function persistDb(){
  try {
    const data = sqliteDb.export(); // Uint8Array
    fs.writeFileSync(SQLITE_FILE, Buffer.from(data));
  } catch (err) {
    console.error('Failed to persist sqlite DB', err);
  }
}

function rowsFromExec(execResult){
  if (!execResult || execResult.length === 0) return [];
  const r = execResult[0];
  const cols = r.columns;
  return r.values.map(vals=>{
    const obj = {};
    for (let i=0;i<cols.length;i++) obj[cols[i]] = vals[i];
    return obj;
  });
}

// Helper: extract normalized phone number from WhatsApp chat_id (e.g., "1234567890@c.us" -> "1234567890")
// Returns null for group chats (format: xxxxx@g.us or xxxxx-xxxxx@g.us)
function extractPhoneFromChatId(chatId){
  if (!chatId) return null;
  const str = String(chatId);
  // detect group chat: contains '@g.us' or '@broadcast' or contains '-' before '@'
  if (str.includes('@g.us') || str.includes('@broadcast') || str.includes('@newsletter')) return null;
  // split on '@' and take first part (phone number portion)
  const parts = str.split('@');
  if (parts.length === 0) return null;
  const phone = parts[0];
  // if phone part contains '-', it's likely a group ID, skip
  if (phone.includes('-')) return null;
  // normalize: keep only digits and leading '+'
  return normalizePhone(phone);
}

// Helper: normalize phone number to unified format (digits + leading '+' if present)
function normalizePhone(phone){
  if (!phone) return null;
  const str = String(phone).trim();
  // keep leading '+' if present, then only digits
  const hasPlus = str.startsWith('+');
  const digits = str.replace(/[^0-9]/g, '');
  if (!digits) return null;
  return hasPlus ? '+' + digits : digits;
}

async function initSqlite(){
  try {
    SQL = await initSqlJs();
  } catch (err) {
    console.error('initSqlJs failed', err);
    throw err;
  }
  if (fs.existsSync(SQLITE_FILE)){
    const buf = fs.readFileSync(SQLITE_FILE);
    sqliteDb = new SQL.Database(new Uint8Array(buf));
  } else {
    sqliteDb = new SQL.Database();
  }
  // ensure table exists
  sqliteDb.run("CREATE TABLE IF NOT EXISTS quick_replies (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);");
  // tags tables: tags and assignments to chat ids
  sqliteDb.run("CREATE TABLE IF NOT EXISTS tags (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, color TEXT NOT NULL, is_system INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);");
  sqliteDb.run("CREATE TABLE IF NOT EXISTS tag_assignments (id INTEGER PRIMARY KEY AUTOINCREMENT, tag_id INTEGER NOT NULL, chat_id TEXT NOT NULL, phone_number TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);");
  // notes table: notes bound to chat ids
  sqliteDb.run("CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY AUTOINCREMENT, chat_id TEXT NOT NULL, phone_number TEXT, text TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME);");
  
  // Migration: add phone_number column to existing tag_assignments table if it doesn't exist
  try {
    // Check if phone_number column exists by attempting to select it
    sqliteDb.exec("SELECT phone_number FROM tag_assignments LIMIT 1");
  } catch (err) {
    // Column doesn't exist, add it
    if (err.message && err.message.includes('no such column')) {
      console.log('Migrating tag_assignments table: adding phone_number column...');
      sqliteDb.run("ALTER TABLE tag_assignments ADD COLUMN phone_number TEXT");
      // Backfill phone_number from existing chat_id values
      const existingAssigns = rowsFromExec(sqliteDb.exec("SELECT id, chat_id FROM tag_assignments"));
      for (const a of existingAssigns) {
        const phone = extractPhoneFromChatId(a.chat_id);
        if (phone) {
          sqliteDb.run(`UPDATE tag_assignments SET phone_number = "${phone}" WHERE id = ${a.id}`);
        }
      }
      console.log(`Migration complete: backfilled ${existingAssigns.length} assignments with phone numbers`);
    }
  }
  
  // Migration: add is_system column to tags table if it doesn't exist
  try {
    sqliteDb.exec("SELECT is_system FROM tags LIMIT 1");
  } catch (err) {
    if (err.message && err.message.includes('no such column')) {
      console.log('Migrating tags table: adding is_system column...');
      sqliteDb.run("ALTER TABLE tags ADD COLUMN is_system INTEGER DEFAULT 0");
    }
  }
  
  // Ensure permanent "Archived" tag exists
  ensureArchivedTag();
  
  // persist initial state
  persistDb();
  dbReady = true;
}

// Ensure the permanent "Archived" system tag exists
function ensureArchivedTag(){
  try {
    const existing = rowsFromExec(sqliteDb.exec("SELECT id FROM tags WHERE name = 'Archived' AND is_system = 1 LIMIT 1"));
    if (!existing || existing.length === 0) {
      console.log('Creating permanent "Archived" system tag...');
      sqliteDb.run("INSERT INTO tags (name, color, is_system) VALUES ('Archived', '#808080', 1)");
      console.log('"Archived" tag created');
    }
  } catch (err) {
    console.error('Failed to ensure Archived tag', err);
  }
}

// Get the ID of the Archived system tag
function getArchivedTagId(){
  try {
    const result = rowsFromExec(sqliteDb.exec("SELECT id FROM tags WHERE name = 'Archived' AND is_system = 1 LIMIT 1"));
    return (result && result.length > 0) ? result[0].id : null;
  } catch (err) {
    console.error('Failed to get Archived tag ID', err);
    return null;
  }
}

app.get('/api/quick-replies', (req, res) => {
  if (!dbReady) return res.status(503).json({ error: 'db not ready' });
  try {
    const rows = rowsFromExec(sqliteDb.exec('SELECT id, text, created_at FROM quick_replies ORDER BY id'));
    res.json(rows);
  } catch (err) {
    console.error('GET /api/quick-replies error', err);
    res.status(500).json({ error: 'internal' });
  }
});

// --- Notes API ---
// GET /api/notes?chatId=...  -> list notes for a chat
app.get('/api/notes', (req, res) => {
  if (!dbReady) return res.status(503).json({ error: 'db not ready' });
  const chatId = req.query.chatId;
  if (!chatId) return res.status(400).json({ error: 'chatId required' });
  try {
    const rows = rowsFromExec(sqliteDb.exec(`SELECT id, chat_id as chatId, phone_number as phoneNumber, text, created_at as createdAt, updated_at as updatedAt FROM notes WHERE chat_id = "${String(chatId).replace(/"/g,'\\"')}" ORDER BY id DESC`));
    res.json(rows);
  } catch (err) {
    console.error('GET /api/notes error', err);
    res.status(500).json({ error: 'internal' });
  }
});

// create note
app.post('/api/notes', (req, res) => {
  if (!dbReady) return res.status(503).json({ error: 'db not ready' });
  const { chatId, text } = req.body || {};
  if (!chatId || !text || String(text).trim() === '') return res.status(400).json({ error: 'chatId and text required' });
  try {
    const phoneNumber = extractPhoneFromChatId(chatId);
    const stmt = sqliteDb.prepare && sqliteDb.prepare('INSERT INTO notes (chat_id, phone_number, text) VALUES (?, ?, ?)');
    if (stmt && stmt.run) stmt.run([chatId, phoneNumber, text]); else sqliteDb.run('INSERT INTO notes (chat_id, phone_number, text) VALUES ("' + String(chatId).replace(/"/g,'\\"') + '", "' + (phoneNumber || '') + '", "' + String(text).replace(/"/g,'\\"') + '")');
    stmt && stmt.free && stmt.free();
    const last = rowsFromExec(sqliteDb.exec('SELECT last_insert_rowid() AS id'))[0];
    const row = rowsFromExec(sqliteDb.exec(`SELECT id, chat_id as chatId, phone_number as phoneNumber, text, created_at as createdAt, updated_at as updatedAt FROM notes WHERE id = ${last.id}`))[0];
    persistDb();
    io.emit('notes_updated', { chatId });
    res.status(201).json(row || {});
  } catch (err) {
    console.error('POST /api/notes error', err);
    res.status(500).json({ error: 'internal' });
  }
});

// update note
app.put('/api/notes/:id', (req, res) => {
  if (!dbReady) return res.status(503).json({ error: 'db not ready' });
  const id = Number(req.params.id);
  const { text } = req.body || {};
  if (!id || !text || String(text).trim() === '') return res.status(400).json({ error: 'id and text required' });
  try {
    sqliteDb.run('UPDATE notes SET text = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [text, id]);
    const row = rowsFromExec(sqliteDb.exec(`SELECT id, chat_id as chatId, phone_number as phoneNumber, text, created_at as createdAt, updated_at as updatedAt FROM notes WHERE id = ${id}`))[0];
    if (!row) return res.status(404).json({ error: 'not found' });
    persistDb();
    io.emit('notes_updated', { chatId: row.chatId });
    res.json(row);
  } catch (err) {
    console.error('PUT /api/notes error', err);
    res.status(500).json({ error: 'internal' });
  }
});

// delete note
app.delete('/api/notes/:id', (req, res) => {
  if (!dbReady) return res.status(503).json({ error: 'db not ready' });
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'id required' });
  try {
    const row = rowsFromExec(sqliteDb.exec(`SELECT id, chat_id as chatId FROM notes WHERE id = ${id}`))[0];
    if (!row) return res.status(404).json({ error: 'not found' });
    sqliteDb.run('DELETE FROM notes WHERE id = ?', [id]);
    persistDb();
    io.emit('notes_updated', { chatId: row.chatId });
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/notes error', err);
    res.status(500).json({ error: 'internal' });
  }
});

// quick endpoint: counts of notes per chat
app.get('/api/notes/counts', (req, res) => {
  if (!dbReady) return res.status(503).json({ error: 'db not ready' });
  try {
    const rows = rowsFromExec(sqliteDb.exec('SELECT chat_id as chatId, COUNT(*) as count FROM notes GROUP BY chat_id'));
    res.json(rows);
  } catch (err) {
    console.error('GET /api/notes/counts error', err);
    res.status(500).json({ error: 'internal' });
  }
});

// export notes (optionally for a specific chat)
app.get('/api/notes/export', (req, res) => {
  if (!dbReady) return res.status(503).json({ error: 'db not ready' });
  try {
    const chatId = req.query.chatId;
    let rows;
    if (chatId) rows = rowsFromExec(sqliteDb.exec(`SELECT id, chat_id as chatId, phone_number as phoneNumber, text, created_at as createdAt, updated_at as updatedAt FROM notes WHERE chat_id = "${String(chatId).replace(/"/g,'\\"')}" ORDER BY id`));
    else rows = rowsFromExec(sqliteDb.exec('SELECT id, chat_id as chatId, phone_number as phoneNumber, text, created_at as createdAt, updated_at as updatedAt FROM notes ORDER BY id'));
    res.json(rows);
  } catch (err) {
    console.error('GET /api/notes/export error', err);
    res.status(500).json({ error: 'internal' });
  }
});

// import notes: body { notes: [...], replace: boolean }
app.post('/api/notes/import', (req, res) => {
  if (!dbReady) return res.status(503).json({ error: 'db not ready' });
  const body = req.body || {};
  const notes = Array.isArray(body.notes) ? body.notes : [];
  const replace = !!body.replace;
  if (!notes.length) return res.status(400).json({ error: 'notes required' });
  try {
    if (replace) {
      sqliteDb.run('DELETE FROM notes');
    }

    const insertStmt = sqliteDb.prepare && sqliteDb.prepare('INSERT INTO notes (chat_id, phone_number, text, created_at) VALUES (?, ?, ?, ?)');
    let imported = 0;
    let failed = 0;
    let skipped = 0;
    for (const it of notes) {
      // incoming keys: chatId/chat_id, phoneNumber/phone_number, text, createdAt
      const incomingChat = it.chatId || it.chat_id || it.chat || null;
      const incomingPhoneRaw = it.phoneNumber || it.phone_number || it.phone || null;
      const text = it.text || '';
      const createdAt = it.createdAt || it.created_at || null;
      if (!text) { failed++; continue; }

      // resolve phone number normalization
      let phoneNumber = null;
      if (incomingPhoneRaw) phoneNumber = normalizePhone(incomingPhoneRaw);

      // resolve chatId: prefer incomingChat; otherwise try to find by phone number in tag_assignments or existing notes; fallback to constructed chat id
      let chatId = null;
      if (incomingChat) {
        chatId = String(incomingChat);
      } else if (phoneNumber) {
        // try tag_assignments
        const t1 = rowsFromExec(sqliteDb.exec(`SELECT chat_id FROM tag_assignments WHERE phone_number = "${phoneNumber}" LIMIT 1`));
        if (t1 && t1.length > 0 && t1[0].chat_id) chatId = t1[0].chat_id;
        // try existing notes with same phone
        if (!chatId) {
          const t2 = rowsFromExec(sqliteDb.exec(`SELECT chat_id FROM notes WHERE phone_number = "${phoneNumber}" LIMIT 1`));
          if (t2 && t2.length > 0 && t2[0].chat_id) chatId = t2[0].chat_id;
        }
        // fallback: construct chat id
        if (!chatId) chatId = (phoneNumber.indexOf('@') === -1) ? (phoneNumber + '@c.us') : phoneNumber;
      } else {
        // no chatId or phone -> skip
        failed++;
        continue;
      }

      try {
        // deduplication: skip if a note with same chat_id and identical text already exists
        const escChat = String(chatId).replace(/"/g,'\\"');
        const escText = String(text).replace(/"/g,'\\"');
        const exists = rowsFromExec(sqliteDb.exec(`SELECT id FROM notes WHERE chat_id = "${escChat}" AND text = "${escText}" LIMIT 1`));
        if (exists && exists.length > 0) {
          skipped++;
          continue;
        }

        if (insertStmt && insertStmt.run) insertStmt.run([chatId, phoneNumber, text, createdAt]); else {
          const escPhone = String(phoneNumber || '').replace(/"/g,'\\"');
          sqliteDb.run(`INSERT INTO notes (chat_id, phone_number, text, created_at) VALUES ("${escChat}", "${escPhone}", "${escText}", ${createdAt ? '"'+String(createdAt).replace(/"/g,'\\"')+'"' : 'CURRENT_TIMESTAMP'})`);
        }
        imported++;
      } catch (err) {
        failed++;
      }
    }
    if (insertStmt && insertStmt.free) insertStmt.free();
    persistDb();
    io.emit('notes_updated', {});
    res.json({ ok: true, imported, skipped, failed, total: notes.length });
  } catch (err) {
    console.error('POST /api/notes/import error', err);
    res.status(500).json({ error: 'internal' });
  }
});



// Export quick replies (same as GET but separate route)
app.get('/api/quick-replies/export', (req, res) => {
  if (!dbReady) return res.status(503).json({ error: 'db not ready' });
  try {
    const rows = rowsFromExec(sqliteDb.exec('SELECT id, text, created_at FROM quick_replies ORDER BY id'));
    res.json(rows);
  } catch (err) {
    console.error('GET /api/quick-replies/export error', err);
    res.status(500).json({ error: 'internal' });
  }
});

// --- Tags API ---
app.get('/api/tags', (req, res) => {
  if (!dbReady) return res.status(503).json({ error: 'db not ready' });
  try {
    const rows = rowsFromExec(sqliteDb.exec('SELECT id, name, color, is_system, created_at FROM tags ORDER BY id'));
    res.json(rows);
  } catch (err) {
    console.error('GET /api/tags error', err);
    res.status(500).json({ error: 'internal' });
  }
});

app.post('/api/tags', (req, res) => {
  if (!dbReady) return res.status(503).json({ error: 'db not ready' });
  const { name, color } = req.body || {};
  if (!name || !color) return res.status(400).json({ error: 'name and color required' });
  try {
    const stmt = sqliteDb.prepare && sqliteDb.prepare('INSERT INTO tags (name, color) VALUES (?, ?)');
    if (stmt && stmt.run) stmt.run([name, color]); else sqliteDb.run(`INSERT INTO tags (name, color) VALUES ("${name.replace(/"/g,'\\"')}","${color}")`);
    stmt && stmt.free && stmt.free();
    persistDb();
    io.emit('tags_updated');
    const rows = rowsFromExec(sqliteDb.exec('SELECT id, name, color, created_at FROM tags ORDER BY id'));
    res.status(201).json(rows[rows.length-1]);
  } catch (err) {
    console.error('POST /api/tags error', err);
    res.status(500).json({ error: 'internal' });
  }
});

app.put('/api/tags/:id', (req, res) => {
  if (!dbReady) return res.status(503).json({ error: 'db not ready' });
  const id = Number(req.params.id);
  const { name, color } = req.body || {};
  if (!id || !name || !color) return res.status(400).json({ error: 'id,name,color required' });
  try {
    // Check if this is a system tag
    const tag = rowsFromExec(sqliteDb.exec(`SELECT id, is_system FROM tags WHERE id = ${id}`))[0];
    if (!tag) return res.status(404).json({ error: 'not found' });
    if (tag.is_system) return res.status(403).json({ error: 'Cannot edit system tag' });
    
    sqliteDb.run('UPDATE tags SET name = ?, color = ? WHERE id = ?', [name, color, id]);
    persistDb();
    io.emit('tags_updated');
    const row = rowsFromExec(sqliteDb.exec(`SELECT id, name, color, created_at FROM tags WHERE id = ${id}`))[0];
    res.json(row);
  } catch (err) {
    console.error('PUT /api/tags error', err);
    res.status(500).json({ error: 'internal' });
  }
});

app.delete('/api/tags/:id', (req, res) => {
  if (!dbReady) return res.status(503).json({ error: 'db not ready' });
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'id required' });
  try {
    // Check if this is a system tag
    const tag = rowsFromExec(sqliteDb.exec(`SELECT id, is_system FROM tags WHERE id = ${id}`))[0];
    if (!tag) return res.status(404).json({ error: 'not found' });
    if (tag.is_system) return res.status(403).json({ error: 'Cannot delete system tag' });
    
    sqliteDb.run('DELETE FROM tag_assignments WHERE tag_id = ?', [id]);
    sqliteDb.run('DELETE FROM tags WHERE id = ?', [id]);
    persistDb();
    io.emit('tags_updated');
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/tags error', err);
    res.status(500).json({ error: 'internal' });
  }
});

// get assignment count for a tag
app.get('/api/tags/:id/count', (req, res) => {
  if (!dbReady) return res.status(503).json({ error: 'db not ready' });
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'id required' });
  try {
    const result = rowsFromExec(sqliteDb.exec(`SELECT COUNT(*) as count FROM tag_assignments WHERE tag_id = ${id}`));
    const count = result && result[0] ? result[0].count : 0;
    res.json({ tagId: id, count });
  } catch (err) {
    console.error('GET /api/tags/:id/count error', err);
    res.status(500).json({ error: 'internal' });
  }
});

// assign/unassign tags to chatId
app.post('/api/tags/assign', (req, res) => {
  if (!dbReady) return res.status(503).json({ error: 'db not ready' });
  const { tagId, chatId } = req.body || {};
  if (!tagId || !chatId) return res.status(400).json({ error: 'tagId and chatId required' });
  try {
    // check for existing assignment (deduplicate)
    const existing = rowsFromExec(sqliteDb.exec(`SELECT id FROM tag_assignments WHERE tag_id = ${tagId} AND chat_id = "${String(chatId).replace(/"/g, '\\"')}"`));
    if (existing && existing.length > 0) {
      // already assigned, return success without inserting
      res.json({ ok: true, existing: true });
      return;
    }
    // extract normalized phone from chatId (format: 1234567890@c.us or similar)
    const phoneNumber = extractPhoneFromChatId(chatId);
    sqliteDb.run('INSERT INTO tag_assignments (tag_id, chat_id, phone_number) VALUES (?, ?, ?)', [tagId, chatId, phoneNumber]);
    persistDb();
    io.emit('tags_updated');
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/tags/assign error', err);
    res.status(500).json({ error: 'internal' });
  }
});

app.post('/api/tags/unassign', async (req, res) => {
  if (!dbReady) return res.status(503).json({ error: 'db not ready' });
  const { tagId, chatId } = req.body || {};
  if (!tagId || !chatId) return res.status(400).json({ error: 'tagId and chatId required' });
  try {
    // Check if this is the Archived tag - if so, unarchive in WhatsApp too
    const archivedTagId = getArchivedTagId();
    if (archivedTagId && Number(tagId) === Number(archivedTagId) && waReady) {
      try {
        let chatObj = null;
        try { chatObj = await client.getChatById(chatId); } catch(e) { /* fallback */ }
        if (!chatObj) {
          const all = await client.getChats();
          chatObj = all.find(c=>c.id && c.id._serialized === chatId);
        }
        if (chatObj && chatObj.archived) {
          await chatObj.unarchive();
        }
      } catch (err) {
        console.error('Failed to unarchive chat when removing Archived tag', err);
        // Continue with tag removal even if unarchive fails
      }
    }
    
    sqliteDb.run('DELETE FROM tag_assignments WHERE tag_id = ? AND chat_id = ?', [tagId, chatId]);
    persistDb();
    io.emit('tags_updated');
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/tags/unassign error', err);
    res.status(500).json({ error: 'internal' });
  }
});

// export tags and assignments
app.get('/api/tags/export', (req, res) => {
  if (!dbReady) return res.status(503).json({ error: 'db not ready' });
  try {
    const tags = rowsFromExec(sqliteDb.exec('SELECT id, name, color, is_system FROM tags ORDER BY id'));
    const assigns = rowsFromExec(sqliteDb.exec('SELECT tag_id, chat_id, phone_number FROM tag_assignments'));
    res.json({ tags, assignments: assigns });
  } catch (err) {
    console.error('GET /api/tags/export error', err);
    res.status(500).json({ error: 'internal' });
  }
});

// import tags (replace or append)
app.post('/api/tags/import', (req, res) => {
  if (!dbReady) return res.status(503).json({ error: 'db not ready' });
  const body = req.body || {};
  const tags = Array.isArray(body.tags) ? body.tags : [];
  const assigns = Array.isArray(body.assignments) ? body.assignments : [];
  const replace = !!body.replace;
  if (!tags.length) return res.status(400).json({ error: 'tags required' });
  try {
    // We'll insert tags one-by-one and build a mapping from imported id -> new id
    const idMap = {}; // oldId -> newId
    const nameMap = {}; // name -> newId (for assignments that reference names)

    if (replace) {
      sqliteDb.run('DELETE FROM tag_assignments');
      sqliteDb.run('DELETE FROM tags');
    }

    const insert = sqliteDb.prepare && sqliteDb.prepare('INSERT INTO tags (name, color) VALUES (?, ?)');
    for (const t of tags){
      const name = (t && (t.name || t.text)) ? String(t.name || t.text) : '';
      const color = (t && t.color) ? String(t.color) : '#AAAAAA';
      if (!name) continue;
      if (insert && insert.run) insert.run([name, color]); else sqliteDb.run('INSERT INTO tags (name, color) VALUES ("'+name.replace(/"/g,'\\"')+'","'+color+'")');
      // get new id
      const last = rowsFromExec(sqliteDb.exec('SELECT last_insert_rowid() AS id'))[0];
      const newId = last && last.id ? last.id : null;
      // map old id -> newId if old id provided
      const oldId = t && (t.id || t.tag_id || t.tagId || null);
      if (oldId != null && newId != null) idMap[String(oldId)] = newId;
      // also map by name for fallback
      if (newId != null) nameMap[String(name)] = newId;
    }
    insert && insert.free && insert.free();

    // assignments: remap incoming tag ids to newly created ids where possible
    let assignmentsImported = 0;
    let assignmentsSkipped = 0;
    let assignmentsFailed = 0;
    if (assigns && assigns.length){
      for (const a of assigns){
        // incoming may include tag_id, tagId, or tag_name; likewise chat id keys vary
        const incomingTid = a.tag_id != null ? a.tag_id : (a.tagId != null ? a.tagId : null);
        const incomingTagName = a.tag_name || a.tag || null;
        const incomingChat = a.chat_id || a.chatId || a.chat || null;
        const incomingPhone = a.phone_number || a.phoneNumber || a.phone || null;

        // determine mapped tag id
        let mappedTid = null;
        if (incomingTid != null && idMap.hasOwnProperty(String(incomingTid))) mappedTid = idMap[String(incomingTid)];
        else if (incomingTagName && nameMap.hasOwnProperty(String(incomingTagName))) mappedTid = nameMap[String(incomingTagName)];
        else if (incomingTid != null) mappedTid = incomingTid; // fallback: assume ids align (best-effort)

        if (!mappedTid) { assignmentsFailed++; continue; }

        // resolve chatId: try direct chat_id first, then fallback to phone lookup
        let chatId = null;
        let phoneNumber = null;

        if (incomingChat) {
          chatId = String(incomingChat);
          // normalize: if no '@' assume phone and append @c.us
          if (chatId.indexOf('@') === -1) {
            const normalized = chatId.replace(/[^0-9+]/g,'');
            if (normalized.length > 0) chatId = normalized + '@c.us';
          }
          phoneNumber = extractPhoneFromChatId(chatId);
        } else if (incomingPhone) {
          // fallback: incoming phone number only — try to match existing assignment by phone or construct chatId
          phoneNumber = normalizePhone(incomingPhone);
          // attempt to find existing assignment with this phone to get chatId
          const existing = rowsFromExec(sqliteDb.exec(`SELECT chat_id FROM tag_assignments WHERE phone_number = "${phoneNumber}" LIMIT 1`));
          if (existing && existing.length > 0) {
            chatId = existing[0].chat_id;
          } else {
            // construct chatId from phone
            chatId = phoneNumber + '@c.us';
          }
        }

        if (!chatId) { assignmentsFailed++; continue; }

        // deduplicate: check if this tag+chat assignment already exists
        const existingAssign = rowsFromExec(sqliteDb.exec(`SELECT id FROM tag_assignments WHERE tag_id = ${mappedTid} AND chat_id = "${String(chatId).replace(/"/g, '\\"')}"`));
        if (existingAssign && existingAssign.length > 0) {
          assignmentsSkipped++;
          continue; // skip duplicate
        }

        // insert assignment with phone fallback
        sqliteDb.run('INSERT INTO tag_assignments (tag_id, chat_id, phone_number) VALUES (?, ?, ?)', [mappedTid, chatId, phoneNumber]);
        assignmentsImported++;
      }
    }

    persistDb();
    io.emit('tags_updated');
    res.json({ ok: true, imported: tags.length, assignments: { total: assigns.length, imported: assignmentsImported, skipped: assignmentsSkipped, failed: assignmentsFailed } });
  } catch (err) {
    console.error('POST /api/tags/import error', err);
    res.status(500).json({ error: 'internal' });
  }
});

app.post('/api/quick-replies', (req, res) => {
  if (!dbReady) return res.status(503).json({ error: 'db not ready' });
  const { text } = req.body || {};
  if (!text || String(text).trim() === '') return res.status(400).json({ error: 'text required' });
  try {
    const stmt = sqliteDb.prepare('INSERT INTO quick_replies (text) VALUES (?)');
    stmt.run([text]);
    stmt.free && stmt.free();
    const last = rowsFromExec(sqliteDb.exec('SELECT last_insert_rowid() AS id'))[0];
    const row = rowsFromExec(sqliteDb.exec(`SELECT id, text, created_at FROM quick_replies WHERE id = ${last.id}`))[0];
    persistDb();
    io.emit('quick_replies_updated');
    res.status(201).json(row || {});
  } catch (err) {
    console.error('POST /api/quick-replies error', err);
    res.status(500).json({ error: 'internal' });
  }
});

app.put('/api/quick-replies/:id', (req, res) => {
  if (!dbReady) return res.status(503).json({ error: 'db not ready' });
  const id = Number(req.params.id);
  const { text } = req.body || {};
  if (!id || !text || String(text).trim() === '') return res.status(400).json({ error: 'id and text required' });
  try {
    sqliteDb.run('UPDATE quick_replies SET text = ? WHERE id = ?', [text, id]);
    const row = rowsFromExec(sqliteDb.exec(`SELECT id, text, created_at FROM quick_replies WHERE id = ${id}`))[0];
    if (!row) return res.status(404).json({ error: 'not found' });
    persistDb();
    io.emit('quick_replies_updated');
    res.json(row);
  } catch (err) {
    console.error('PUT /api/quick-replies error', err);
    res.status(500).json({ error: 'internal' });
  }
});

app.delete('/api/quick-replies/:id', (req, res) => {
  if (!dbReady) return res.status(503).json({ error: 'db not ready' });
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'id required' });
  try {
    const existing = rowsFromExec(sqliteDb.exec(`SELECT id FROM quick_replies WHERE id = ${id}`))[0];
    if (!existing) return res.status(404).json({ error: 'not found' });
    sqliteDb.run('DELETE FROM quick_replies WHERE id = ?', [id]);
    persistDb();
    io.emit('quick_replies_updated');
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/quick-replies error', err);
    res.status(500).json({ error: 'internal' });
  }
});

// Import quick replies
// Body: { items: [{ text: '...' }], replace: boolean }
app.post('/api/quick-replies/import', (req, res) => {
  if (!dbReady) return res.status(503).json({ error: 'db not ready' });
  const body = req.body || {};
  const items = Array.isArray(body.items) ? body.items : [];
  const replace = !!body.replace;
  if (!items.length) return res.status(400).json({ error: 'items required' });
  try {
    if (replace) {
      sqliteDb.run('DELETE FROM quick_replies');
    }
    const insertStmt = sqliteDb.prepare && sqliteDb.prepare('INSERT INTO quick_replies (text) VALUES (?)');
    // If prepare isn't available (older sql.js), use run directly
    for (const it of items) {
      const text = (it && it.text) ? String(it.text) : '';
      if (!text) continue;
      if (insertStmt && insertStmt.run) insertStmt.run([text]); else sqliteDb.run('INSERT INTO quick_replies (text) VALUES ("' + text.replace(/"/g, '\\"') + '")');
    }
    if (insertStmt && insertStmt.free) insertStmt.free();
    persistDb();
    io.emit('quick_replies_updated');
    const rows = rowsFromExec(sqliteDb.exec('SELECT id, text, created_at FROM quick_replies ORDER BY id'));
    res.json({ ok: true, count: rows.length, rows });
  } catch (err) {
    console.error('POST /api/quick-replies/import error', err);
    res.status(500).json({ error: 'internal' });
  }
});

// initialize sql.js DB
initSqlite().catch(err=>{ console.error('Failed to initialize sql.js DB', err); });

// initialize client with simple retry to help transient network issues
async function initClient(retries = 3, delayMs = 5000) {
  try {
    await client.initialize();
  } catch (err) {
    console.error('Client initialize failed:', err.message || err);
    if (retries > 0) {
      console.log(`Retrying initialize in ${delayMs}ms... (${retries} retries left)`);
      setTimeout(() => initClient(retries - 1, delayMs), delayMs);
    } else {
      console.error('Failed to initialize WhatsApp client after retries.');
    }
  }
}

initClient();

process.on('unhandledRejection', (reason, p) => {
  console.error('Unhandled Rejection at:', p, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});
