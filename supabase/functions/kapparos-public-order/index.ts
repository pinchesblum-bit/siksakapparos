const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ADMIN_ORIGIN = 'https://pinchesblum-bit.github.io';
const ALLOWED_ORIGINS = new Set([
  'https://siksakapparos.org',
  'https://www.siksakapparos.org',
  'http://siksakapparos.org',
  'https://pinchesblum-bit.github.io'
]);

function cors(origin: string) {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://siksakapparos.org',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Vary': 'Origin'
  };
}
function json(origin: string, value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: cors(origin) });
}
async function hash(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}
function ticketId(sales: any[]) {
  const used = new Set(sales.map(sale => String(sale?.ticketId || '')));
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const digits = Array.from(crypto.getRandomValues(new Uint8Array(6)), byte => String(byte % 10)).join('');
    if (!used.has(digits)) return digits;
  }
  return String(Date.now()).slice(-6).padStart(6, '0');
}
async function db(path: string, init: RequestInit = {}) {
  const response = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: 'Bearer ' + SERVICE_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers || {})
    }
  });
  const text = await response.text();
  if (!response.ok) throw Object.assign(new Error('Database request failed'), { status: response.status });
  return text ? JSON.parse(text) : null;
}
async function stateRow() {
  const rows = await db('kapparos_app_state?id=eq.main&select=sales,settings,updated_at');
  return Array.isArray(rows) ? rows[0] : null;
}
function cleanName(value: unknown) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 120);
}
function cleanPickup(value: unknown) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 120);
}
function safeSale(sale: any, remaining: number) {
  return {
    id: sale.id,
    ticketId: sale.ticketId,
    fullName: sale.fullName,
    phone: sale.phone,
    email: sale.email,
    quantity: sale.quantity,
    price: sale.price,
    createdAt: sale.createdAt,
    remainingInventory: remaining
  };
}
async function createOrder(body: any) {
  const fullName = cleanName(body.fullName);
  const phone = String(body.phone || '').replace(/\D/g, '');
  const email = String(body.email || '').trim().toLowerCase().slice(0, 200);
  const quantity = Math.floor(Number(body.quantity));
  const orderKey = String(body.orderKey || '').trim().slice(0, 120);
  const orderToken = String(body.orderToken || '').trim();
  if (!fullName || !/^\d{10}$/.test(phone) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw Object.assign(new Error('Enter a valid name, phone number, and email address.'), { status: 400 });
  }
  if (!Number.isFinite(quantity) || quantity < 1 || quantity > 100) {
    throw Object.assign(new Error('Choose a valid quantity.'), { status: 400 });
  }
  if (!orderKey || orderKey.length < 16 || !orderToken || orderToken.length < 32) {
    throw Object.assign(new Error('Checkout session expired. Please try again.'), { status: 400 });
  }
  const tokenHash = await hash(orderToken);
  const current = await stateRow();
  if (!current) throw Object.assign(new Error('The order system is unavailable.'), { status: 503 });
  const sales = Array.isArray(current.sales) ? current.sales : [];
  const now = new Date().toISOString();
  const paidOn = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
  const unitPrice = Math.max(0, Number(current.settings?.defaultPrice || 0));
  const submittedPrice = Number(body.expectedPrice);
  const sale = {
    id: crypto.randomUUID(),
    ticketId: ticketId(sales),
    paidAt: now,
    paidOn,
    createdAt: now,
    updatedAt: now,
    fullName,
    phone,
    email,
    status: 'paid',
    quantity,
    price: Number.isFinite(submittedPrice) ? Number(submittedPrice.toFixed(2)) : Number((quantity * unitPrice).toFixed(2)),
    paymentType: 'credit',
    otherDetails: '',
    plannedPaymentType: '',
    plannedPaymentDate: '',
    geschlagen: false,
    customFields: {},
    notes: 'Online sale',
    isOnlineSale: true,
    isDemoSale: true,
    onlineOrderKey: orderKey,
    onlineOrderTokenHash: tokenHash
  };
  const result = await db('rpc/kapparos_create_online_demo_order', {
    method: 'POST',
    body: JSON.stringify({
      p_sale: sale,
      p_order_key: orderKey,
      p_token_hash: tokenHash,
      p_quantity: quantity
    })
  });
  if (!result?.ok) {
    if (result?.code === 'invalid_session') throw Object.assign(new Error('This checkout session is not valid.'), { status: 403 });
    if (result?.code === 'closed') throw Object.assign(new Error('Online ordering is currently closed.'), { status: 409 });
    if (result?.code === 'price_changed') throw Object.assign(new Error('The price changed. Please review the updated total and try again.'), { status: 409 });
    if (result?.code === 'inventory') {
      const remaining = Math.max(0, Number(result.remaining || 0));
      throw Object.assign(new Error(remaining ? 'Only ' + remaining + ' are still available online.' : 'Online orders are sold out.'), { status: 409 });
    }
    throw Object.assign(new Error('The order system is unavailable.'), { status: 503 });
  }
  return safeSale(result.sale, Math.max(0, Number(result.remaining || 0)));
}
async function verifiedOnlineSale(body: any) {
  const saleId = String(body.saleId || '');
  const orderToken = String(body.orderToken || '');
  if (!saleId || orderToken.length < 32) throw Object.assign(new Error('Ticket session expired.'), { status: 403 });
  const current = await stateRow();
  const sale = (Array.isArray(current?.sales) ? current.sales : []).find((item: any) => String(item?.id) === saleId);
  if (!sale || sale.isOnlineSale !== true || String(sale.status || '') !== 'paid' ||
      sale.onlineOrderTokenHash !== await hash(orderToken)) {
    throw Object.assign(new Error('Ticket session expired.'), { status: 403 });
  }
  return sale;
}
async function deliver(body: any, action: 'send-ticket' | 'send-ticket-text') {
  const current = await stateRow();
  if (current?.settings?.printTicketsEnabled === false) {
    throw Object.assign(new Error('Ticket delivery is currently unavailable.'), { status: 409 });
  }
  const sale = await verifiedOnlineSale(body);
  const channel = action === 'send-ticket' ? 'email' : 'text';
  const prior = await db('kapparos_ticket_deliveries?sale_id=eq.' + encodeURIComponent(String(sale.id)) + '&channel=eq.' + channel + '&select=sale_id');
  if (Array.isArray(prior) && prior.length) {
    throw Object.assign(new Error('This ticket was already sent by ' + channel + '.'), { status: 409 });
  }
  await db('kapparos_ticket_deliveries', {
    method: 'POST',
    body: JSON.stringify({ sale_id: String(sale.id), channel })
  }).catch((error: any) => {
    throw Object.assign(new Error('This ticket was already sent by ' + channel + '.'), { status: error?.status === 409 ? 409 : 503 });
  });
  const sessionToken = randomToken();
  const tokenHash = await hash(sessionToken);
  try {
    await db('kapparos_sessions', {
      method: 'POST',
      body: JSON.stringify({ token_hash: tokenHash, expires_at: new Date(Date.now() + 120000).toISOString() })
    });
    const isEmail = action === 'send-ticket';
    const recipient = isEmail ? String(sale.email || '') : String(sale.phone || '');
    const functionName = isEmail ? 'kapparos-sync' : 'kapparos-sms';
    const downstream = await fetch(SUPABASE_URL + '/functions/v1/' + functionName, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + sessionToken,
        'Content-Type': 'application/json',
        Origin: ADMIN_ORIGIN
      },
      body: JSON.stringify({
        action,
        saleId: sale.id,
        recipient,
        ...(isEmail ? { pdfBase64: String(body.pdfBase64 || '') } : {})
      })
    });
    const result = await downstream.json().catch(() => ({}));
    if (!downstream.ok) {
      throw Object.assign(new Error(String(result.error || 'The ticket could not be sent.')), { status: downstream.status });
    }
    return result;
  } catch (error) {
    await db('kapparos_ticket_deliveries?sale_id=eq.' + encodeURIComponent(String(sale.id)) + '&channel=eq.' + channel, { method: 'DELETE' }).catch(() => {});
    throw error;
  } finally {
    await db('kapparos_sessions?token_hash=eq.' + tokenHash, { method: 'DELETE' }).catch(() => {});
  }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin') || '';
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== 'POST') return json(origin, { error: 'Method not allowed' }, 405);
  if (!ALLOWED_ORIGINS.has(origin)) return json(origin, { error: 'Origin not allowed' }, 403);
  try {
    const body = await req.json();
    const action = String(body.action || '');
    if (action === 'create-demo-order') return json(origin, { ok: true, sale: await createOrder(body) });
    if (action === 'send-ticket') return json(origin, { ok: true, ...(await deliver(body, 'send-ticket')) });
    if (action === 'send-ticket-text') return json(origin, { ok: true, ...(await deliver(body, 'send-ticket-text')) });
    return json(origin, { error: 'Unknown action' }, 400);
  } catch (error) {
    const status = Number((error as any)?.status) || 500;
    const message = status >= 500 ? 'The order system is temporarily unavailable.' : String((error as Error)?.message || 'Request failed.');
    return json(origin, { error: message }, status);
  }
});