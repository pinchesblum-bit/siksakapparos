const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {JSDOM} = require('./admin-sync/node_modules/jsdom');

const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
function source(name) {
  const start = html.search(new RegExp('    (?:async )?function ' + name + '\\('));
  assert.ok(start >= 0, name);
  return html.slice(start, html.indexOf('\n    }', start) + 6);
}

const dom = new JSDOM('<!doctype html>');
const env = vm.createContext({
  DOMParser: dom.window.DOMParser,
  TextEncoder,
  Uint8Array,
  Uint32Array,
  DataView
});
vm.runInContext(['xmlEscape', 'xlsxColumnName', 'xlsxZip', 'spreadsheetXmlToXlsx'].map(source).join('\n'), env);

const spreadsheet = `<?xml version="1.0" encoding="UTF-8"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="Sales"><Table><Column ss:Width="100"/><Row><Cell ss:StyleID="Header"><Data ss:Type="String">Full Name</Data></Cell><Cell><Data ss:Type="String">כפרות</Data></Cell></Row><Row><Cell><Data ss:Type="String">Tablet Test</Data></Cell><Cell ss:StyleID="Integer"><Data ss:Type="Number">3</Data></Cell></Row></Table></Worksheet>
  <Worksheet ss:Name="Accounting"><Table><Row><Cell ss:StyleID="Currency"><Data ss:Type="Number">13.5</Data></Cell></Row></Table></Worksheet>
</Workbook>`;
const bytes = env.spreadsheetXmlToXlsx(spreadsheet);
assert.ok(bytes instanceof Uint8Array);
if (process.env.XLSX_TEST_OUTPUT) fs.writeFileSync(process.env.XLSX_TEST_OUTPUT, bytes);
assert.equal(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, true), 0x04034b50, 'A real XLSX starts with a ZIP header');

const decoder = new TextDecoder();
const entries = new Map();
let offset = 0;
while (offset + 30 <= bytes.length) {
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, bytes.byteLength - offset);
  if (view.getUint32(0, true) !== 0x04034b50) break;
  assert.equal(view.getUint16(8, true), 0, 'Workbook ZIP entries remain widely compatible and uncompressed');
  const size = view.getUint32(18, true);
  const nameLength = view.getUint16(26, true);
  const extraLength = view.getUint16(28, true);
  const nameStart = offset + 30;
  const dataStart = nameStart + nameLength + extraLength;
  const name = decoder.decode(bytes.subarray(nameStart, nameStart + nameLength));
  entries.set(name, decoder.decode(bytes.subarray(dataStart, dataStart + size)));
  offset = dataStart + size;
}

for (const name of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/styles.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']) {
  assert.ok(entries.has(name), `Missing XLSX part ${name}`);
}
assert.match(entries.get('xl/workbook.xml'), /name="Sales"/);
assert.match(entries.get('xl/workbook.xml'), /name="Accounting"/);
assert.match(entries.get('xl/worksheets/sheet1.xml'), /Tablet Test/);
assert.match(entries.get('xl/worksheets/sheet1.xml'), /כפרות/);
assert.match(html, /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
assert.match(html, /Kapures-all-data-\$\{new Date\(\)\.toISOString\(\)\.slice\(0, 10\)\}\.xlsx/);
assert.doesNotMatch(html, /Kapures-all-data-\$\{new Date\(\)\.toISOString\(\)\.slice\(0, 10\)\}\.xls`/);

dom.window.close();
console.log('PASS tablet-compatible XLSX ZIP, workbook sheets, numbers, Hebrew text, MIME type and file extension');
