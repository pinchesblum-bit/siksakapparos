import './buying-content.js';
const copy = (globalThis as any).KapparosBuyingContent;
const ADMIN_ORIGIN = 'https://pinchesblum-bit.github.io';
const recent = new Map<string, number>();
function plainTranslation(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (match, entity) => {
    const names: Record<string, string> = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'"};
    if (entity[0] !== '#') return names[entity.toLowerCase()] || match;
    const number = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
    return number > 0 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff) ? String.fromCodePoint(number) : match;
  });
}

// This endpoint only translates allowlisted public copy. It never saves state,
// modifies sessions, places orders, charges cards, or sends customer messages.
export async function handleRequest(req: Request): Promise<Response> {
  const origin = req.headers.get('origin') || '';
  const headers = {
    'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin',
    ...(origin === ADMIN_ORIGIN ? {'Access-Control-Allow-Origin': origin} : {}),
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status, headers});
  if (origin !== ADMIN_ORIGIN) return reply({error: 'Origin not allowed'}, 403);
  if (req.method === 'OPTIONS') return new Response(null, {status: 204, headers});
  if (req.method !== 'POST') return reply({error: 'Method not allowed'}, 405);
  try {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!/^[a-f0-9]{64}$/i.test(token)) return reply({error: 'Please sign in to the admin website again.'}, 401);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
    const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sessions = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/kapparos_sessions?token_hash=eq.${hash}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=token_hash`, {
      headers: {apikey: serviceKey, Authorization: `Bearer ${serviceKey}`}, signal: AbortSignal.timeout(8000)
    });
    if (!sessions.ok) return reply({error: 'Sign-in could not be checked. Please try again.'}, 503);
    const rows = await sessions.json();
    if (!Array.isArray(rows) || !rows[0]) return reply({error: 'Please sign in to the admin website again.'}, 401);
    if (Number(req.headers.get('content-length') || 0) > 50000) return reply({error: 'Too much text.'}, 413);
    const raw = await req.text();
    if (raw.length > 25000) return reply({error: 'Too much text.'}, 413);
    let body;
    try { body = JSON.parse(raw); } catch { return reply({error: 'Invalid request.'}, 400); }
    if (body?.action === 'status' && Object.keys(body).length === 1) return reply({configured: Boolean(Deno.env.get('KAPPAROS_TRANSLATE_API_KEY'))});
    const input = body?.texts;
    if (!input || typeof input !== 'object' || Array.isArray(input)
      || Object.keys(body).some(key => key !== 'texts')) return reply({error: 'Invalid public text.'}, 400);
    const entries = Object.entries(input) as [string, unknown][];
    if (!entries.length || entries.length > copy.fields.length) return reply({error: 'Invalid public text.'}, 400);
    const values: Record<string, string> = {};
    const pending: [string, string][] = [];
    for (const [key, value] of entries) {
      const field = copy.fields.find((item: any) => item.key === key);
      if (!field || typeof value !== 'string' || value.length > field.max) return reply({error: 'Invalid public text.'}, 400);
      const settings = field.root ? {[key]: value} : {pageContent: {[key]: value}};
      const known = copy.english(settings);
      if (Object.prototype.hasOwnProperty.call(known.values, key)) values[key] = known.values[key];
      else pending.push([key, value]);
    }
    if (!pending.length) return reply({values});
    const apiKey = Deno.env.get('KAPPAROS_TRANSLATE_API_KEY');
    if (!apiKey) return reply({code: 'translation_setup_required', error: 'Automatic English translation needs its one-time Google Cloud connection.'}, 503);
    // Per-instance burst protection; configure provider quota as the durable spending limit.
    const now = Date.now();
    for (const [key, time] of recent) if (now - time > 60000) recent.delete(key);
    if (recent.has(hash) && now - recent.get(hash)! < 3000) return reply({error: 'Please wait a moment and save again.'}, 429);
    recent.set(hash, now);
    const provider = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({q: pending.map(([, value]) => value), source: 'yi', target: 'en', format: 'text', model: 'nmt'}),
      signal: AbortSignal.timeout(15000)
    });
    // Do not return or log provider URLs, credentials, or provider error bodies.
    if (!provider.ok) return reply({error: 'English translation is unavailable. Check the translation connection and try saving again.'}, 502);
    const translations = (await provider.json())?.data?.translations;
    if (!Array.isArray(translations) || translations.length !== pending.length) return reply({error: 'English translation was incomplete. Please try again.'}, 502);
    for (let index = 0; index < pending.length; index++) {
      const [key] = pending[index];
      const field = copy.fields.find((item: any) => item.key === key);
      const value = translations[index]?.translatedText;
      if (typeof value !== 'string' || !value.trim() || value.length > field.max * 4) return reply({error: 'English translation was incomplete. Please try again.'}, 502);
      values[key] = plainTranslation(value.trim());
    }
    return reply({values});
  } catch {
    return reply({error: 'English translation is temporarily unavailable. Please try saving again.'}, 503);
  }
}
Deno.serve(handleRequest);
