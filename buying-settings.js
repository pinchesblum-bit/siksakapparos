/* Buying website copy editor. Uses the existing settings save and confirmation flow. */
(function (root) {
  'use strict';
  const copy = root.KapparosBuyingContent;
  const rootIds = {title: 'settingBuyingTitle', subtitle: 'settingBuyingSubtitle', buttonText: 'settingBuyingButtonText', confirmationText: 'settingBuyingConfirmationText'};
  function control(field) { return document.getElementById(rootIds[field.key] || 'buyingCopy-' + field.key); }
  function mount() {
    const container = document.getElementById('buyingContentFields');
    if (!container || container.childElementCount) return;
    let previous = '', grid;
    for (const field of copy.fields.filter(field => !field.root)) {
      if (field.group !== previous) {
        const section = document.createElement('div'); section.className = 'settings-section';
        const heading = document.createElement('h3'); heading.textContent = field.group;
        grid = document.createElement('div'); grid.className = 'settings-grid';
        section.append(heading, grid); container.append(section); previous = field.group;
      }
      const wrap = document.createElement('div'); wrap.className = 'field' + (field.max >= 500 ? ' full' : '');
      const label = document.createElement('label'); label.htmlFor = 'buyingCopy-' + field.key; label.textContent = field.label;
      const input = document.createElement(field.max >= 500 ? 'textarea' : 'input');
      input.id = label.htmlFor; input.maxLength = field.max; input.dir = 'auto';
      if (field.max >= 500) input.rows = 3;
      if (field.key === 'phoneNumber') input.type = 'tel';
      wrap.append(label, input); grid.append(wrap);
    }
    for (const field of copy.fields) {
      const input = control(field); input.maxLength = field.max; input.dir = 'auto';
    }
  }
  function fill(settings) {
    mount();
    const source = copy.source(settings);
    for (const field of copy.fields) if (!field.root) control(field).value = source[field.key];
    const translated = copy.english(settings);
    document.getElementById('buyingTranslationStatus').textContent = translated.missing.length
      ? 'English needs an update. Save to translate the current wording automatically.'
      : 'English is up to date. Changes to the Yiddish wording are translated when you save.';
    const preview = document.getElementById('buyingEnglishPreview'); preview.replaceChildren();
    for (const field of copy.fields) {
      const row = document.createElement('div'); row.className = 'buying-translation-row';
      const label = document.createElement('dt'); label.textContent = field.label;
      const value = document.createElement('dd'); value.dir = 'ltr';
      value.textContent = Object.hasOwn(translated.values, field.key) ? translated.values[field.key] || '—' : 'Translation pending';
      row.append(label, value); preview.append(row);
    }
  }
  function read(settings) {
    const next = {...settings, pageContent: {...(settings.pageContent || {})}};
    for (const field of copy.fields) {
      const value = control(field).value.trim().slice(0, field.max);
      if (field.root) next[field.key] = value; else next.pageContent[field.key] = value;
    }
    return next;
  }
  async function translate(settings, token) {
    const result = copy.english(settings);
    if (result.missing.length) {
      const texts = Object.fromEntries(result.missing.map(key => [key, result.source[key]]));
      const response = await fetch('https://tugsxxafeaqbqonrruqt.supabase.co/functions/v1/kapparos-buying-translate', {
        method: 'POST', headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + token},
        body: JSON.stringify({texts}), signal: AbortSignal.timeout(30000)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'English translation is unavailable.');
      for (const key of result.missing) {
        const max = copy.fields.find(field => field.key === key).max * 4;
        if (typeof data.values?.[key] !== 'string' || !data.values[key].trim() || data.values[key].length > max)
          throw new Error('English translation was incomplete. Please save again.');
        result.values[key] = data.values[key].trim();
      }
    }
    return {source: result.source, values: result.values};
  }
  root.BuyingSettingsEditor = {fill, read, translate};
})(globalThis);
