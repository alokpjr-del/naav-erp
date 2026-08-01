const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('restaurant settlement UI includes edit and refresh handlers', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

  assert.match(html, /function editRestSettlementSecurityCheck/);
  assert.match(html, /function updateRestSettlement/);
  assert.match(html, /function deleteRestSettlementSecurityCheck/);
  assert.match(html, /loadDashboard\(\);\s*generateReport\(\);/m);
});
