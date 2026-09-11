const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ADMIN_ORIGIN = 'https://pinchesblum-bit.github.io';
const SYNC_URL = SUPABASE_URL + '/functions/v1/kapparos-sync';

function headers() {
  return {
    'Access-Control-Allow-Origin': ADMIN_ORIGIN,
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Vary': 'Origin'
  };
}

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: headers() });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers() });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (req.headers.get('origin') !== ADMIN_ORIGIN) return json({ error: 'Origin not allowed' }, 403);

  try {
    const body = await req.json();
    if (String(body?.action || '') === 'entry') {
      return json({ privateAccessEnabled: true });
    }
    if (String(body?.action || '') === 'private-access') {
      return json({ error: 'Private Access is always enabled.' }, 403);
    }

    const authorization = req.headers.get('authorization') || '';
    const target = String(body?.action || '') === 'send-ticket-text'
      ? SUPABASE_URL + '/functions/v1/kapparos-sms' : SYNC_URL;
    const response = await fetch(target, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ADMIN_ORIGIN,
        ...(authorization ? { Authorization: authorization } : {})
      },
      body: JSON.stringify(body)
    });
    const text = await response.text();
    return new Response(text, { status: response.status, headers: headers() });
  } catch (error) {
    console.error(error);
    return json({ error: 'The online database is temporarily unavailable.' }, 500);
  }
});
