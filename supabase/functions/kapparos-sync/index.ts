import nodemailer from 'npm:nodemailer@10.0.1';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ALLOWED_ORIGINS = new Set([
  'https://pinchesblum-bit.github.io',
]);
const DEFAULT_PASSWORD_HASH = '2a00ac564b31afd7eaab2c9e59f81e386dc6ad673c8f8d000e6de3d37f9a3a94';
const SESSION_DAYS = 30;
const GMAIL_USER = (Deno.env.get('GMAIL_USER') || '').trim().toLowerCase();
const GMAIL_APP_PASSWORD = (Deno.env.get('GMAIL_APP_PASSWORD') || '').replace(/\s+/g, '');
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';
const RESEND_FALLBACK_FROM = 'Kapparos Tickets <onboarding@resend.dev>';

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
  return { ...current, ...safe, username: current.username, passwordHash: current.passwordHash };
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

async function getResendSender() {
  try {
    const response = await fetch('https://api.resend.com/domains?limit=100', {
      headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
    });
    if (response.ok) {
      const payload = await response.json();
      const domain = Array.isArray(payload?.data)
        ? payload.data.find((item: any) => item?.status === 'verified' && item?.name)?.name
        : '';
      if (domain) return `Kapparos Tickets <tickets@${domain}>`;
    }
  } catch (_) {}
  return RESEND_FALLBACK_FROM;
}


function buildEmailBarcode(ticketId: string) {
  const patterns: Record<string, string> = {
    '0': 'nnwwn', '1': 'wnnnw', '2': 'nwnnw', '3': 'wwnnn', '4': 'nnwnw',
    '5': 'wnwnn', '6': 'nwwnn', '7': 'nnnww', '8': 'wnnwn', '9': 'nwnwn',
  };
  const units: number[] = [1, 1, 1, 1];
  for (let index = 0; index < ticketId.length; index += 2) {
    const bars = patterns[ticketId[index]];
    const spaces = patterns[ticketId[index + 1]];
    for (let part = 0; part < 5; part += 1) {
      units.push(bars[part] === 'w' ? 3 : 1, spaces[part] === 'w' ? 3 : 1);
    }
  }
  units.push(3, 1, 1);
  const cells = units.map((unit, index) =>
    `<td style="width:${unit * 2}px;height:82px;padding:0;background:${index % 2 === 0 ? '#17130f' : '#ffffff'};font-size:0;line-height:0">&nbsp;</td>`
  ).join('');
  return `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 auto;border-collapse:collapse;background:#fff"><tr>${cells}</tr></table>`;
}

function fillTicketTemplate(template: string, values: Record<string, unknown>) {
  return template.replace(/\{([a-z_]+)\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key] ?? '') : match);
}

async function deliverTicketEmail(sale: any, settings: any, pdfBase64: string, recipientOverride = '') {
  if (Boolean(GMAIL_USER) !== Boolean(GMAIL_APP_PASSWORD)) {
    throw new Error('Gmail delivery is only partly configured. Add both GMAIL_USER and GMAIL_APP_PASSWORD in Supabase secrets.');
  }
  if (!GMAIL_USER && !RESEND_API_KEY) {
    throw new Error('Email delivery is not configured. Add the Gmail secrets in Supabase.');
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
  const priceNumber = Number(sale.price);
  const pricePaid = Number.isFinite(priceNumber) ? '$' + priceNumber.toFixed(2) : '$0.00';
  const title = String(settings?.title || 'Kapparos');
  const subtitle = String(settings?.subtitle || '').trim();
  const brandName = [title, subtitle].filter(Boolean).join(' ');
  const delivery = settings?.ticketDelivery || {};
  const values = { name: sale.fullName || '—', ticket_id: ticketId, quantity: sale.quantity || 0,
    phone: sale.phone || '—', payment_method: payment, title, subtitle, brand: brandName };
  const subjectTemplate = typeof delivery.emailSubject === 'string' && delivery.emailSubject.trim()
    ? delivery.emailSubject.slice(0, 200) : '{brand} — Ticket #{ticket_id}';
  const messageTemplate = typeof delivery.emailMessage === 'string'
    ? delivery.emailMessage.slice(0, 4000) : 'Scan the barcode above, or use the attached printable PDF.';
  const subject = fillTicketTemplate(subjectTemplate, values).replace(/[\r\n]+/g, ' ').trim();
  const emailMessage = fillTicketTemplate(messageTemplate, values);
  const html = `<!doctype html><html><body style="margin:0;background:#f7f2e7;font-family:Arial,sans-serif;color:#241f1a">
    <div style="max-width:620px;margin:32px auto;padding:30px;background:#fff;border:2px solid #6f4b2f;border-radius:18px">
      <h1 style="margin:0 0 6px;text-align:center;color:#6f4b2f">${escapeEmailHtml(title)}</h1>
      ${subtitle ? `<div style="margin:0 0 10px;text-align:center;font-size:22px;font-weight:800;color:#6f4b2f">${escapeEmailHtml(subtitle)}</div>` : ''}
      <p style="margin:0 0 26px;text-align:center;font-weight:700">Ticket #${escapeEmailHtml(ticketId)}</p>
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="padding:11px;border-bottom:1px solid #e5ddd1;color:#756c63">Name</td><td style="padding:11px;border-bottom:1px solid #e5ddd1;font-weight:700" dir="auto">${escapeEmailHtml(sale.fullName)}</td></tr>
        <tr><td style="padding:11px;border-bottom:1px solid #e5ddd1;color:#756c63">Phone</td><td style="padding:11px;border-bottom:1px solid #e5ddd1;font-weight:700">${escapeEmailHtml(sale.phone)}</td></tr>
        <tr><td style="padding:11px;border-bottom:1px solid #e5ddd1;color:#756c63">Amount of כפרות</td><td style="padding:11px;border-bottom:1px solid #e5ddd1;font-weight:700">${escapeEmailHtml(sale.quantity)}</td></tr>
        <tr><td style="padding:11px;border-bottom:1px solid #e5ddd1;color:#756c63">Price Paid</td><td style="padding:11px;border-bottom:1px solid #e5ddd1;font-weight:700">${escapeEmailHtml(pricePaid)}</td></tr>
        <tr><td style="padding:11px;color:#756c63">Payment Method</td><td style="padding:11px;font-weight:700" dir="auto">${escapeEmailHtml(payment)}</td></tr>
      </table>
      <div style="margin:28px auto 10px;text-align:center">
        ${buildEmailBarcode(ticketId)}
        <div style="margin-top:8px;font-family:monospace;font-size:14px;font-weight:700;letter-spacing:.2em;color:#241f1a">${escapeEmailHtml(ticketId)}</div>
      </div>
      <p dir="auto" style="margin:18px 0 0;text-align:center;color:#756c63;white-space:pre-wrap">${escapeEmailHtml(emailMessage)}</p>
    </div>
  </body></html>`;

  if (GMAIL_USER && GMAIL_APP_PASSWORD) {
    try {
      const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
      });
      const info = await transporter.sendMail({
        from: { name: brandName || 'Kapparos Tickets', address: GMAIL_USER },
        to: recipient,
        subject,
        html,
        attachments: [{
          filename: `kapparos-ticket-${ticketId}.pdf`,
          content: pdfBase64,
          encoding: 'base64',
          contentType: 'application/pdf',
        }],
      });
      return { id: String(info?.messageId || ''), provider: 'gmail' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || '');
      if (/535|credentials|username and password not accepted|invalid login/i.test(message)) {
        throw new Error('Gmail rejected the connection. Create a new Google App Password and update GMAIL_APP_PASSWORD in Supabase secrets.');
      }
      throw new Error('Gmail could not send the ticket email. ' + message.slice(0, 300));
    }
  }

  const from = await getResendSender();
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [recipient],
      subject,
      html,
      attachments: [{ filename: `kapparos-ticket-${ticketId}.pdf`, content: pdfBase64 }],
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = String(payload?.message || payload?.error || 'The ticket email could not be sent.');
    if (/domain|sender|from/i.test(message)) {
      throw new Error('Verify a sending domain in Resend before emailing customers.');
    }
    throw new Error(message);
  }
  return payload;
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
        if (merged.length !== (row.sales || []).length) row = await saveState(merged, settings);
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
      const sales = Array.isArray(body.sales) ? body.sales : current.sales;
      const settings = sanitizeIncomingSettings(body.settings, current.settings || defaultSettings());
      const row = await saveState(sales, settings);
      return json(req, publicState(row));
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
      const row = await saveState(current.sales || [], settings);
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
