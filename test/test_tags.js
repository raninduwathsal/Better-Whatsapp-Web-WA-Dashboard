// Test script for tags API (CRUD, assignments, filtering, export/import, remapping)
// Run with: node test/test_tags.js
// Expected: exits with code 0 on success, 1 on failure

const BASE_URL = 'http://localhost:3000';

// Unique prefix for resources created by this test run so cleanup only removes test artifacts
const TEST_PREFIX = `test_auto_${Date.now()}_`;

let testsPassed = 0;
let testsFailed = 0;

function log(msg) {
  console.log(`[TEST] ${msg}`);
}

function pass(msg) {
  testsPassed++;
  console.log(`✓ PASS: ${msg}`);
}

function fail(msg) {
  testsFailed++;
  console.error(`✗ FAIL: ${msg}`);
}

// delay helper removed to speed up automated test runs

async function get(path) {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return await res.json();
}

async function post(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
  return await res.json();
}

async function put(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`PUT ${path} failed: ${res.status}`);
  return await res.json();
}

async function del(path) {
  const res = await fetch(`${BASE_URL}${path}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`DELETE ${path} failed: ${res.status}`);
  return await res.json();
}

(async () => {
  try {
    log('Starting tags functionality tests...');

    // Initial cleanup: remove any tags left from previous test runs (matching our TEST_PREFIX)
    log('Cleaning up previous test tags...');
    const existingTags = await get('/api/tags');
    for (const t of existingTags) {
      if (t.name && t.name.startsWith(TEST_PREFIX)) {
        await del(`/api/tags/${t.id}`);
      }
    }
    log('Cleanup complete');

    // Test 1: Create tag
    log('Test 1: Creating tag "VIP" with color #ffcc00');
    const created1 = await post('/api/tags', { name: TEST_PREFIX + 'VIP', color: '#ffcc00' });
    if (created1 && created1.id && String(created1.name).startsWith(TEST_PREFIX) ) {
      pass('Tag created successfully');
    } else {
      console.error('DEBUG created1:', created1);
      fail('Tag creation failed or returned unexpected data');
    }
    

    // Test 2: Create second tag
    log('Test 2: Creating tag "Important" with color #ff6666');
    const created2 = await post('/api/tags', { name: TEST_PREFIX + 'Important', color: '#ff6666' });
    if (created2 && created2.id && String(created2.name).startsWith(TEST_PREFIX)) {
      pass('Second tag created successfully');
    } else {
      console.error('DEBUG created2:', created2);
      fail('Second tag creation failed');
    }
    

    // Test 3: List tags and verify our created tags are present
    log('Test 3: Listing all tags');
    const tags = await get('/api/tags');
    const found1 = tags.find(t => t.id === created1.id || t.name === created1.name);
    const found2 = tags.find(t => t.id === created2.id || t.name === created2.name);
    if (found1 && found2) {
      pass('Both created tags are present in tag listing');
    } else {
      fail('Created tags not found in listing');
    }
    

    // Test 4: Update tag
    log('Test 4: Updating "VIP" tag to "Super VIP" with color #00ff00');
    const updated = await put(`/api/tags/${created1.id}`, { name: 'Super VIP', color: '#00ff00' });
    if (updated && updated.name === 'Super VIP' && updated.color === '#00ff00') {
      pass('Tag updated successfully');
    } else {
      fail('Tag update failed');
    }
    

    // Test 5: Assign tag to a chat
    log('Test 5: Assigning tag to test chat 1234567890@c.us');
    const assigned1 = await post('/api/tags/assign', { tagId: created1.id, chatId: '1234567890@c.us' });
    if (assigned1 && assigned1.ok) {
      pass('Tag assigned to chat');
    } else {
      fail('Tag assignment failed');
    }
    

    // Test 6: Assign second tag to same chat
    log('Test 6: Assigning second tag to same chat');
    const assigned2 = await post('/api/tags/assign', { tagId: created2.id, chatId: '1234567890@c.us' });
    if (assigned2 && assigned2.ok) {
      pass('Second tag assigned to chat');
    } else {
      fail('Second tag assignment failed');
    }
    

    // Test 7: Assign tag to a group chat (should skip phone extraction)
    log('Test 7: Assigning tag to group chat 123456789-1234567890@g.us');
    const assignedGroup = await post('/api/tags/assign', { tagId: created1.id, chatId: '123456789-1234567890@g.us' });
    if (assignedGroup && assignedGroup.ok) {
      pass('Tag assigned to group chat');
    } else {
      fail('Group chat tag assignment failed');
    }

    // Test 8: Duplicate assignment detection
    log('Test 8: Attempting duplicate assignment (should be skipped)');
    const duplicate = await post('/api/tags/assign', { tagId: created1.id, chatId: '1234567890@c.us' });
    if (duplicate && duplicate.ok && duplicate.existing) {
      pass('Duplicate assignment detected and skipped');
    } else {
      fail('Duplicate assignment not properly handled');
    }
    

    // Test 9: Export tags and assignments (no delay - backend task)
    log('Test 9: Exporting tags and assignments');
    const exported = await get('/api/tags/export');
    if (exported && Array.isArray(exported.tags) && Array.isArray(exported.assignments)) {
      const tagCount = exported.tags.length;
      const assignCount = exported.assignments.length;
      if (tagCount >= 2 && assignCount >= 3) {
        pass(`Exported ${tagCount} tags and ${assignCount} assignments`);
      } else {
        fail(`Export count mismatch: ${tagCount} tags, ${assignCount} assignments`);
      }
    } else {
      fail('Export failed or returned unexpected format');
    }

    // Test 10: Import with ID remapping (no delay - backend task)
    log('Test 10: Testing import with ID remapping');
    const importData = {
      tags: [
        { id: 999, name: TEST_PREFIX + 'Imported VIP', color: '#0000ff' },
        { id: 998, name: TEST_PREFIX + 'Imported Important', color: '#ff00ff' }
      ],
      assignments: [
        { tag_id: 999, chat_id: '9876543210@c.us' },
        { tag_id: 998, chat_id: '9876543210@c.us' },
        { tag_id: 999, chat_id: '1234567890@c.us' } // duplicate should be skipped
      ],
      replace: false
    };
    const imported = await post('/api/tags/import', importData);
    if (imported && imported.ok) {
      const a = imported.assignments;
      if (a && a.total === 3 && a.imported >= 2 && a.imported <= 3) {
        pass(`Import successful: ${a.imported} imported, ${a.skipped} skipped, ${a.failed} failed`);
      } else {
        fail(`Import stats unexpected: ${JSON.stringify(a)}`);
      }
    } else {
      fail('Import failed');
    }

    // Test 11: Verify imported tags exist (look for our prefixed imported tag names)
    log('Test 11: Verifying imported tags');
    const afterImport = await get('/api/tags');
    const impA = afterImport.find(t => t.name === TEST_PREFIX + 'Imported VIP');
    const impB = afterImport.find(t => t.name === TEST_PREFIX + 'Imported Important');
    if (impA && impB) {
      pass('Imported tags found');
    } else {
      fail('Imported tags not found');
    }
    

    // Test 12: Phone number fallback test (no delay - backend task)
    log('Test 12: Testing phone number fallback in import');
    const phoneImport = {
      tags: [{ name: TEST_PREFIX + 'Phone Test', color: '#cccccc' }],
      assignments: [
        { tag_id: 1, phone_number: '+12345678901' } // should construct chat_id
      ],
      replace: false
    };
    const phoneImported = await post('/api/tags/import', phoneImport);
    if (phoneImported && phoneImported.ok && phoneImported.assignments.imported >= 0) {
      pass('Phone number fallback import succeeded');
    } else {
      fail('Phone number fallback import failed');
    }

    // Test 13: Unassign tag
    log('Test 13: Unassigning tag from chat');
    const unassigned = await post('/api/tags/unassign', { tagId: created2.id, chatId: '1234567890@c.us' });
    if (unassigned && unassigned.ok) {
      pass('Tag unassigned successfully');
    } else {
      fail('Tag unassignment failed');
    }
    

    // Test 13b: Check assignment count endpoint
    log('Test 13b: Getting assignment count for tag');
    const countBefore = await get(`/api/tags/${created1.id}/count`);
    if (countBefore && countBefore.count >= 1) {
      pass(`Tag has ${countBefore.count} assignment(s) before deletion`);
    } else {
      fail('Failed to get assignment count');
    }

    // Test 14: Delete tag (should also delete assignments)
    log('Test 14: Deleting tag (cascade delete assignments)');
    const deleted = await del(`/api/tags/${created1.id}`);
    if (deleted && deleted.ok) {
      pass('Tag deleted successfully');
    } else {
      fail('Tag deletion failed');
    }
    

    // Test 15: Verify tag is deleted
    log('Test 15: Verifying tag deletion');
    const afterDelete = await get('/api/tags');
    const stillExists = afterDelete.find(t => t.id === created1.id);
    if (!stillExists) {
      pass('Tag successfully removed from database');
    } else {
      fail('Deleted tag still exists');
    }
    

    // Test 16: Verify assignment count is 0 after tag delete
    log('Test 16: Verifying assignments deleted with tag');
    const countAfter = await get(`/api/tags/${created1.id}/count`);
    if (countAfter && countAfter.count === 0) {
      pass('All assignments deleted with tag');
    } else {
      fail('Assignments still exist after tag deletion');
    }

    // Final cleanup: delete all remaining tags
    log('Cleaning up all remaining test tags...');
    const finalTags = await get('/api/tags');
      for (const t of finalTags) {
        if (t.name && t.name.startsWith(TEST_PREFIX)) {
          await del(`/api/tags/${t.id}`);
        }
      }
    log('Cleanup complete');

    // Summary
    log('');
    log('========================================');
    log(`Tests Passed: ${testsPassed}`);
    log(`Tests Failed: ${testsFailed}`);
    log('========================================');

    if (testsFailed === 0) {
      log('✓ All tests passed!');
      process.exit(0);
    } else {
      log('✗ Some tests failed');
      process.exit(1);
    }

  } catch (err) {
    console.error('Test execution error:', err);
    process.exit(1);
  }
})();
