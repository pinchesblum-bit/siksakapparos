import './buying-content.js';
const buyingCopy = (globalThis as any).KapparosBuyingContent;
import { OPENING_NOTICE, hasBuyingAccess, previewLogin } from './preview-access.ts';
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
    'Access-Control-Allow-Headers': 'authorization, content-type',
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
const HOMEPAGE_GROUPS = new Set(['Heading', 'Time and location', 'Highlights and icons', 'Notices and ordering phone', 'Support footer']);
const HOMEPAGE_KEYS = buyingCopy.fields.filter((field: any) => HOMEPAGE_GROUPS.has(field.group)).map((field: any) => field.key);
async function sanitize(value: any, sales: any[] = [], admin: any = {}, homepageOnly = false) {
  const source = value && typeof value === 'object' ? value : {};
  const homepage = {
    ...buyingCopy.publicCopy(source, homepageOnly ? HOMEPAGE_KEYS : undefined),
    orderingEnabled: source.orderingEnabled !== false,
    publicAccessEnabled: source.publicAccessEnabled === true,
    title: String(source.title || DEFAULTS.title).trim().slice(0, 120),
    subtitle: String(source.subtitle || DEFAULTS.subtitle).trim().slice(0, 120),
    buttonText: String(source.buttonText || DEFAULTS.buttonText).trim().slice(0, 160),
    inventory: (() => {
      const allocation = Number.isFinite(Number(admin.inventory)) ? Math.max(0, Math.floor(Number(admin.inventory))) : 0;
      const sold = sales.reduce((sum, sale) => ['paid', 'treifa', 'dead'].includes(String(sale.status || 'paid'))
        ? sum + Math.max(0, Number(sale.quantity || 0)) : sum, 0);
      return Math.max(0, allocation - sold);
    })()
  };
  // Public visitors receive only landing-page copy and aggregate availability.
  // Order configuration and every order operation retain the existing access check.
  if (homepageOnly) return { ...homepage, homepageOnly: true };
  return {
    ...homepage,
    termsEnabled: source.termsEnabled === true,
    termsRevision: source.termsEnabled === true ? await buyingCopy.termsRevision(source) : '',
    price: Number.isFinite(Number(admin.defaultPrice)) ? Math.max(0, Number(admin.defaultPrice)) : 0,
    pickupTimes: cleanLines(source.pickupTimes, DEFAULTS.pickupTimes),
    paymentChoices: ['Credit card'],
    confirmationText: buyingCopy.source(source).confirmationText,
    printTicketsEnabled: admin.printTicketsEnabled !== false,
    ticketDelivery: admin.ticketDelivery && typeof admin.ticketDelivery === 'object' ? admin.ticketDelivery : {}
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
    const body = await req.json();
    const result = await fetch(
      `${SUPABASE_URL}/rest/v1/kapparos_app_state?id=eq.main&select=settings,sales`,
      {headers: {apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`}}
    );
    if (!result.ok) throw new Error('Database unavailable');
    const rows = await result.json();
    if (!rows?.[0]) return new Response(JSON.stringify({error: 'No data found'}), {status: 404, headers});
    const admin = rows[0].settings || {};
    if (body.action === 'homepage-config') {
      return new Response(JSON.stringify({settings:await sanitize(admin.buyingWebsite, rows[0].sales || [], admin, true)}), {status:200,headers});
    }
    if (body.action === 'preview-login') {
      const token = await previewLogin(req, body, admin, SERVICE_KEY);
      return new Response(JSON.stringify({token,settings:await sanitize(admin.buyingWebsite, rows[0].sales || [], admin)}), {status:200,headers});
    }
    if (!(await hasBuyingAccess(req, admin, SERVICE_KEY))) {
      return new Response(JSON.stringify({locked:true,notice:OPENING_NOTICE}), {status:200,headers});
    }
    return new Response(JSON.stringify({settings:await sanitize(admin.buyingWebsite, rows[0].sales || [], admin)}), {status:200,headers});
  } catch (error) {
    const status = Number((error as any)?.status) || 500;
    return new Response(JSON.stringify({error: status < 500 ? (error as Error).message : 'Settings unavailable'}), {status,headers});
  }
});
