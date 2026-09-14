/* Compare saved snapshots before writing. No credentials or network access. */
(function (root) {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const stable = value => JSON.stringify(value, function (_, item) {
    return item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item;
  });
  const equal = (a, b) => stable(a) === stable(b);
  const protectedKeys = new Set(['username', 'password', 'passwordHash', '_legacyPassword', '_kapparosWrite', '_kapparosSaveError']);
  function changes(base, next) {
    const previous = new Map((base.sales || []).map(sale => [String(sale.id), sale]));
    return {
      sales: (next.sales || []).filter(sale => !equal(previous.get(String(sale.id)), sale)),
      settings: Object.fromEntries(Object.entries(next.settings || {}).filter(([key, value]) => !protectedKeys.has(key) && !equal(base.settings?.[key], value)))
    };
  }
  function request(base, raw, next, deletedIds = [], saleBases = {}) {
    const delta = changes(base, next);
    const previous = new Map((raw.sales || []).map(sale => [String(sale.id), sale]));
    const ids = [...new Set([...delta.sales.map(sale => String(sale.id)), ...deletedIds.map(String)])];
    return {
      sales: delta.sales,
      settings: {...delta.settings, _kapparosWrite: {
        version: 1,
        saleBases: Object.fromEntries(ids.map(id => [id, Object.hasOwn(saleBases, id) ? saleBases[id] : previous.get(id) || null])),
        settingsBases: Object.fromEntries(Object.keys(delta.settings).map(key => [key, {
          present: Object.hasOwn(raw.settings || {}, key), value: raw.settings?.[key] ?? null
        }]))
      }},
      deletedSaleIds: deletedIds
    };
  }
  // Preserve edits made while a request was running, and keep remote-only sales.
  function rebase(saved, submitted, current, deletedIds = []) {
    const delta = changes(submitted, current);
    const updates = new Map(delta.sales.map(sale => [String(sale.id), sale]));
    const deleted = new Set(deletedIds.map(String));
    const sales = (saved.sales || []).filter(sale => !deleted.has(String(sale.id))).map(sale => {
      const id = String(sale.id), updated = updates.get(id); updates.delete(id);
      return updated ? {...updated, ticketId: sale.ticketId} : sale;
    });
    for (const [id, sale] of updates) if (!deleted.has(id)) sales.push(sale);
    return {sales, settings: {...saved.settings, ...delta.settings}};
  }
  const api = {clone, equal, changes, request, rebase};
  root.KapparosAdminSync = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
