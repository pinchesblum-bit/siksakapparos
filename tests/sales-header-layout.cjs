// Structural/cascade checks only: JSDOM does not perform browser layout.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('./admin-sync/node_modules/jsdom');

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const source = new JSDOM(html);
const header = source.window.document.querySelector('#salesPage .table-head').outerHTML;
const styles = [...source.window.document.styleSheets].flatMap(sheet => [...sheet.cssRules]);

function activeCss(rules, width) {
  return rules.map(rule => {
    if (rule.type === source.window.CSSRule.MEDIA_RULE) {
      const min = /\(min-width:\s*(\d+)px\)/.exec(rule.conditionText);
      const max = /\(max-width:\s*(\d+)px\)/.exec(rule.conditionText);
      const matches = Boolean(min || max)
        && (!min || width >= Number(min[1]))
        && (!max || width <= Number(max[1]));
      return matches ? activeCss([...rule.cssRules], width) : '';
    }
    return rule.cssText;
  }).join('\n');
}

function fixture(width) {
  const dom = new JSDOM('<!doctype html><html><head><style>' + activeCss(styles, width)
    + '</style></head><body><main class="app-shell"><section class="page active" id="salesPage"><div class="panel">'
    + header + '<div class="sales-table-wrap"><table class="sales-table"><tbody><tr><td><span class="sale-contact"><span>8455551234</span></span></td></tr></tbody></table></div>'
    + '</div></section></main></body></html>', {pretendToBeVisual: true});
  const document = dom.window.document;
  return {dom, document, style: selector => dom.window.getComputedStyle(document.querySelector(selector))};
}

for (const width of [320, 360, 390, 640, 641, 700, 760, 768, 820, 1024, 1100, 1101, 1280]) {
  const {dom, document, style} = fixture(width);
  const expectedAreas = width <= 640 ? '"summary" "search" "actions"'
    : width <= 1100 ? '"summary summary" "search actions"' : '"summary search actions"';
  assert.equal(style('.table-head').gridTemplateAreas, expectedAreas, `${width}px breakpoint`);
  assert.equal(style('.sales-summary').gridArea, 'summary');
  assert.equal(style('.sales-tools').gridArea, 'search');
  assert.equal(style('.sales-head-actions').gridArea, 'actions');
  assert.equal(style('.sales-tools').minWidth, '0');
  assert.equal(style('.sales-head-actions').minWidth, '0');
  assert.equal(style('.ticket-scanner').minWidth, '0');
  assert.equal(style('.sales-search').minWidth, '0');
  assert.equal(style('.table-add-sale').whiteSpace, 'nowrap');
  assert.notEqual(style('#addSaleBtn .desktop-word').display, 'none', 'Add remains visible on phones');
  for (const id of ['salesSearch', 'salesSearchOptionsBtn', 'salesPaymentFilterMenu', 'salesPaymentFilter', 'ticketScanner', 'addSaleBtn', 'salesSortControl']) {
    assert.equal(document.querySelectorAll(`#${id}`).length, 1, `${id} remains unique`);
  }
  for (const id of ['salesSearch', 'ticketScanner', 'addSaleBtn']) {
    assert.notEqual(style(`#${id}`).display, 'none', `${width}px ${id} remains visible`);
    assert.equal(style(`#${id}`).height, '44px', `${width}px controls align`);
  }
  assert.equal(document.querySelector('#ticketScanner').dir, 'ltr');
  assert.equal(document.querySelector('#salesSummaryTotals').dir, 'rtl');
  assert.equal(document.querySelector('#salesSortStorage').hidden, true);
  assert.equal(document.querySelector('#salesSearchOptionsBtn').getAttribute('aria-controls'), 'salesPaymentFilterMenu');

  const count = document.querySelector('#salesSearchCount');
  assert.equal(style('#salesSearchCount').minHeight, '18px');
  assert.equal(style('#salesSearchCount').display, 'block');
  assert.equal(style('#salesSearchCount').visibility, 'hidden');
  count.hidden = false;
  count.textContent = '12345 sales found';
  assert.equal(style('#salesSearchCount').minHeight, '18px');
  assert.equal(style('#salesSearchCount').visibility, 'visible');
  assert.equal(style('#salesSearchCount').overflowWrap, 'anywhere');

  document.querySelector('#salesSummaryTotals').hidden = false;
  document.querySelector('#salesSummaryValue').textContent = '1234567';
  document.querySelector('#salesCompletedValue').textContent = '1234567';
  assert.equal(style('#salesSummaryTotals').flexWrap, 'wrap', 'Long summary may wrap, never force the toolbar wider');
  if (width <= 760) assert.equal(style('#salesSummaryTotals').width, '100%');
  else assert.equal(style('#salesSummaryTotals').maxWidth, '100%');
  assert.equal(style('#salesSummaryTotals').minHeight, '44px');
  assert.notEqual(style('#salesSummaryTotals').height, '44px', 'Summary is not clipped to a fixed height');

  document.querySelector('#ticketScanner').hidden = true;
  assert.equal(style('.sales-head-actions').gridTemplateColumns, 'minmax(0, 1fr)', `${width}px scanner-hidden layout`);
  assert.notEqual(style('#addSaleBtn').display, 'none');
  if (width <= 640) assert.equal(style('#salesSearch').fontSize, '16px', 'Phone inputs avoid focus zoom');

  if (width >= 641 && width <= 1100) {
    assert.equal(style('.sales-table-wrap').overflowX, 'hidden', `${width}px tablet table does not scroll sideways`);
    assert.equal(style('.sales-table').minWidth, '100%', `${width}px tablet table fits its panel`);
    assert.equal(style('.sales-table').maxWidth, '100%', `${width}px tablet table cannot overflow its panel`);
    assert.equal(style('.sale-contact > span').textOverflow, 'ellipsis', `${width}px long contact text is clipped cleanly`);
  }

  dom.window.close();
  console.log(`PASS ${width}px Sales toolbar: grid, controls, count, summary, RTL and scanner-hidden cascade`);
}
source.window.close();
console.log('13 structural responsive checks passed. Browser geometry and screenshots are not covered by this test.');
