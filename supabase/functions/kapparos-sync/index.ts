const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ALLOWED_ORIGINS = new Set([
  'https://pinchesblum-bit.github.io',
]);
const DEFAULT_PASSWORD_HASH = '2a00ac564b31afd7eaab2c9e59f81e386dc6ad673c8f8d000e6de3d37f9a3a94';
const SESSION_DAYS = 30;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';
const RESEND_FROM_ADDRESS = 'no-reply@siksakapparos.org';

function corsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://pinchesblum-bit.github.io',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    'Vary': 'Origin',
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(req) });
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function db(path: string, init: RequestInit = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers || {}),
    },
  });
  if (!response.ok) throw new Error(`Database request failed (${response.status})`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function defaultSettings() {
  return {
    title: 'פנים מאירות סיקסא', subtitle: 'כפרות', showNeedsSavedOnHome: false,
    homeSummaryLabel: 'Needs to Be Saved', homeSummaryScope: 'paid', defaultPrice: 23,
    inventory: 100, username: 'admin', passwordHash: DEFAULT_PASSWORD_HASH, customFields: [],
    reportLabels: { chickens: 'Amount of Chickens', paid: 'Amount of Paid', reserved: 'Amount of Reserved', needsReserved: 'Needs to Be Reserved', needsSaved: 'Needs to Be Saved' },
    paymentMethods: [
      { id: 'cash', label: 'Cash' }, { id: 'credit', label: 'Credit card' },
      { id: 'other', label: 'Other', needsDetails: true }, { id: 'banshak', label: 'בנש״ק' },
    ],
    paymentPlans: [
      { id: 'pay-on', label: 'Pay on', needsDate: true },
      { id: 'erev-yom-kippur', label: 'Erev Yom Kippur', needsDate: false },
    ],
  };
}

function sanitizeIncomingSettings(value: unknown, current: Record<string, unknown>) {
  const incoming = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const { password, passwordHash, _legacyPassword, ...safe } = incoming;
  const settings = { ...current, ...safe, username: current.username, passwordHash: current.passwordHash };
  const now = new Date().toISOString();
  return normalizeChickenPurchaseSettings(settings, now.slice(0, 10), now);
}

function normalizeChickenPurchaseSettings(settings: any, date: string, now: string) {
  const expenseId = 'auto-chicken-inventory-cost';
  const inventory = Math.max(0, Math.floor(Number(settings.inventory) || 0));
  const costCents = Math.max(0, Math.round((Number(settings.chickenPurchaseCost) || 0) * 100));
  const cost = costCents / 100;
  const amount = inventory * costCents / 100;
  const expenses = Array.isArray(settings.accountingExpenses) ? settings.accountingExpenses : [];
  const existing = expenses.find((expense: any) => expense.id === expenseId);
  if (!existing && !(amount > 0)) return settings;

  // Dates remain available for the calendar; quantities and rates match Settings.
  let remaining = inventory;
  const batches: any[] = [];
  for (const batch of (Array.isArray(settings.chickenPurchaseBatches) ? settings.chickenPurchaseBatches : [])) {
    if (!batch) continue;
    const quantity = Math.min(remaining, Math.max(0, Math.floor(Number(batch.quantity) || 0)));
    if (!quantity) continue;
    batches.push({ ...batch, quantity, unitCost: cost });
    remaining -= quantity;
  }
  if (remaining > 0) batches.push({ quantity: remaining, unitCost: cost, date, createdAt: now });
  settings.chickenPurchaseBatches = batches;
  settings.chickenInventoryRecorded = inventory;
  const name = String(settings.chickenExpenseName || 'Chickens').trim() || 'Chickens';
  if (existing) {
    if (existing.name !== name || existing.amount !== amount) {
      existing.name = name;
      existing.amount = amount;
      existing.updatedAt = now;
    }
  } else {
    expenses.push({
      id: expenseId, name, amount,
      date: batches[0]?.date || date, category: 'Inventory', note: '',
      paid: false,
      order: expenses.reduce((maximum: number, item: any) => Math.max(maximum, Number(item.order || 0)), -1) + 1,
      createdAt: batches[0]?.createdAt || now, updatedAt: ''
    });
  }
  settings.accountingExpenses = expenses;
  return settings;
}

function publicState(row: any) {
  const { password, passwordHash, _legacyPassword, ...settings } = row.settings || {};
  return { sales: Array.isArray(row.sales) ? row.sales : [], settings, updatedAt: row.updated_at };
}

function mergeSales(remote: any[], local: any[]) {
  const merged = new Map<string, any>();
  for (const sale of [...remote, ...local]) {
    if (!sale || !sale.id) continue;
    const existing = merged.get(String(sale.id));
    const existingTime = Date.parse(existing?.updatedAt || existing?.createdAt || '') || 0;
    const saleTime = Date.parse(sale.updatedAt || sale.createdAt || '') || 0;
    if (!existing || saleTime >= existingTime) merged.set(String(sale.id), sale);
  }
  return Array.from(merged.values());
}

async function getState() {
  const rows = await db('kapparos_app_state?id=eq.main&select=*');
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function saveState(sales: any[], settings: Record<string, unknown>) {
  const rows = await db('kapparos_app_state?on_conflict=id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({ id: 'main', sales, settings, updated_at: new Date().toISOString() }),
  });
  return rows[0];
}

async function requireSession(req: Request) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const hash = await sha256(token);
  const rows = await db(`kapparos_sessions?token_hash=eq.${hash}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=token_hash`);
  return Array.isArray(rows) && rows[0] ? { token, hash } : null;
}


function escapeEmailHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

function ticketText(delivery: any, key: string, fallback: string, max = 4000) {
  return typeof delivery?.[key] === 'string' ? delivery[key].slice(0, max) : fallback;
}

function ticketBoolean(delivery: any, key: string, fallback: boolean) {
  return typeof delivery?.[key] === 'boolean' ? delivery[key] : fallback;
}

function ticketColor(delivery: any, key: string, fallback: string) {
  const value = String(delivery?.[key] || '');
  return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function ticketSize(delivery: any, key: string, fallback: number, min: number, max: number) {
  const value = Number(delivery?.[key]);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function fillTicketTemplate(template: string, values: Record<string, unknown>) {
  return template.replace(/\{([a-z_]+)\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key] ?? '') : match);
}

async function deliverTicketEmail(sale: any, settings: any, pdfBase64: string, recipientOverride = '') {
  if (!RESEND_API_KEY) {
    throw new Error('Professional email delivery is not configured.');
  }
  const recipient = String(recipientOverride || sale.email || '').trim();
  if (!validEmail(recipient)) throw new Error('Add a valid email address to this sale first.');
  if (!pdfBase64 || pdfBase64.length > 8_000_000 || !/^[A-Za-z0-9+/=]+$/.test(pdfBase64)) {
    throw new Error('The ticket PDF could not be prepared.');
  }

  const ticketId = String(sale.ticketId || '').replace(/\D/g, '').slice(0, 10);
  if (!ticketId) throw new Error('This sale does not have a valid ticket number.');

  const paymentMethods = Array.isArray(settings?.paymentMethods) ? settings.paymentMethods : [];
  const paymentPlans = Array.isArray(settings?.paymentPlans) ? settings.paymentPlans : [];
  const usesPlan = ['reserved', 'expired'].includes(String(sale.status || 'paid'));
  const options = usesPlan ? paymentPlans : paymentMethods;
  const selectedId = usesPlan ? sale.plannedPaymentType : sale.paymentType;
  const payment = options.find((item: any) => String(item?.id) === String(selectedId))?.label || selectedId || 'Not selected';
  const quantityNumber = Math.max(0, Math.floor(Number(sale.quantity) || 0));
  const totalPaidNumber = Number.isFinite(Number(sale.price)) ? Math.max(0, Number(sale.price)) : 0;
  const configuredUnitPrice = Number(settings?.defaultPrice);
  const unitPriceNumber = quantityNumber > 0 && totalPaidNumber > 0
    ? totalPaidNumber / quantityNumber
    : (Number.isFinite(configuredUnitPrice) ? Math.max(0, configuredUnitPrice) : 0);
  const money = (amount: number) => '$' + amount.toFixed(2);
  const totalPaid = money(totalPaidNumber);
  const unitPrice = money(unitPriceNumber);
  const paymentStatus = String(sale.status || 'paid') === 'paid' ? 'Paid' : String(sale.status || '—');
  const cleanPhone = String(sale.phone || '').replace(/\D/g, '').slice(-10);
  const phoneDisplay = cleanPhone.length === 10
    ? `(${cleanPhone.slice(0, 3)}) ${cleanPhone.slice(3, 6)}-${cleanPhone.slice(6)}`
    : (sale.phone || '—');

  const title = String(settings?.title || 'פנים מאירות סיקסא');
  const subtitle = String(settings?.subtitle || 'כפרות').trim();
  const brandName = [title, subtitle].filter(Boolean).join(' ');
  const delivery = settings?.ticketDelivery || {};
  const values = {
    name: sale.fullName || '—',
    ticket_id: ticketId,
    order_number: ticketId,
    quantity: quantityNumber,
    phone: phoneDisplay,
    payment_method: payment,
    payment_status: paymentStatus,
    unit_price: unitPrice,
    price_paid: totalPaid,
    title,
    subtitle,
    brand: brandName,
  };

  const subjectTemplate = ticketText(delivery, 'emailSubject', 'Your Cappores order confirmation — #{ticket_id}', 200);
  const subject = fillTicketTemplate(subjectTemplate, values).replace(/[\r\n]+/g, ' ').trim();
  const senderName = fillTicketTemplate(ticketText(delivery, 'emailSender', 'Cappores Tickets', 120), values).replace(/[\r\n]+/g, ' ').trim() || 'Cappores Tickets';
  const savedEmailMessage = fillTicketTemplate(
    ticketText(delivery, 'emailMessage', 'Hello {name},\n\nHere are the details of your order.'),
    values
  );
  const legacyEmailMessage = /thank you for choosing|please present the barcode|גמר חתימה טובה/i.test(savedEmailMessage);
  const emailMessage = (legacyEmailMessage
    ? `Hello ${String(values.name)},\n\nHere are the details of your order.`
    : savedEmailMessage.replace(/^\s*גמר חתימה טובה\s*$/gim, '').trim());
  const background = ticketColor(delivery, 'emailBackgroundColor', '#f5f3ee');
  const card = ticketColor(delivery, 'emailCardColor', '#fffdf8');
  const accent = ticketColor(delivery, 'emailAccentColor', '#173f36');
  const textColor = ticketColor(delivery, 'emailTextColor', '#203c36');
  const muted = ticketColor(delivery, 'emailMutedColor', '#68716b');
  const fontSize = ticketSize(delivery, 'emailFontSize', 16, 12, 24);
  const showDetails = ticketBoolean(delivery, 'emailShowDetails', true);
  const showMessage = ticketBoolean(delivery, 'emailShowMessage', true);
  const pickupMessage = 'Please present the attached PDF ticket when picking up your cappores.';
  const pickupAlternative = "If you do not have the ticket, you may use your name or order ID instead.";

  const orderNumberLabel = fillTicketTemplate(ticketText(delivery, 'orderNumberLabel', 'Order number', 80), values);
  const nameLabel = fillTicketTemplate(ticketText(delivery, 'nameLabel', 'Customer name', 80), values);
  const phoneLabel = fillTicketTemplate(ticketText(delivery, 'phoneLabel', 'Phone number', 80), values);
  const quantityLabel = fillTicketTemplate(ticketText(delivery, 'quantityLabel', 'Amount of chickens', 80), values);
  const unitPriceLabel = fillTicketTemplate(ticketText(delivery, 'unitPriceLabel', 'Price per chicken', 80), values);
  const priceLabel = fillTicketTemplate(ticketText(delivery, 'priceLabel', 'Total paid', 80), values);
  const statusLabel = fillTicketTemplate(ticketText(delivery, 'paymentStatusLabel', 'Payment status', 80), values);
  const paymentLabel = fillTicketTemplate(ticketText(delivery, 'paymentLabel', 'Payment method', 80), values);
  const rows: Array<[string, unknown, boolean?]> = [
    [orderNumberLabel, '#' + ticketId],
    [nameLabel, sale.fullName || '—'],
    [phoneLabel, phoneDisplay],
    [quantityLabel, quantityNumber],
    [unitPriceLabel, unitPrice],
    [priceLabel, totalPaid],
    [statusLabel, paymentStatus, true],
    [paymentLabel, payment],
  ];
  const detailsHtml = rows.map(([label, value, isStatus], index) => {
    const border = index === rows.length - 1 ? '' : 'border-bottom:1px solid #ded4bf;';
    const valueHtml = isStatus
      ? `<span style="display:inline-block;padding:5px 12px;border-radius:999px;background:#e1eee8;color:${accent};font-weight:700">${escapeEmailHtml(value)}</span>`
      : escapeEmailHtml(value);
    return `<tr>
      <td style="padding:12px 14px;${border}color:${muted};text-align:left">${escapeEmailHtml(label)}</td>
      <td dir="auto" style="padding:12px 14px;${border}font-weight:700;text-align:right;color:${textColor}">${valueHtml}</td>
    </tr>`;
  }).join('');

  const plainText = [
    'Cappores Center',
    'Congregation Punim Meiros Siksa',
    '',
    emailMessage,
    '',
    'ORDER DETAILS',
    `${orderNumberLabel}: #${ticketId}`,
    `${nameLabel}: ${sale.fullName || '—'}`,
    `${phoneLabel}: ${phoneDisplay}`,
    `${quantityLabel}: ${quantityNumber}`,
    `${unitPriceLabel}: ${unitPrice}`,
    `${priceLabel}: ${totalPaid}`,
    `${statusLabel}: ${paymentStatus}`,
    `${paymentLabel}: ${payment}`,
    '',
    pickupMessage,
    `(${pickupAlternative})`,
    '',
    'גמר חתימה טובה',
    '',
    'https://siksakapparos.org/'
  ].filter(value => value !== null && value !== undefined).join('\n');

  const html = `<!doctype html>
  <html lang="en" dir="ltr">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <meta name="x-apple-disable-message-reformatting">
      <title>${escapeEmailHtml(subject)}</title>
    </head>
    <body style="margin:0;padding:0;background:${background};font-family:Arial,'Noto Sans Hebrew',sans-serif;color:${textColor};font-size:${fontSize}px">
      <div style="display:none;max-height:0;overflow:hidden;opacity:0">Your Cappores order is confirmed. Ticket #${escapeEmailHtml(ticketId)}.</div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:${background};border-collapse:collapse">
        <tr>
          <td align="center" style="padding:24px 10px">
            <table role="presentation" width="620" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:620px;background:${card};border:1px solid #c8b78f;border-collapse:separate;border-spacing:0">
              <tr>
                <td dir="ltr" style="padding:24px 34px 4px;text-align:right;color:${muted};font-size:18px">B&quot;H</td>
              </tr>
              <tr>
                <td align="center" style="padding:0 30px">
                  <img src="https://siksakapparos.org/favicon.png" width="128" height="128" alt="Cappores chicken" style="display:block;width:128px;height:128px;margin:0 auto;border:0">
                  <h1 style="margin:4px 0 8px;color:${accent};font-size:46px;line-height:1.08;font-weight:800;text-align:center">Cappores Center</h1>
                  <div style="color:${accent};font-size:23px;line-height:1.4;font-weight:600;text-align:center">Congregation Punim Meiros Siksa</div>
                  ${showMessage && emailMessage ? `<div dir="auto" style="margin:22px 4px 24px;text-align:center;color:${muted};line-height:1.6;white-space:pre-wrap">${escapeEmailHtml(emailMessage)}</div>` : '<div style="height:24px;line-height:24px">&nbsp;</div>'}
                </td>
              </tr>

              ${showDetails ? `<tr>
                <td dir="ltr" style="padding:0 30px 26px">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border:1px solid #d2c29f;border-collapse:separate;border-spacing:0;border-radius:14px;overflow:hidden;background:#fffefb">
                    <tr><td colspan="2" style="padding:17px 14px;background:${accent};color:#ffffff;text-align:center;font-size:23px;font-weight:700">Order Details</td></tr>
                    ${detailsHtml}
                  </table>
                </td>
              </tr>` : ''}

              <tr>
                <td dir="ltr" align="center" style="padding:2px 40px 28px;text-align:center">
                  <div style="color:${textColor};font-size:18px;line-height:1.55;font-weight:700">${escapeEmailHtml(pickupMessage)}</div>
                  <div style="margin-top:8px;color:${muted};font-size:15px;line-height:1.55">(${escapeEmailHtml(pickupAlternative)})</div>
                </td>
              </tr>

              <tr>
                <td align="center" style="padding:0 30px 30px">
                  <a href="https://siksakapparos.org/" style="display:inline-block;padding:13px 24px;background:${accent};color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700" dir="ltr">Visit our website</a>
                </td>
              </tr>

              <tr>
                <td dir="rtl" align="center" style="padding:25px 20px;background:${accent};color:#ffffff;text-align:center;font-size:32px;line-height:1.25;font-weight:800">גמר חתימה טובה</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>`;

  const safeSenderName = senderName.replace(/[<>\r\n]/g, '').trim() || 'Cappores Tickets';
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${safeSenderName} <${RESEND_FROM_ADDRESS}>`,
      to: [recipient],
      subject,
      html,
      text: plainText,
      attachments: [{ filename: `cappores-ticket-${ticketId}.pdf`, content: pdfBase64 }],
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (response.ok) return { ...payload, provider: 'resend' };
  const resendError = String(payload?.message || payload?.error || 'The ticket email could not be sent.');
  if (/domain|sender|from/i.test(resendError)) {
    throw new Error('The Cappores email domain is not ready for sending.');
  }
  throw new Error(resendError);
}

function mergeConcurrentSales(currentValue: unknown, incomingValue: unknown, knownValue: unknown) {
  const current = Array.isArray(currentValue) ? currentValue : [];
  if (!Array.isArray(incomingValue)) return current;
  const incoming = incomingValue;
  const hasKnownList = Array.isArray(knownValue);
  const known = new Set(hasKnownList ? knownValue.map(String) : []);
  const incomingIds = new Set(incoming.map((sale: any) => String(sale?.id || '')).filter(Boolean));
  const unseen = current.filter((sale: any) => {
    const id = String(sale?.id || '');
    if (!id || incomingIds.has(id)) return false;
    return hasKnownList ? !known.has(id) : sale?.isOnlineSale === true;
  });
  return [...incoming, ...unseen];
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405);
  const origin = req.headers.get('origin') || '';
  if (!ALLOWED_ORIGINS.has(origin)) return json(req, { error: 'Origin not allowed' }, 403);

  try {
    const body = await req.json();
    const action = String(body.action || '');

    if (action === 'login') {
      let row = await getState();
      if (!row) {
        const initial = defaultSettings();
        const localSettings = body.localSettings && typeof body.localSettings === 'object' ? body.localSettings : {};
        const { password, _legacyPassword, ...safeLocal } = localSettings;
        Object.assign(initial, safeLocal);
        initial.passwordHash = typeof localSettings.passwordHash === 'string' ? localSettings.passwordHash : DEFAULT_PASSWORD_HASH;
        row = await saveState(Array.isArray(body.localSales) ? body.localSales : [], initial);
      }
      const enteredHash = await sha256(String(body.password || ''));
      const settings = row.settings || defaultSettings();
      const passwordMatches = enteredHash === settings.passwordHash || String(body.password || '') === settings._legacyPassword;
      if (String(body.username || '').trim() !== String(settings.username || '') || !passwordMatches) {
        return json(req, { error: 'Incorrect username or password.' }, 401);
      }
      if (body.importLocal && Array.isArray(body.localSales) && body.localSales.length) {
        const merged = mergeSales(Array.isArray(row.sales) ? row.sales : [], body.localSales);
        if (merged.length !== (row.sales || []).length) row = await db('rpc/kapparos_save_admin_state', {
          method: 'POST', body: JSON.stringify({ p_sales: merged, p_settings: settings, p_deleted_sale_ids: [] })
        });
      }
      const token = randomToken();
      const tokenHash = await sha256(token);
      const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
      await db('kapparos_sessions', { method: 'POST', body: JSON.stringify({ token_hash: tokenHash, expires_at: expires }) });
      return json(req, { token, ...publicState(row) });
    }

    const session = await requireSession(req);
    if (!session) return json(req, { error: 'Session expired. Please log in again.' }, 401);

    if (action === 'verify-password') {
      const current = await getState();
      if (!current) return json(req, { error: 'No data found' }, 404);
      const settings = current.settings || defaultSettings();
      const enteredPassword = String(body.password || '');
      const enteredHash = await sha256(enteredPassword);
      const passwordMatches = enteredHash === settings.passwordHash || enteredPassword === settings._legacyPassword;
      if (!passwordMatches) return json(req, { error: 'The password is incorrect.' }, 403);
      return json(req, { ok: true });
    }

    if (action === 'send-ticket') {
      const current = await getState();
      if (!current) return json(req, { error: 'No data found' }, 404);
      const saleId = String(body.saleId || '');
      const sale = Array.isArray(current.sales)
        ? current.sales.find((item: any) => String(item?.id) === saleId)
        : null;
      if (!sale) return json(req, { error: 'Sale not found' }, 404);
      if (String(sale.status || 'paid') !== 'paid') {
        return json(req, { error: 'Tickets are available only after a sale is paid.' }, 400);
      }
      if (current.settings?.printTicketsEnabled === false) return json(req, { error: 'Tickets are currently disabled.' }, 409);
      try {
        const email = await deliverTicketEmail(sale, current.settings || {}, String(body.pdfBase64 || ''), String(body.recipient || ''));
        return json(req, { ok: true, emailId: email?.id || '' });
      } catch (error) {
        return json(req, { error: error instanceof Error ? error.message : 'The ticket email could not be sent.' }, 502);
      }
    }

    if (action === 'get') {
      const row = await getState();
      return row ? json(req, publicState(row)) : json(req, { error: 'No data found' }, 404);
    }

    if (action === 'save') {
      const current = await getState();
      if (!current) return json(req, { error: 'No data found' }, 404);
      const settings = sanitizeIncomingSettings(body.settings, current.settings || defaultSettings());
      const incomingSales = Array.isArray(body.sales) ? body.sales : [];
      const incomingIds = new Set(incomingSales.map((sale: any) => String(sale?.id || '')).filter(Boolean));
      const legacyDeletedIds = Array.isArray(body.knownSaleIds)
        ? body.knownSaleIds.map(String).filter((id: string) => id && !incomingIds.has(id))
        : [];
      const saved = await db('rpc/kapparos_save_admin_state', {
        method: 'POST',
        body: JSON.stringify({
          p_sales: incomingSales,
          p_settings: settings,
          p_deleted_sale_ids: Array.isArray(body.deletedSaleIds) ? body.deletedSaleIds : legacyDeletedIds
        })
      });
      return json(req, publicState(saved));
    }

    if (action === 'credentials') {
      const current = await getState();
      if (!current) return json(req, { error: 'No data found' }, 404);
      const settings = current.settings || defaultSettings();
      const currentHash = await sha256(String(body.currentPassword || ''));
      const currentMatches = currentHash === settings.passwordHash || String(body.currentPassword || '') === settings._legacyPassword;
      if (!currentMatches) return json(req, { error: 'The current password is incorrect.' }, 401);
      const nextUsername = String(body.username || '').trim();
      if (!nextUsername) return json(req, { error: 'Username is required.' }, 400);
      settings.username = nextUsername;
      if (body.newPassword) settings.passwordHash = await sha256(String(body.newPassword));
      delete settings._legacyPassword;
      const row = await db('rpc/kapparos_save_admin_state', {
        method: 'POST', body: JSON.stringify({ p_sales: current.sales || [], p_settings: settings, p_deleted_sale_ids: [] })
      });
      await db(`kapparos_sessions?token_hash=neq.${session.hash}`, { method: 'DELETE' });
      return json(req, publicState(row));
    }

    if (action === 'logout') {
      await db(`kapparos_sessions?token_hash=eq.${session.hash}`, { method: 'DELETE' });
      return json(req, { ok: true });
    }

    return json(req, { error: 'Unknown action' }, 400);
  } catch (error) {
    console.error(error);
    return json(req, { error: 'The online database is temporarily unavailable.' }, 500);
  }
});
