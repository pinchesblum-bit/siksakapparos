/* Public display choices only. No authentication, orders, or database access. */
(function (root) {
  'use strict';
  const copy = root.KapparosBuyingContent;
  const icons = Object.freeze([
    Object.freeze({key: 'benefitOrderIcon', value: '🔪', label: 'Shoychet knife', path: 'icons/shoychet.svg?v=20260914-8'}),
    Object.freeze({key: 'benefitPaymentIcon', value: '📖', label: 'Prayer book', path: 'icons/prayer-book.svg'}),
    Object.freeze({key: 'benefitTicketIcon', value: '💧', label: 'Mikvah', path: 'icons/mikvah.svg'})
  ]);
  function icon(value) { return icons.find(item => item.value === value) || null; }
  function venueLines(value) {
    const lines = String(value || '').replace(/\r\n?/g, '\n').split('\n');
    return [lines.shift() || '', lines.join('\n')];
  }
  function source(settings = {}) {
    const values = copy.source(settings);
    for (const item of icons) {
      if (!Object.prototype.hasOwnProperty.call(settings.pageContent || {}, item.key)) values[item.key] = item.value;
    }
    return values;
  }
  function english(settings = {}) {
    const translated = copy.english(settings), current = source(settings);
    for (const item of icons) translated.values[item.key] = translated.source[item.key] = current[item.key];
    if (current.benefitOrder === 'שוחט אויפן פלאץ' && translated.values.benefitOrder === 'Shoyched on site') {
      translated.values.benefitOrder = 'Shoychet on site';
    }
    return translated;
  }
  root.KapparosBuyingPresentation = Object.freeze({icons, icon, source, english, venueLines});
  if (typeof module !== 'undefined' && module.exports) module.exports = root.KapparosBuyingPresentation;
})(globalThis);
