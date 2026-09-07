const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ALLOWED_ORIGINS = new Set(['https://pinchesblum-bit.github.io']);
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

async function getState() {
  const rows = await db('kapparos_app_state?id=eq.main&select=*');
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function requireSession(req: Request) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const hash = await sha256(token);
  const rows = await db(`kapparos_sessions?token_hash=eq.${hash}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=token_hash`);
  return Array.isArray(rows) && rows[0] ? { token, hash } : null;
}



Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405);
  if (!ALLOWED_ORIGINS.has(req.headers.get('origin') || '')) return json(req, { error: 'Origin not allowed' }, 403);
  try {
    if (!(await requireSession(req))) return json(req, { error: 'Session expired. Please log in again.' }, 401);
    const body = await req.json();
    if (body.action !== 'send-ticket-text') return json(req, { error: 'Unknown action' }, 400);
    const current = await getState();
    if (!current) return json(req, { error: 'No data found' }, 404);
    const sale = Array.isArray(current.sales)
      ? current.sales.find((item: any) => String(item?.id) === String(body.saleId || '')) : null;
    if (!sale) return json(req, { error: 'Sale not found' }, 404);
    if (String(sale.status || 'paid') !== 'paid') return json(req, { error: 'Tickets are available only after a sale is paid.' }, 400);
    const settings = current.settings || {};
    if (settings.printTicketsEnabled === false) return json(req, { error: 'Tickets are turned off.' }, 400);
    const recipient = String(body.recipient || sale.phone || '').trim();
    if (!/^[0-9]{10}$/.test(recipient)) return json(req, { error: 'Enter exactly 10 digits.' }, 400);
    const ticketId = String(sale.ticketId || '');
    if (!/^[0-9]{10}$/.test(ticketId)) return json(req, { error: 'Save this sale before sending its ticket.' }, 400);
    const username = Deno.env.get('SMSGATE_USERNAME') || '';
    const password = Deno.env.get('SMSGATE_PASSWORD') || '';
    const deviceId = Deno.env.get('SMSGATE_DEVICE_ID') || '';
    if (!username || !password || !deviceId) return json(req, { error: 'Text messaging is not configured yet.' }, 503);
    const methods = Array.isArray(settings.paymentMethods) ? settings.paymentMethods : [];
    const payment = methods.find((item: any) => String(item?.id) === String(sale.paymentType))?.label || sale.paymentType || 'Not selected';
    const message = [
      settings.title || 'פנים מאירות סיקסא', settings.subtitle || 'כפרות', '',
      `Ticket ID: ${ticketId}`, `Name: ${sale.fullName || '—'}`,
      `Phone: ${recipient}`, `Amount of כפרות: ${sale.quantity || 0}`,
      `Payment Method: ${payment}`
    ].join('\n');
    // Send only server-stored order details, never arbitrary client-supplied text.
    const response = await fetch('https://api.sms-gate.app/3rdparty/v1/messages', {
      method: 'POST',
      headers: { Authorization: 'Basic ' + btoa(username + ':' + password), 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, textMessage: { text: message }, phoneNumbers: ['+1' + recipient], withDeliveryReport: true }),
      signal: AbortSignal.timeout(20000),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = response.status === 401 || response.status === 403
        ? 'SMS connection rejected. Check the saved SMSGate credentials.'
        : response.status === 429 ? 'Too many messages. Please wait before sending again.'
        : 'SMSGate could not accept the text. Check that the phone service is running.';
      return json(req, { error }, 502);
    }
    return json(req, { ok: true, messageId: result.id || '', status: 'queued' });
  } catch (error) {
    const timedOut = error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name);
    return json(req, { error: timedOut
      ? 'Sending timed out. Check SMSGate Messages before retrying to avoid sending twice.'
      : 'Could not confirm sending. Check SMSGate Messages before retrying.' }, 502);
  }
});
