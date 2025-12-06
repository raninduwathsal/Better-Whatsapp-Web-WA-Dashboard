/**
 * Mock Server for Frontend Development
 * 
 * This server provides mock data for developing the frontend without WhatsApp connection.
 * Run with: npm run dev-frontend
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Load mock data
const mockDataPath = path.join(__dirname, 'mock-data.json');
let mockData = JSON.parse(fs.readFileSync(mockDataPath, 'utf-8'));

// Helper to save mock data changes
function saveMockData() {
  fs.writeFileSync(mockDataPath, JSON.stringify(mockData, null, 2));
}

// Helper to get note counts
function getNoteCounts() {
  const counts = {};
  mockData.notes.forEach(note => {
    counts[note.chat_id] = (counts[note.chat_id] || 0) + 1;
  });
  return counts;
}

// API Routes - Tags
app.get('/api/tags', (req, res) => {
  res.json(mockData.tags);
});

app.get('/api/tags/export', (req, res) => {
  res.json({
    tags: mockData.tags,
    assignments: mockData.tagAssignments
  });
});

app.post('/api/tags', (req, res) => {
  const { name, color } = req.body;
  const newTag = {
    id: Math.max(...mockData.tags.map(t => t.id), 0) + 1,
    name,
    color,
    is_system: 0
  };
  mockData.tags.push(newTag);
  saveMockData();
  res.json(newTag);
});

app.put('/api/tags/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const { name, color } = req.body;
  const tag = mockData.tags.find(t => t.id === id);
  if (!tag) return res.status(404).json({ error: 'Tag not found' });
  if (tag.is_system) return res.status(403).json({ error: 'Cannot edit system tag' });
  
  tag.name = name;
  tag.color = color;
  saveMockData();
  res.json(tag);
});

app.delete('/api/tags/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const tag = mockData.tags.find(t => t.id === id);
  if (!tag) return res.status(404).json({ error: 'Tag not found' });
  if (tag.is_system) return res.status(403).json({ error: 'Cannot delete system tag' });
  
  mockData.tags = mockData.tags.filter(t => t.id !== id);
  mockData.tagAssignments = mockData.tagAssignments.filter(a => a.tag_id !== id);
  saveMockData();
  res.json({ success: true });
});

app.post('/api/tags/assign', (req, res) => {
  const { tagId, chatId } = req.body;
  const existing = mockData.tagAssignments.find(a => a.tag_id === tagId && a.chat_id === chatId);
  if (existing) return res.json(existing);
  
  const newAssignment = {
    id: Math.max(...mockData.tagAssignments.map(a => a.id), 0) + 1,
    tag_id: tagId,
    chat_id: chatId,
    phone_number: chatId.split('@')[0]
  };
  mockData.tagAssignments.push(newAssignment);
  saveMockData();
  io.emit('tags_updated');
  res.json(newAssignment);
});

app.post('/api/tags/unassign', (req, res) => {
  const { tagId, chatId } = req.body;
  mockData.tagAssignments = mockData.tagAssignments.filter(
    a => !(a.tag_id === tagId && a.chat_id === chatId)
  );
  saveMockData();
  io.emit('tags_updated');
  res.json({ success: true });
});

app.post('/api/tags/import', (req, res) => {
  const { tags, assignments } = req.body;
  mockData.tags = tags;
  mockData.tagAssignments = assignments;
  saveMockData();
  res.json({ success: true });
});

// API Routes - Notes
app.get('/api/notes', (req, res) => {
  const { chat_id } = req.query;
  if (chat_id) {
    res.json(mockData.notes.filter(n => n.chat_id === chat_id));
  } else {
    res.json(mockData.notes);
  }
});

app.get('/api/notes/counts', (req, res) => {
  res.json(getNoteCounts());
});

app.get('/api/notes/export', (req, res) => {
  res.json(mockData.notes);
});

app.post('/api/notes', (req, res) => {
  const { chatId, text } = req.body;
  const newNote = {
    id: Math.max(...mockData.notes.map(n => n.id), 0) + 1,
    chat_id: chatId,
    phone_number: chatId.split('@')[0],
    text,
    created_at: new Date().toISOString(),
    updated_at: null
  };
  mockData.notes.push(newNote);
  saveMockData();
  res.json(newNote);
});

app.put('/api/notes/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const { text } = req.body;
  const note = mockData.notes.find(n => n.id === id);
  if (!note) return res.status(404).json({ error: 'Note not found' });
  
  note.text = text;
  note.updated_at = new Date().toISOString();
  saveMockData();
  res.json(note);
});

app.delete('/api/notes/:id', (req, res) => {
  const id = parseInt(req.params.id);
  mockData.notes = mockData.notes.filter(n => n.id !== id);
  saveMockData();
  res.json({ success: true });
});

app.post('/api/notes/import', (req, res) => {
  mockData.notes = req.body;
  saveMockData();
  res.json({ success: true });
});

// API Routes - Quick Replies
app.get('/api/quick-replies', (req, res) => {
  res.json(mockData.quickReplies);
});

app.get('/api/quick-replies/export', (req, res) => {
  res.json(mockData.quickReplies);
});

app.post('/api/quick-replies', (req, res) => {
  const { text } = req.body;
  const newReply = {
    id: Math.max(...mockData.quickReplies.map(q => q.id), 0) + 1,
    text,
    created_at: new Date().toISOString()
  };
  mockData.quickReplies.push(newReply);
  saveMockData();
  res.json(newReply);
});

app.put('/api/quick-replies/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const { text } = req.body;
  const reply = mockData.quickReplies.find(q => q.id === id);
  if (!reply) return res.status(404).json({ error: 'Quick reply not found' });
  
  reply.text = text;
  saveMockData();
  res.json(reply);
});

app.delete('/api/quick-replies/:id', (req, res) => {
  const id = parseInt(req.params.id);
  mockData.quickReplies = mockData.quickReplies.filter(q => q.id !== id);
  saveMockData();
  res.json({ success: true });
});

app.post('/api/quick-replies/import', (req, res) => {
  mockData.quickReplies = req.body;
  saveMockData();
  res.json({ success: true });
});

// Socket.io handlers
io.on('connection', (socket) => {
  console.log('Frontend connected');
  
  // Immediately emit ready status (no QR needed in mock mode)
  socket.emit('ready');
  
  // Send initial chats
  socket.emit('chats', mockData.chats);
  
  socket.on('requestMessages', () => {
    socket.emit('chats', mockData.chats);
  });
  
  socket.on('sendPreset', ({ chatId, text }) => {
    console.log(`Mock: Sending "${text}" to ${chatId}`);
    const chat = mockData.chats.find(c => c.chatId === chatId);
    if (chat) {
      const newMsg = {
        id: `msg_${Date.now()}`,
        from: 'me@c.us',
        body: text,
        timestamp: Math.floor(Date.now() / 1000),
        fromMe: true,
        hasMedia: false
      };
      chat.history.push(newMsg);
      if (chat.history.length > 3) {
        chat.history.shift();
      }
      chat.lastTimestamp = newMsg.timestamp;
    }
    // Emit updated chats
    socket.emit('chats', mockData.chats);
  });
  
  socket.on('getFullChat', async (chatId) => {
    const chat = mockData.chats.find(c => c.chatId === chatId);
    if (!chat) {
      socket.emit('full_chat', { chatId, error: 'Chat not found' });
      return;
    }
    
    // Return full history (in mock mode, we only have the 3 messages)
    socket.emit('full_chat', { chatId, messages: chat.history });
  });
  
  socket.on('archiveChat', (chatId) => {
    console.log(`Mock: Archiving chat ${chatId}`);
    const archivedTag = mockData.tags.find(t => t.name === 'Archived' && t.is_system);
    if (archivedTag) {
      const existing = mockData.tagAssignments.find(a => a.tag_id === archivedTag.id && a.chat_id === chatId);
      if (!existing) {
        mockData.tagAssignments.push({
          id: Math.max(...mockData.tagAssignments.map(a => a.id), 0) + 1,
          tag_id: archivedTag.id,
          chat_id: chatId,
          phone_number: chatId.split('@')[0]
        });
        saveMockData();
      }
    }
    socket.emit('tags_updated');
  });
  
  socket.on('unarchiveChat', (chatId) => {
    console.log(`Mock: Unarchiving chat ${chatId}`);
    const archivedTag = mockData.tags.find(t => t.name === 'Archived' && t.is_system);
    if (archivedTag) {
      mockData.tagAssignments = mockData.tagAssignments.filter(
        a => !(a.tag_id === archivedTag.id && a.chat_id === chatId)
      );
      saveMockData();
    }
    socket.emit('tags_updated');
  });
  
  socket.on('disconnect', () => {
    console.log('Frontend disconnected');
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log('🎨 MOCK SERVER RUNNING - Frontend Development Mode');
  console.log('='.repeat(60));
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log('No WhatsApp connection required!');
  console.log('All data is loaded from mock-data.json');
  console.log('Changes to tags/notes/quick replies are saved to mock-data.json');
  console.log('='.repeat(60));
});
