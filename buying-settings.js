/* Section-based public website editor. The host owns authentication and persistence. */
(function (root) {
  'use strict';
  const copy = root.KapparosBuyingContent;
  const presentation = root.KapparosBuyingPresentation;
  const sections = [...new Set(copy.fields.map(field => field.group))];
  const cards = new Map();
  let api = null, saving = false, connection = 'unknown';
  const make = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  function message(card, text, error = false) {
    card.message.textContent = text; card.message.classList.toggle('is-error', error);
  }
  function showIcon(element, value) {
    const icon = presentation.icon(value);
    element.replaceChildren();
    if (icon) {
      const picture = make('img', 'buying-symbol');
      picture.src = icon.path; picture.alt = ''; picture.width = 32; picture.height = 32;
      element.append(picture, make('span', 'buying-icon-name', icon.label));
    } else element.textContent = value || 'No icon';
  }
  function status() {
    const line = document.getElementById('buyingTranslationStatus');
    if (!line) return;
    line.textContent = connection === 'configured'
      ? 'A translation key is configured. Save a section to check that new wording translates successfully.'
      : connection === 'ready'
      ? 'Automatic English translation is connected. Each section translates when you save it.'
      : connection === 'missing'
        ? 'Automatic translation is not connected yet. Your Yiddish edits still save. English is shown only when its translation is up to date.'
        : 'Current translated wording is available. Check the connection below to confirm that new Yiddish edits can translate automatically.';
  }
  function mount() {
    const container = document.getElementById('buyingEditorSections');
    if (!container || cards.size) return;
    sections.forEach((group, index) => {
      const section = make('section', 'buying-editor-card'); section.dataset.buyingSection = group;
      const header = make('div', 'buying-editor-card-head');
      const title = make('h3', '', group); title.id = 'buying-editor-heading-' + index;
      section.setAttribute('aria-labelledby', title.id);
      const edit = make('button', 'secondary-btn', 'Edit'); edit.type = 'button';
      header.append(title, edit); section.append(header);
      if (group === 'Buyer terms') {
        const row = make('label', 'settings-switch-row buying-terms-switch');
        const label = make('span', '', 'Require buyers to accept the terms');
        const shell = make('span', 'toggle-switch'); const input = make('input'); input.type = 'checkbox'; input.id = 'buyingTermsEnabled';
        const track = make('span', 'toggle-slider'); track.setAttribute('aria-hidden', 'true'); shell.append(input, track); row.append(label, shell); section.append(row);
        input.addEventListener('change', () => setTermsEnabled(input.checked));
        section.append(make('p', 'settings-card-note', 'Enter your exact terms below, save, then turn this on. Each buyer must check the acceptance box before payment.'));
      }
      if (group === 'Support footer') section.append(make('p', 'settings-card-note', 'Add a phone number, an email address, or both. The help line appears at the bottom of both buying pages.'));
      const form = make('form', 'buying-editor-form');
      const grid = make('div', 'buying-editor-grid');
      const fields = copy.fields.filter(field => field.group === group), controls = new Map(), displays = new Map(), englishRows = new Map(), iconPreviews = new Map();
      let venueExtra = null;
      for (const field of fields) {
        const wrap = make('div', 'buying-editor-field' + (field.max >= 500 ? ' buying-editor-wide' : ''));
        const label = make('label', '', field.key === 'venue' ? 'Venue — line 1' : field.label); label.htmlFor = 'buyingEdit-' + field.key;
        const display = make('p', 'buying-editor-value'); display.dir = field.type === 'tel' || field.type === 'email' ? 'ltr' : 'auto';
        const input = make(field.max >= 500 ? 'textarea' : 'input', field.type === 'icon' ? 'buying-icon-input' : '');
        input.id = label.htmlFor; input.maxLength = field.max; input.required = field.required === true; input.hidden = true; input.disabled = true;
        input.dir = field.type === 'tel' || field.type === 'email' ? 'ltr' : 'auto';
        if (field.max >= 500) input.rows = field.key === 'termsText' ? 8 : 3;
        else input.type = field.type === 'tel' || field.type === 'email' ? field.type : 'text';
        if (field.type === 'icon') {
          input.setAttribute('aria-description', 'Choose a suggested icon, paste another emoji, or leave empty for no icon.');
          const choices = make('datalist'); choices.id = input.id + '-choices';
          presentation.icons.forEach(icon => { const option = make('option'); option.value = icon.value; option.label = icon.label; choices.append(option); });
          input.setAttribute('list', choices.id); wrap.append(choices);
          wrap.classList.add('buying-editor-icon-field');
        }
        wrap.append(label, display, input); grid.append(wrap); controls.set(field.key, input); displays.set(field.key, display);
        if (field.key === 'venue') {
          const extra = make('div', 'buying-editor-field');
          const extraLabel = make('label', '', 'Venue — line 2'); extraLabel.htmlFor = 'buyingEdit-venueLine2';
          const extraDisplay = make('p', 'buying-editor-value'); extraDisplay.dir = 'auto';
          const extraInput = make('input'); extraInput.id = extraLabel.htmlFor; extraInput.type = 'text'; extraInput.dir = 'auto';
          extraInput.maxLength = field.max; extraInput.hidden = true; extraInput.disabled = true;
          extra.append(extraLabel, extraDisplay, extraInput); grid.append(extra);
          venueExtra = {input: extraInput, display: extraDisplay, english: null};
          const note = make('p', 'settings-card-note buying-editor-wide', 'These lines appear at the bottom of the information box: side by side on Windows and stacked on mobile. Leave the second line empty if you only need one.');
          grid.append(note);
        }
        if (field.type === 'icon') {
          const preview = make('div', 'buying-icon-preview'); preview.hidden = true;
          preview.setAttribute('aria-label', 'Icon preview');
          input.addEventListener('input', () => showIcon(preview, input.value.trim()));
          wrap.append(preview); iconPreviews.set(field.key, preview);
        }
      }
      form.append(grid);
      const english = make('details', 'buying-english-details'); const summary = make('summary', '', 'View saved English wording'); const list = make('dl', 'buying-english-list');
      for (const field of fields.filter(field => field.translate !== false)) {
        const row = make('div', 'buying-translation-row'); const dt = make('dt', '', field.key === 'venue' ? 'Venue — line 1' : field.label), dd = make('dd'); dd.dir = 'ltr'; row.append(dt, dd); list.append(row); englishRows.set(field.key, dd);
        if (field.key === 'venue') {
          const extraRow = make('div', 'buying-translation-row'), extraValue = make('dd'); extraValue.dir = 'ltr';
          extraRow.append(make('dt', '', 'Venue — line 2'), extraValue); list.append(extraRow); venueExtra.english = extraValue;
        }
      }
      english.append(summary, list); form.append(english);
      const notice = make('p', 'settings-message buying-editor-message'); notice.setAttribute('role', 'status'); form.append(notice);
      const actions = make('div', 'settings-actions'); actions.hidden = true;
      const cancel = make('button', 'secondary-btn', 'Cancel'); cancel.type = 'button';
      const save = make('button', 'primary-btn', 'Save'); save.type = 'submit'; actions.append(cancel, save); form.append(actions); section.append(form); container.append(section);
      const card = {group, section, form, fields, controls, displays, englishRows, iconPreviews, venueExtra, edit, actions, message: notice, editing: false, busy: false}; cards.set(group, card);
      edit.addEventListener('click', () => editSection(group)); cancel.addEventListener('click', () => { setEditing(card, false); fill(api.getSettings()); message(card, ''); });
      form.addEventListener('submit', event => { event.preventDefault(); saveSection(card); });
    });
  }
  function setEditing(card, editing) {
    card.editing = editing; card.edit.hidden = editing; card.actions.hidden = !editing;
    card.controls.forEach((input, key) => { input.hidden = !editing; input.disabled = !editing || card.busy; card.displays.get(key).hidden = editing; });
    card.iconPreviews.forEach((preview, key) => { preview.hidden = !editing; showIcon(preview, card.controls.get(key).value); });
    if (card.venueExtra) { card.venueExtra.input.hidden = !editing; card.venueExtra.input.disabled = !editing || card.busy; card.venueExtra.display.hidden = editing; }
  }
  function editSection(group) {
    if (!api || saving) return;
    const card = cards.get(group); if (!card) return;
    fill(api.getSettings()); message(card, ''); setEditing(card, true);
    card.controls.values().next().value?.focus();
  }
  function fill(settings = {}) {
    mount(); const source = presentation.source(settings), translated = presentation.english(settings);
    cards.forEach(card => {
      card.fields.forEach(field => {
        if (field.key === 'venue') {
          const lines = presentation.venueLines(source.venue), englishLines = presentation.venueLines(translated.values.venue);
          if (!card.editing) { card.controls.get('venue').value = lines[0]; card.venueExtra.input.value = lines[1]; }
          card.displays.get('venue').textContent = lines[0] || 'Not shown'; card.venueExtra.display.textContent = lines[1] || 'Not shown';
          const ready = Object.hasOwn(translated.values, 'venue');
          card.englishRows.get('venue').textContent = ready ? englishLines[0] || 'Not shown' : lines[0] ? 'Translation pending' : 'Not shown';
          card.venueExtra.english.textContent = ready ? englishLines[1] || 'Not shown' : lines[1] ? 'Translation pending' : 'Not shown';
          return;
        }
        if (!card.editing) card.controls.get(field.key).value = source[field.key];
        const value = field.type === 'tel' ? copy.phone(source[field.key]).label : source[field.key];
        if (field.type === 'icon') {
          showIcon(card.displays.get(field.key), value);
          showIcon(card.iconPreviews.get(field.key), card.controls.get(field.key).value);
        } else card.displays.get(field.key).textContent = value || 'Not shown';
        if (card.englishRows.has(field.key)) card.englishRows.get(field.key).textContent = Object.hasOwn(translated.values, field.key) ? translated.values[field.key] || 'Not shown' : 'Translation pending';
      });
    });
    const toggle = document.getElementById('buyingTermsEnabled'); if (toggle) { toggle.checked = settings.termsEnabled === true; toggle.disabled = saving; }
    status();
  }
  function lock(card, busy) {
    saving = busy; card.busy = busy;
    cards.forEach(item => { item.edit.disabled = busy; item.actions.querySelectorAll('button').forEach(button => { button.disabled = busy; }); });
    card.controls.forEach(input => { input.disabled = busy || !card.editing; });
    if (card.venueExtra) card.venueExtra.input.disabled = busy || !card.editing;
    const toggle = document.getElementById('buyingTermsEnabled'); if (toggle) toggle.disabled = busy;
  }
  let lastTranslationRequest = 0;
  async function requestTranslations(texts, token) {
    // Respect the existing endpoint's per-session burst limit between line requests.
    const wait = 3100 - (Date.now() - lastTranslationRequest);
    if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
    lastTranslationRequest = Date.now();
    const response = await fetch('https://tugsxxafeaqbqonrruqt.supabase.co/functions/v1/kapparos-buying-translate', {
      method: 'POST', headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + token},
      body: JSON.stringify({texts}), signal: AbortSignal.timeout(30000)
    });
    const data = await response.json();
    if (!response.ok) {
      if (data.code === 'translation_setup_required') connection = 'missing';
      throw new Error(data.error || 'English translation is unavailable.');
    }
    connection = 'ready';
    for (const key of Object.keys(texts)) {
      const field = copy.fields.find(field => field.key === key), value = data.values?.[key];
      if (typeof value !== 'string' || !value.trim() || value.length > field.max * 4) throw new Error('English translation was incomplete. Please save again.');
    }
    return data.values;
  }
  async function translate(settings, token, fields = copy.fields) {
    const result = presentation.english(settings), keys = new Set(fields.map(field => field.key));
    const missing = result.missing.filter(key => keys.has(key));
    const pairedVenue = missing.includes('venue') && result.source.venue.includes('\n');
    const otherMissing = missing.filter(key => !pairedVenue || key !== 'venue');
    if (otherMissing.length) {
      const values = await requestTranslations(Object.fromEntries(otherMissing.map(key => [key, result.source[key]])), token);
      otherMissing.forEach(key => { result.values[key] = values[key].trim(); });
    }
    if (pairedVenue) {
      const lines = presentation.venueLines(result.source.venue), previous = settings.englishContent || {};
      const oldSources = presentation.venueLines(previous.source?.venue), oldValues = presentation.venueLines(previous.values?.venue);
      const englishLines = [];
      for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        const cached = {source: {venue: oldSources[index]}, values: {venue: oldValues[index]}};
        const known = presentation.english({pageContent: {venue: line}, englishContent: cached});
        englishLines.push(Object.hasOwn(known.values, 'venue') ? known.values.venue : (await requestTranslations({venue: line}, token)).venue.trim());
      }
      result.values.venue = englishLines.join('\n').trim();
    }
    return {source: Object.fromEntries([...keys].map(key => [key, result.source[key]])), values: Object.fromEntries([...keys].filter(key => Object.hasOwn(result.values, key)).map(key => [key, result.values[key]]))};
  }
  async function saveSection(card) {
    if (!api || saving || !card.editing || !card.form.reportValidity()) return;
    const before = api.getSettings(), next = {...before, pageContent: {...before.pageContent}}, values = {};
    for (const field of card.fields) {
      const text = field.key === 'venue'
        ? [card.controls.get('venue').value.trim(), card.venueExtra.input.value.trim()].join('\n').trim()
        : card.controls.get(field.key).value.trim();
      if (text.length > field.max) { message(card, field.key === 'venue' ? 'Keep the two Venue lines within 240 characters in total.' : 'This text is too long.', true); return; }
      values[field.key] = text;
      if (field.root) next[field.key] = text; else next.pageContent[field.key] = text;
    }
    if (card.group === 'Buyer terms' && before.termsEnabled === true && !values.termsText) { message(card, 'Turn off the terms requirement before removing the terms.', true); return; }
    for (const field of card.fields.filter(field => field.type === 'tel')) {
      if (values[field.key] && !copy.phone(values[field.key]).href) { message(card, 'Enter a valid phone number, or leave it empty.', true); card.controls.get(field.key).focus(); return; }
    }
    const old = presentation.source(before), pending = presentation.english(next).missing.some(key => card.controls.has(key));
    if (!pending && card.fields.every(field => old[field.key] === values[field.key])) { setEditing(card, false); message(card, 'No changes to save.'); return; }
    if (!(await api.confirm())) return;
    lock(card, true); message(card, 'Saving this section and updating English…');
    let english = null, warning = '';
    try {
      try { english = await translate(next, api.token(), card.fields); }
      catch (error) { warning = error.message || 'English translation is unavailable.'; }
      await api.saveSection(values, english);
      setEditing(card, false); fill(api.getSettings());
      message(card, warning ? 'Yiddish saved. ' + warning + ' English for this section is pending.' : 'This section and its English wording are saved.', Boolean(warning));
    } catch (error) { message(card, error.message || 'This section could not be saved. Please try again.', true); }
    finally { lock(card, false); status(); }
  }
  async function setTermsEnabled(enabled) {
    const card = cards.get('Buyer terms'), toggle = document.getElementById('buyingTermsEnabled');
    const current = api.getSettings(); toggle.checked = current.termsEnabled === true;
    if (saving || enabled === toggle.checked) return;
    if (enabled && !presentation.source(current).termsText) { editSection('Buyer terms'); card.controls.get('termsText').focus(); message(card, 'Enter and save your terms, then turn on the requirement.', true); return; }
    if (!(await api.confirm())) return;
    lock(card, true);
    try { await api.saveTermsEnabled(enabled); fill(api.getSettings()); message(card, enabled ? 'Buyers must now accept your terms before payment.' : 'The terms requirement is off.'); }
    catch (error) { message(card, error.message || 'The requirement could not be saved.', true); }
    finally { lock(card, false); }
  }
  async function checkConnection() {
    const button = document.getElementById('checkBuyingTranslation'); if (!api || !button) return;
    button.disabled = true;
    try {
      const response = await fetch('https://tugsxxafeaqbqonrruqt.supabase.co/functions/v1/kapparos-buying-translate', {method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+api.token()},body:JSON.stringify({action:'status'}),signal:AbortSignal.timeout(15000)});
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Connection could not be checked.');
      connection = data.configured ? 'configured' : 'missing'; status();
    } catch (error) { document.getElementById('buyingTranslationStatus').textContent = error.message || 'Connection could not be checked. Please try again.'; }
    finally { button.disabled = false; }
  }
  function init(options) { api = options; fill(api.getSettings()); document.getElementById('checkBuyingTranslation')?.addEventListener('click', checkConnection); }
  root.BuyingSettingsEditor = {init, fill, translate, editSection, checkConnection};
})(globalThis);
