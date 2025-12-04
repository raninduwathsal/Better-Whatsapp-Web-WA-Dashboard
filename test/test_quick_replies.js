// Enhanced quick-replies API test with delays and exit codes.
// Usage: start server (npm start) then run: `npm run test-quick-replies` or `node test/test_quick_replies.js`

(async function(){
  const base = process.env.TEST_BASE_URL || 'http://localhost:3000';
  const api = base + '/api/quick-replies';
  function ok(res){ return res && (res.status>=200 && res.status<300); }
  // Remove built-in delays for faster automated runs
  // const sleep = (ms)=> new Promise(r=>setTimeout(r, ms));

  console.log('Testing quick-replies API at', api);
  let passed = true;
  try {
    // 1) GET initial
    let r = await fetch(api);
    console.log('[GET] /api/quick-replies ->', r.status);
    const before = await r.json();
    console.log('Initial count:', Array.isArray(before) ? before.length : 'N/A');
    

    // 2) CREATE
    const payload = { text: 'Test reply\nLine two' };
    console.log('[POST] creating quick reply...');
    r = await fetch(api, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    console.log('[POST] ->', r.status);
    if (!ok(r)) { console.error('Create failed', await r.text()); passed = false; }
    const created = ok(r) ? await r.json() : null;
    console.log('Created:', created);
    const id = created && created.id;
    if (!id) { console.error('Missing id on created resource'); passed = false; }
    

    // 3) GET and confirm
    console.log('[GET] verifying create...');
    r = await fetch(api);
    console.log('[GET] ->', r.status);
    const afterCreate = await r.json();
    console.log('Count after create:', afterCreate.length);
    

    // 4) UPDATE
    const newText = 'Updated reply\nWith second line';
    console.log('[PUT] updating created item...');
    r = await fetch(`${api}/${id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ text: newText }) });
    console.log('[PUT] ->', r.status);
    if (!ok(r)) { console.error('Update failed', await r.text()); passed = false; }
    const updated = ok(r) ? await r.json() : null;
    console.log('Updated:', updated);
    

    // 5) GET and verify update
    console.log('[GET] verifying update...');
    r = await fetch(api);
    const afterUpdate = await r.json();
    const found = afterUpdate.find(x=>x.id === id);
    if (!found) { console.error('Updated item not found'); passed = false; }
    else if (found.text !== newText) { console.error('Updated text mismatch', found.text); passed = false; }
    else console.log('Updated text verified');
    

    // 6) DELETE
    console.log('[DELETE] deleting created item...');
    r = await fetch(`${api}/${id}`, { method: 'DELETE' });
    console.log('[DELETE] ->', r.status);
    if (!ok(r)) { console.error('Delete failed', await r.text()); passed = false; }
    

    // 7) Final GET
    console.log('[GET] final list...');
    r = await fetch(api);
    const final = await r.json();
    console.log('Final count:', final.length);
    

    // 8) EXPORT
    console.log('[EXPORT] fetching exported JSON...');
    r = await fetch(base + '/api/quick-replies/export');
    console.log('[EXPORT] ->', r.status);
    if (!ok(r)) { console.error('Export failed', await r.text()); passed = false; }
    const exported = await r.json();
    console.log('Exported count:', Array.isArray(exported) ? exported.length : 'N/A');

    // 9) IMPORT (append) - create two unique items and import them
    const marker = 'TEST-IMPORT-' + Date.now();
    const importItems = [ { text: marker + '-1' }, { text: marker + '-2' } ];
    console.log('[IMPORT] appending two items...');
    r = await fetch(base + '/api/quick-replies/import', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ items: importItems, replace: false }) });
    console.log('[IMPORT] ->', r.status);
    if (!ok(r)) { console.error('Import failed', await r.text()); passed = false; }
    const importRes = ok(r) ? await r.json() : null;
    console.log('Import result count:', importRes && importRes.count);
    

    // 10) Verify imported items exist and clean up (delete them)
    r = await fetch(api);
    const allNow = await r.json();
    const added = allNow.filter(x=> x.text && (x.text.indexOf(marker) === 0));
    console.log('Found imported items:', added.length);
    if (added.length !== 2) { console.error('Import verification failed'); passed = false; }
    // cleanup
    for (const a of added){
      await fetch(`${api}/${a.id}`, { method: 'DELETE' });
    }
    

  } catch (err){
    console.error('Test script error', err);
    passed = false;
  }

  if (passed) {
    console.log('\nTEST PASS — API appears to be working.');
    process.exit(0);
  } else {
    console.error('\nTEST FAIL — see errors above.');
    process.exit(1);
  }

})();

