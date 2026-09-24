const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '../..');
const clone = value => JSON.parse(JSON.stringify(value));
const sale = (id, ticket, overrides = {}) => ({
  id, ticketId: String(ticket), fullName: id, phone: '2125550100',
  createdAt: '2026-09-24T12:00:00Z', paidOn: '2026-09-24',
  status: 'paid', quantity: 1, price: 23, paymentType: 'cash', ...overrides
});
const remote = {
  sales: [
    sale('Cash customer', 100001, { quantity: 7, price: 161 }),
    sale('Credit customer', 100002, { quantity: 3, price: 69, paymentType: 'credit' }),
    sale('Online flagged', 100003, { quantity: 4, price: 92, paymentType: 'credit', isOnlineSale: true }),
    sale('Online legacy', 100004, { quantity: 2, price: 46, paymentType: 'online' }),
    sale('Free customer', 100005, { quantity: 5, price: 0, paymentType: 'banshak' }),
    sale('Reserved customer', 100006, { quantity: 6, price: 138, status: 'reserved', paidOn: null }),
    sale('Treifa record', 100007, { quantity: 1, price: 0, status: 'treifa', paymentType: '', paidOn: null }),
    sale('Dead record', 100008, { quantity: 2, price: 0, status: 'dead', paymentType: '', paidOn: null }),
    sale('Expired customer', 100009, { quantity: 9, price: 207, status: 'expired', paymentType: 'credit', paidOn: null })
  ],
  settings: {
    username: 'fixture', inventory: 200, defaultPrice: 23, chickenPurchaseCost: 13,
    invalidShechitaCost: 5, unsoldChickenCost: 8, chickenCostModelVersion: 1,
    paymentMethods: [
      { id: 'cash', label: 'Cash' }, { id: 'credit', label: 'Credit card' },
      { id: 'other', label: 'Other' }, { id: 'banshak', label: 'בנש״ק' }
    ],
    buyingWebsite: { publicAccessEnabled: false, orderingEnabled: true }
  },
  updatedAt: '2026-09-24T12:00:00Z'
};

let w;
async function until(predicate) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (predicate()) return;
    await new Promise(resolve => setImmediate(resolve));
  }
  throw new Error('Reports fixture did not settle');
}

(async () => {
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), {
    url: 'https://pinchesblum-bit.github.io/siksakapparos/', runScripts: 'outside-only', pretendToBeVisual: true
  });
  w = dom.window;
  const doc = w.document;
  const errors = [];
  const requests = [];
  w.addEventListener('error', event => errors.push(event.error?.stack || event.message));
  w.sessionStorage.setItem('kapparosLoggedInV1', 'local-fixture-token');
  w.localStorage.setItem('kapparosCloudMigratedV1', 'true');
  w.AbortSignal = AbortSignal;
  w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {} });
  w.scrollTo = () => {};
  w.setInterval = () => 0;
  w.fetch = async (url, init) => {
    assert.ok(url.endsWith('/kapparos-access'));
    assert.equal(init.cache, 'no-store');
    const request = JSON.parse(init.body);
    requests.push(request);
    assert.equal(request.action, 'get', 'This fixture must never submit a write or contact production');
    return Response.json(clone(remote));
  };
  for (const element of doc.querySelectorAll('script')) {
    if (element.src) {
      const name = new URL(element.src).pathname.split('/').pop();
      if (name !== 'ticket-design.js') w.eval(fs.readFileSync(path.join(root, name), 'utf8'));
    } else {
      const expose = element.textContent.includes('initializeCloudSession();')
        ? '\nwindow.fixture = { state, renderReports, renderSales, exportAllData, refreshCloudStateSilently, get ready() { return cloudReady; } };'
        : '';
      w.eval(element.textContent + expose);
    }
  }
  await until(() => w.fixture?.ready);
  assert.deepEqual(errors, []);

  const node = id => {
    const found = doc.getElementById(id);
    assert.ok(found, `Missing #${id}`);
    return found;
  };
  const stat = (grid, label) => {
    const card = [...node(grid).querySelectorAll('.stat-card')]
      .find(item => item.querySelector('.stat-label')?.textContent.trim() === label);
    assert.ok(card, `Missing ${label} in ${grid}`);
    return card.querySelector('.stat-value').textContent.trim();
  };
  w.fixture.renderReports();
  assert.equal(node('reportSalesTotal').textContent, '8', 'Report counts sale records, not quantities; expired records are excluded');
  assert.equal(node('reportChickenTotal').textContent, '200');
  assert.equal(node('reportPaidTotal').textContent, '176');
  assert.equal(node('reportNeedsReservedTotal').textContent, '27');
  assert.equal(node('reportNeedsSavedTotal').textContent, '21');
  assert.equal(stat('salesCountGrid', 'Cash sales'), '2');
  assert.equal(stat('salesCountGrid', 'Credit card sales'), '1');
  assert.equal(stat('salesCountGrid', 'Online sales'), '2');
  assert.equal(stat('moneyTotalsGrid', 'Cash total'), '$161.00');
  assert.equal(stat('moneyTotalsGrid', 'Credit card total'), '$69.00');
  assert.equal(stat('moneyTotalsGrid', 'Online total'), '$138.00');
  assert.equal(node('subtotalMoney').textContent, '$368.00');
  console.log('PASS Reports counts records separately from chicken quantities; online counts and money stay separate from credit');

  const filter = node('salesPaymentFilter');
  const search = node('salesSearch');
  const resultIds = () => [...doc.querySelectorAll('#salesTableWrap [data-sale-id]')]
    .map(row => row.dataset.saleId).sort();
  const selectFilter = value => {
    filter.value = value;
    assert.equal(filter.value, value, `Missing payment filter ${value}`);
    filter.dispatchEvent(new w.Event('change', { bubbles: true }));
  };
  selectFilter('online');
  assert.deepEqual(resultIds(), ['Online flagged', 'Online legacy']);
  assert.equal(node('salesSearchCount').textContent, '2 sales found');
  selectFilter('credit');
  assert.deepEqual(resultIds(), ['Credit customer', 'Expired customer']);
  assert.equal(node('salesSearchCount').textContent, '2 sales found');
  search.value = 'Credit customer';
  search.dispatchEvent(new w.Event('input', { bubbles: true }));
  assert.deepEqual(resultIds(), ['Credit customer']);
  assert.equal(node('salesSearchCount').textContent, '1 sale found');
  search.value = 'missing fixture name';
  search.dispatchEvent(new w.Event('input', { bubbles: true }));
  assert.equal(node('salesSearchCount').textContent, '0 sales found');
  search.value = '';
  search.dispatchEvent(new w.Event('input', { bubbles: true }));
  selectFilter('online');
  console.log('PASS Online and credit filters are distinct; combined text/payment searches show exact record counts');

  let exported;
  w.Blob = class { constructor(parts) { exported = parts.join(''); } };
  w.URL.createObjectURL = () => 'blob:fixture-export';
  w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = () => {};
  w.fixture.exportAllData();
  const workbook = new w.DOMParser().parseFromString(exported.replace(/^\uFEFF/, ''), 'text/xml');
  assert.equal(workbook.querySelector('parsererror'), null);
  const reportSheet = [...workbook.getElementsByTagName('Worksheet')]
    .find(sheet => sheet.getAttribute('ss:Name') === 'Reports');
  assert.ok(reportSheet);
  const reportRows = [...reportSheet.getElementsByTagName('Row')]
    .map(row => [...row.getElementsByTagName('Data')].map(cell => cell.textContent));
  const reportRow = label => {
    const row = reportRows.find(values => values[0] === label);
    assert.ok(row, `Missing exported row ${label}`);
    return row;
  };
  assert.deepEqual(reportRow('Total sales'), ['Total sales', '8']);
  assert.deepEqual(reportRow('Credit card'), ['Credit card', '1', '69']);
  assert.deepEqual(reportRow('Online'), ['Online', '2', '138']);
  assert.equal(reportRow('Subtotal (excluding בנש״ק)')[1], '368');
  console.log('PASS Excel Reports matches displayed total sales and online/credit groups');

  node('salesSearchOptionsBtn').click();
  const menu = node('salesPaymentFilterMenu');
  assert.equal(menu.hidden, false);
  assert.equal(doc.activeElement, filter);
  const filterOptions = [...filter.options];
  const paymentOptions = [...node('paymentType').options];
  const verifyStableOptions = () => {
    assert.equal(menu.hidden, false, 'Polling must not close an open payment menu');
    assert.equal(node('salesSearchOptionsBtn').getAttribute('aria-expanded'), 'true');
    assert.equal(doc.activeElement, filter, 'Polling must preserve focus in the payment selector');
    assert.equal(filter.value, 'online');
    assert.equal(filter.options.length, filterOptions.length);
    filterOptions.forEach((option, index) => assert.equal(filter.options[index], option, 'Do not replace unchanged filter options'));
    paymentOptions.forEach((option, index) => assert.equal(node('paymentType').options[index], option, 'Do not replace unchanged sale payment options'));
  };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await w.fixture.refreshCloudStateSilently();
    verifyStableOptions();
  }
  remote.updatedAt = '2026-09-24T12:01:00Z';
  await w.fixture.refreshCloudStateSilently();
  verifyStableOptions();
  remote.sales.push(sale('New remote cash customer', 100010));
  remote.updatedAt = '2026-09-24T12:02:00Z';
  await w.fixture.refreshCloudStateSilently();
  verifyStableOptions();
  assert.equal(node('reportSalesTotal').textContent, '9');
  assert.equal(node('reportPaidTotal').textContent, '175');
  assert.equal(node('salesSearchCount').textContent, '2 sales found');
  assert.deepEqual(resultIds(), ['Online flagged', 'Online legacy']);
  node('salesSearchOptionsBtn').click();
  const sort = node('salesSort');
  const sortOptions = [...sort.options];
  const selectedSort = sort.value;
  sort.focus();
  await w.fixture.refreshCloudStateSilently();
  assert.equal(doc.activeElement, sort);
  remote.sales[0].fullName = 'Updated remote cash customer';
  remote.updatedAt = '2026-09-24T12:03:00Z';
  await w.fixture.refreshCloudStateSilently();
  assert.equal(node('salesSort'), sort, 'Sales changes must not replace the sort dropdown');
  assert.equal(sort.isConnected, true);
  assert.equal(doc.activeElement, sort, 'Sales changes must not detach a focused sort dropdown');
  assert.equal(sort.value, selectedSort);
  sortOptions.forEach((option, index) => assert.equal(sort.options[index], option));
  assert.ok(requests.length >= 6);
  assert.deepEqual(errors, []);
  console.log('PASS unchanged and sales-only cloud refresh preserve payment/sort options, focus, selection, and the open menu');
  w.close();
})().catch(error => {
  console.error(error);
  w?.close();
  process.exitCode = 1;
});
