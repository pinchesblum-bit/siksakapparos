const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ALLOWED_ORIGINS = new Set([
  'https://siksakapparos.org',
  'https://www.siksakapparos.org',
  'http://siksakapparos.org',
  'https://pinchesblum-bit.github.io'
]);
const DEFAULTS = {
  orderingEnabled: true,
  title: 'פנים מאירות סיקסא',
  subtitle: 'כפרות',
  buttonText: 'באשטעלט יעצט אייער כפרה',
  price: 18,
  inventory: 100,
  pickupTimes: ['Tuesday evening', 'Wednesday morning'],
  paymentChoices: ['Credit card'],
  confirmationText: 'After checkout, choose Print Ticket, Email Ticket, or Text Ticket.'
};

function responseHeaders(origin: string) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Vary': 'Origin'
  };
}
function cleanLines(value: unknown, fallback: string[]) {
  const source = Array.isArray(value) ? value : fallback;
  const cleaned = source.map(item => String(item || '').trim()).filter(Boolean).slice(0, 30);
  return cleaned.length ? cleaned : fallback;
}
function sanitize(value: any, sales: any[] = [], admin: any = {}) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    orderingEnabled: source.orderingEnabled !== false,
    title: String(source.title || DEFAULTS.title).trim().slice(0, 120),
    subtitle: String(source.subtitle || DEFAULTS.subtitle).trim().slice(0, 120),
    buttonText: String(source.buttonText || DEFAULTS.buttonText).trim().slice(0, 160),
    price: Number.isFinite(Number(admin.defaultPrice)) ? Math.max(0, Number(admin.defaultPrice)) : 0,
    inventory: (() => {
      const allocation = Number.isFinite(Number(admin.inventory)) ? Math.max(0, Math.floor(Number(admin.inventory))) : 0;
      const sold = sales.reduce((sum, sale) => String(sale.status || 'paid') === 'paid'
        ? sum + Math.max(0, Number(sale.quantity || 0)) : sum, 0);
      return Math.max(0, allocation - sold);
    })(),
    pickupTimes: cleanLines(source.pickupTimes, DEFAULTS.pickupTimes),
    paymentChoices: cleanLines(source.paymentChoices, DEFAULTS.paymentChoices),
    confirmationText: String(source.confirmationText || DEFAULTS.confirmationText).trim().slice(0, 1200)
  };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin') || '';
  if (!ALLOWED_ORIGINS.has(origin)) {
    return new Response(JSON.stringify({error: 'Origin not allowed'}), {
      status: 403,
      headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store'}
    });
  }
  const headers = responseHeaders(origin);
  if (req.method === 'OPTIONS') return new Response(null, {status: 204, headers});
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({error: 'Method not allowed'}), {status: 405, headers});
  }
  try {
    const result = await fetch(
      `${SUPABASE_URL}/rest/v1/kapparos_app_state?id=eq.main&select=settings,sales`,
      {headers: {apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`}}
    );
    if (!result.ok) throw new Error('Database unavailable');
    const rows = await result.json();
    if (!rows?.[0]) return new Response(JSON.stringify({error: 'No data found'}), {status: 404, headers});
    return new Response(JSON.stringify({settings: sanitize(rows[0].settings?.buyingWebsite, Array.isArray(rows[0].sales) ? rows[0].sales : [], rows[0].settings)}), {status: 200, headers});
  } catch {
    return new Response(JSON.stringify({error: 'Settings unavailable'}), {status: 500, headers});
  }
});
