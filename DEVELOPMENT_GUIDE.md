# Development Guide

## Overview

This is a modular WhatsApp Web dashboard built with Node.js, Express, Socket.io, and vanilla JavaScript. The codebase is organized into feature-based modules for easy maintenance and scalability.

## Frontend Development Mode (No WhatsApp Required)

For frontend developers who want to work on the UI without connecting to WhatsApp, use the mock server:

```bash
npm run dev-frontend
```

This starts a mock server that:
- ✅ Serves the frontend with sample chats and messages
- ✅ Provides fully functional API endpoints for tags, notes, and quick replies
- ✅ Simulates Socket.io events (chats, ready, tags_updated)
- ✅ Saves changes to `mock-data.json` (persists across restarts)
- ✅ No WhatsApp authentication required
- ✅ Perfect for UI/UX development and testing

**Mock Data:**
- 6 sample chats with realistic messages
- 5 tags (including system "Archived" tag)
- Tag assignments
- 3 notes
- 5 quick replies

You can edit `mock-data.json` to customize the sample data. All changes made through the UI (creating tags, notes, etc.) are saved back to this file.

**Mock Server Features:**
- Full CRUD operations for tags, notes, quick replies
- Tag assignment/unassignment
- Archive/unarchive functionality
- Send message simulation (adds to chat history)
- Import/export functionality

## Project Structure

```
Better-Whatsapp-Web-WA-Dashboard/
├── index.js                          # Main entry point (WhatsApp mode)
├── mock-server.js                    # Mock server (dev mode)
├── mock-data.json                    # Sample data for mock server
├── package.json                      # Project dependencies & scripts
├── data.sqlite                       # SQLite database (auto-created)
├── server/                           # Backend modules
│   ├── database/
│   │   └── init.js                  # Database setup, migrations, helpers
│   ├── whatsapp/
│   │   └── client.js                # WhatsApp client lifecycle
│   ├── routes/
│   │   ├── tags.js                  # Tag management API
│   │   ├── notes.js                 # Notes API
│   │   └── quickReplies.js          # Quick replies API
│   └── sockets/
│       └── handlers.js              # Socket.io event handlers
├── public/                           # Frontend assets
│   ├── index.html                   # Main HTML file
│   └── js/
│       ├── app.js                   # Main app initialization
│       ├── state.js                 # Global state management
│       ├── socket.js                # Socket event handlers
│       ├── features/                # Feature modules
│       │   ├── tags.js             # Tag functionality
│       │   ├── notes.js            # Notes functionality
│       │   ├── quickReplies.js     # Quick replies functionality
│       │   └── archive.js          # Archive/unarchive functionality
│       └── ui/                      # UI component modules
│           ├── chats.js            # Chat list rendering
│           ├── contextMenu.js      # Right-click context menu
│           └── modals.js           # Modal components
└── test/                             # Test files
    ├── test_tags.js
    ├── test_notes.js
    └── test_quick_replies.js
```

## Backend Architecture

### Core Modules

#### `server/database/init.js`
Manages SQLite database initialization and migrations.

**Key Functions:**
- `initSqlite()` - Initialize database, create tables, run migrations
- `getDb()` - Get SQLite database instance
- `isDbReady()` - Check if database is ready
- `persistDb()` - Save database to disk
- `rowsFromExec(execResult)` - Convert SQL execution results to objects
- `extractPhoneFromChatId(chatId)` - Extract phone number from WhatsApp chat ID
- `normalizePhone(phone)` - Normalize phone number format
- `getArchivedTagId()` - Get ID of the system Archived tag
- `ensureArchivedTag()` - Create Archived tag if it doesn't exist

**Database Schema:**
```sql
tags (id, name, color, is_system, created_at)
tag_assignments (id, tag_id, chat_id, phone_number, created_at)
notes (id, chat_id, phone_number, text, created_at, updated_at)
quick_replies (id, text, created_at)
```

#### `server/whatsapp/client.js`
Manages WhatsApp Web client lifecycle and chat fetching.

**Key Functions:**
- `initClient(io)` - Initialize WhatsApp client with QR scanning
- `fetchChats(io)` - Fetch recent chats with message history
- `isReady()` - Check if WhatsApp client is ready
- `getClient()` - Get WhatsApp client instance
- `assignArchivedTagIfNeeded(archivedTagId, chatId, io)` - Auto-tag archived chats

**Features:**
- QR code generation for authentication
- Automatic archived chat detection
- Message history (last 3 messages per chat)
- Sticker media handling

#### `server/routes/tags.js`
RESTful API endpoints for tag management.

**Endpoints:**
- `GET /api/tags` - Get all tags
- `POST /api/tags` - Create new tag
- `PUT /api/tags/:id` - Update tag
- `DELETE /api/tags/:id` - Delete tag (protected for system tags)
- `POST /api/tags/assign` - Assign tag to chat
- `POST /api/tags/unassign` - Remove tag from chat
- `GET /api/tags/export` - Export tags and assignments
- `POST /api/tags/import` - Import tags and assignments

**Protection:**
- System tags (is_system=1) cannot be edited or deleted
- Removing archived tag from chat unarchives it in WhatsApp

#### `server/routes/notes.js`
RESTful API endpoints for notes management.

**Endpoints:**
- `GET /api/notes` - Get all notes
- `POST /api/notes` - Create new note
- `PUT /api/notes/:id` - Update note
- `DELETE /api/notes/:id` - Delete note
- `GET /api/notes/counts` - Get note counts per chat
- `GET /api/notes/export` - Export all notes
- `POST /api/notes/import` - Import notes

#### `server/routes/quickReplies.js`
RESTful API endpoints for quick replies management.

**Endpoints:**
- `GET /api/quick-replies` - Get all quick replies
- `POST /api/quick-replies` - Create new quick reply
- `PUT /api/quick-replies/:id` - Update quick reply
- `DELETE /api/quick-replies/:id` - Delete quick reply
- `GET /api/quick-replies/export` - Export quick replies
- `POST /api/quick-replies/import` - Import quick replies

#### `server/sockets/handlers.js`
Socket.io event handlers for real-time communication.

**Events:**
- `requestMessages` - Request latest chats list
- `sendPreset` - Send preset message to chat
- `getFullChat` - Get full conversation history
- `archiveChat` - Archive chat in WhatsApp
- `unarchiveChat` - Unarchive chat in WhatsApp
- `chats` - Emit chats to client
- `qr` - Emit QR code for authentication
- `ready` - Emit when WhatsApp is ready
- `tags_updated` - Emit when tags change

## Frontend Architecture

### Global State (`public/js/state.js`)

Centralized state object available as `AppState`:

```javascript
AppState = {
  // Chat data
  chats: [],                          // All chats
  pinned: Set,                        // Pinned chat IDs
  selectedChats: Set,                 // Selected chat IDs
  
  // Tag data
  tags: [],                           // All tags
  tagAssignments: {},                 // Map: chatId -> [tagIds]
  selectedTagFilters: Set,            // Active tag filters
  
  // Notes
  notesCounts: {},                    // Map: chatId -> count
  
  // Quick replies
  quickReplies: [],                   // All quick replies
  showAllQuickReplies: false,         // Show all vs truncated
  
  // UI state
  sidebarVisible: false,              // Sidebar open/closed
  tagsSettingsOpen: false,            // Tags panel expanded
  notesSettingsOpen: false,           // Notes panel expanded
  quickRepliesSettingsOpen: false,    // Quick replies panel expanded
  currentContextMenu: null,           // Active context menu
  
  // DOM elements
  qrImg: null,
  statusEl: null,
  messagesEl: null,
  presetInput: null,
  sendBtn: null,
  refreshBtn: null
};
```

### Feature Modules

#### `public/js/features/tags.js`
Tag management functionality.

**Functions:**
- `loadTagsFromServer()` - Fetch tags and assignments from server
- `createTagOnServer(name, color)` - Create new tag
- `updateTagOnServer(id, name, color)` - Update existing tag
- `deleteTagOnServer(id)` - Delete tag (checks permissions)
- `assignTagOnServer(tagId, chatId)` - Assign tag to chat
- `unassignTagOnServer(tagId, chatId)` - Remove tag from chat
- `openTagEditor(initialName, initialColor, onSave)` - Open tag editor modal
- `renderTagFilterChips()` - Render tag filter buttons
- `renderTagsSettings()` - Render tags settings panel

#### `public/js/features/notes.js`
Notes functionality.

**Functions:**
- `loadNotesCountsFromServer()` - Fetch note counts per chat
- `createNoteOnServer(chatId, text)` - Create new note
- `updateNoteOnServer(id, text)` - Update existing note
- `deleteNoteOnServer(id)` - Delete note
- `openNotesModal(chatId, chatName)` - Open notes editor modal
- `showNotesPreviewBubble(element, chatId)` - Show notes preview tooltip
- `hideNotesPreviewBubble()` - Hide notes preview
- `renderNotesSettings()` - Render notes settings panel

#### `public/js/features/quickReplies.js`
Quick replies functionality.

**Functions:**
- `loadQuickRepliesFromServer()` - Fetch quick replies
- `createQuickReplyOnServer(text)` - Create new quick reply
- `updateQuickReplyOnServer(id, text)` - Update quick reply
- `deleteQuickReplyOnServer(id)` - Delete quick reply
- `openQuickReplyEditor(initialText, onSave)` - Open editor modal
- `renderQuickReplies()` - Render quick reply buttons
- `renderQuickRepliesSettings()` - Render quick replies settings panel

#### `public/js/features/archive.js`
Archive/unarchive functionality.

**Functions:**
- `archiveChat(chatId)` - Archive chat in WhatsApp and add Archived tag
- `unarchiveChat(chatId)` - Unarchive chat and remove Archived tag

### UI Modules

#### `public/js/ui/chats.js`
Chat list rendering.

**Functions:**
- `renderChats()` - Render all chats with filters applied
  - Sorts by: pinned status, unread count, timestamp
  - Applies tag filters
  - Shows tag badges, note count, unread indicator
  - Displays last 3 messages as preview

#### `public/js/ui/contextMenu.js`
Right-click context menu for chats.

**Functions:**
- `openTagContextMenu(x, y, chatId)` - Open context menu
  - Shows all non-system tags (can toggle assignment)
  - Shows notes options
  - Shows archive/unarchive action
  - Allows creating new tags

#### `public/js/ui/modals.js`
Modal components for various functions.

**Functions:**
- `openFullChat(chatId)` - Open full conversation history modal
- `openNotesModal(chatId, chatName)` - Open notes editor modal
- `openQuickReplyEditor(initialText, onSave)` - Open quick reply editor
- `openTagEditor(initialName, initialColor, onSave)` - Open tag editor

### Socket Communication (`public/js/socket.js`)

Handles all Socket.io events and real-time updates.

**Key Events:**
- `socket.on('chats')` - Receive chat list updates
- `socket.on('ready')` - WhatsApp client ready
- `socket.on('qr')` - Receive QR code for auth
- `socket.on('tags_updated')` - Tags changed on server
- `socket.emit('requestMessages')` - Request chats refresh
- `socket.emit('sendPreset')` - Send message
- `socket.emit('getFullChat')` - Get conversation history
- `socket.emit('archiveChat')` / `unarchiveChat` - Archive operations

### Main App (`public/js/app.js`)

Application initialization and coordination.

**Functions:**
- `initializeApp()` - Initialize all features on page load
- `sendPreset()` - Send preset message to selected chats
- `createSettingsSidebar()` - Create settings sidebar
- `toggleSidebar()` - Toggle sidebar visibility

## Development Workflow

### Adding a New Feature

1. **Create API endpoint** (if backend logic needed)
   ```javascript
   // server/routes/newfeature.js
   router.get('/', (req, res) => {
     // Implementation
   });
   module.exports = router;
   ```

2. **Mount route in index.js**
   ```javascript
   app.use('/api/newfeature', require('./server/routes/newfeature'));
   ```

3. **Create feature module** (if frontend needed)
   ```javascript
   // public/js/features/newfeature.js
   async function loadNewFeatureFromServer() { }
   function renderNewFeatureUI() { }
   ```

4. **Add to index.html**
   ```html
   <script src="/js/features/newfeature.js"></script>
   ```

5. **Call from app.js or other modules**
   ```javascript
   // In app.js initializeApp()
   loadNewFeatureFromServer();
   ```

### Modifying Existing Modules

1. Edit the specific module file
2. Test changes with `npm start`
3. Check browser console for errors
4. Run tests: `npm test` or `npm run test-tags`

### Best Practices

- Keep modules focused on a single feature
- Use descriptive function names
- Add error handling with try/catch
- Use AppState for shared data
- Emit socket events for real-time updates
- Always handle async operations properly

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run specific test
npm run test-tags
npm run test-notes
npm run test-quick-replies
```

### Test Files

Tests are located in `test/` directory and use Node.js built-in assertions.

**Test Structure:**
```javascript
// test/test_feature.js
const assert = require('assert');

// Test setup
describe('Feature', () => {
  it('should perform action', () => {
    // Arrange
    const input = ...;
    
    // Act
    const result = ...;
    
    // Assert
    assert.strictEqual(result, expected);
  });
});
```

### Key Test Files

#### `test/test_tags.js`
Tests tag creation, assignment, deletion, and exports.

#### `test/test_notes.js`
Tests note creation, updating, deletion, and retrieval.

#### `test/test_quick_replies.js`
Tests quick reply CRUD operations.

### Writing New Tests

1. Create test file: `test/test_feature.js`
2. Use assertions to verify behavior
3. Add to package.json scripts: `"test-feature": "node test/test_feature.js"`
4. Run with `npm run test-feature`

## Database Migrations

Migrations run automatically on startup in `server/database/init.js`:

1. Table creation
2. Column additions (ALTER TABLE)
3. Data backfills

To add a migration:
1. Add logic in `initSqlite()` after table creation
2. Check for existing column/table
3. Create if missing, don't fail if exists
4. Log migration steps

Example:
```javascript
try {
  sqliteDb.exec("SELECT new_column FROM table_name LIMIT 1");
} catch (err) {
  if (err.message && err.message.includes('no such column')) {
    console.log('Migrating: adding new_column...');
    sqliteDb.run("ALTER TABLE table_name ADD COLUMN new_column TEXT");
  }
}
```

## Debugging

### Browser Console
Check for errors:
1. Open DevTools (F12)
2. Check Console tab for errors
3. Check Network tab for API failures

### Server Logs
Watch server output:
```bash
npm start
# Logs show:
# - Database initialization
# - QR code generation
# - WhatsApp ready status
# - API request errors
```

### Common Issues

**"Database not ready"**
- Wait for database initialization
- Check data.sqlite permissions

**"WhatsApp not authenticated"**
- Scan QR code with WhatsApp app
- Check browser console for QR errors

**"API call failed"**
- Check Network tab in DevTools
- Verify endpoint exists
- Check server logs for errors

**"Socket connection failed"**
- Verify server is running
- Check socket.io configuration
- Ensure websocket port (3000) is not blocked

## Deployment

### Pre-deployment Checklist

- [ ] All tests pass
- [ ] No console errors
- [ ] All features working
- [ ] Database migrations complete
- [ ] Remove debug code

### Environment Variables

Currently uses default PORT 3000. To customize:
```bash
PORT=8000 npm start
```

### Production Notes

- Use `NODE_ENV=production`
- Ensure database file is writable
- Set up WhatsApp Web authentication
- Consider PM2 or systemd for service management

## Contributing

1. Create feature branch
2. Make changes following the module structure
3. Add tests if adding new functionality
4. Ensure all tests pass
5. Test in browser
6. Submit for review

## Performance Tips

- Cache API responses when possible
- Batch socket emissions
- Debounce UI updates
- Lazy load heavy features
- Monitor database query performance

## Resources

- [WhatsApp Web.js Docs](https://waha.docs.openwa.com/)
- [Socket.io Docs](https://socket.io/docs/)
- [Express.js Guide](https://expressjs.com/)
- [SQLite Documentation](https://www.sqlite.org/docs.html)
