// Entry access is separate from the existing ticket/email service.
// Authentication uses existing private sessions or signed, restricted guest tokens.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ORIGIN = 'https://pinchesblum-bit.github.io';
const encoder = new TextEncoder();
const headers = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'Vary': 'Origin',
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {status, headers});
const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
const hash = async (value: string) => hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
const randomToken = () => hex(crypto.getRandomValues(new Uint8Array(32)).buffer);
async function db(path: string, init: RequestInit = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init, headers: {apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers || {})},
  });
  if (!response.ok) throw new Error('The online database is temporarily unavailable.');
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}
async function getState() {
  const rows = await db('kapparos_app_state?id=eq.main&select=*');
  return rows?.[0] || null;
}
function guestState(row: any) {
  const {password, passwordHash, _legacyPassword, accountingExpenses, ...settings} = row.settings || {};
  return {sales: Array.isArray(row.sales) ? row.sales : [], settings: {...settings, accountingExpenses: []}, updatedAt: row.updated_at};
}
async function signingKey() {
  return crypto.subtle.importKey('raw', encoder.encode(SERVICE_KEY), {name:'HMAC', hash:'SHA-256'}, false, ['sign','verify']);
}
async function guestToken(settings: any) {
  // Version changes invalidate guest sessions when the owner changes entry mode.
  const message = `guest.${Math.floor(Date.now()/1000)+86400}.${settings.accessModeVersion || 0}.${randomToken()}`;
  const signature = hex(await crypto.subtle.sign('HMAC', await signingKey(), encoder.encode(message)));
  return `${message}.${signature}`;
}
async function validGuest(token: string, settings: any) {
  if (settings.privateAccessEnabled !== false) return false;
  const parts = token.split('.');
  if (parts.length !== 5 || parts[0] !== 'guest' || !/^\d+$/.test(parts[1])
    || Number(parts[1]) <= Date.now()/1000 || parts[2] !== String(settings.accessModeVersion || 0)
    || !/^[a-f0-9]{64}$/.test(parts[3]) || !/^[a-f0-9]{64}$/.test(parts[4])) return false;
  const bytes = Uint8Array.from(parts[4].match(/../g)!, part => parseInt(part,16));
  return crypto.subtle.verify('HMAC', await signingKey(), bytes, encoder.encode(parts.slice(0,4).join('.')));
}
async function validPrivate(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return false;
  const rows = await db(`kapparos_sessions?token_hash=eq.${await hash(token)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=token_hash`);
  return Boolean(rows?.[0]);
}
async function passwordMatches(password: unknown, settings: any) {
  const value = String(password || '');
  return Boolean(value) && (await hash(value) === settings.passwordHash
    || (typeof settings._legacyPassword === 'string' && value === settings._legacyPassword));
}
async function forward(body: any, token: string) {
  const functionName = body.action === 'send-ticket-text' ? 'kapparos-sms' : 'kapparos-sync';
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
    method:'POST', headers:{'Content-Type':'application/json', Origin:ORIGIN,
      ...(token ? {Authorization:`Bearer ${token}`} : {})}, body:JSON.stringify(body),
  });
  return new Response(await response.text(), {status:response.status, headers});
}
async function sendGuestTicket(body: any) {
  // Only delivery actions reach this helper. The service token is never given to a visitor.
  const token = randomToken();
  const tokenHash = await hash(token);
  await db('kapparos_sessions', {method:'POST', body:JSON.stringify({token_hash:tokenHash,expires_at:new Date(Date.now()+120000).toISOString()})});
  try {
    return await forward({action:body.action, saleId:body.saleId, recipient:body.recipient, pdfBase64:body.pdfBase64}, token);
  } finally {
    await db(`kapparos_sessions?token_hash=eq.${tokenHash}`, {method:'DELETE'});
  }
}
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, {status:204,headers});
  if (req.method !== 'POST') return json({error:'Method not allowed'},405);
  if (req.headers.get('origin') !== ORIGIN) return json({error:'Origin not allowed'},403);
  try {
    const body = await req.json();
    const action = String(body.action || '');
    // Login continues to use the existing credential checks. No guest token is stored there.
    if (action === 'login') return forward(body, '');
    const row = await getState();
    if (!row) return json({error:'No data found'},404);
    const settings = row.settings || {};
    if (action === 'entry') {
      if (settings.privateAccessEnabled !== false) return json({privateAccessEnabled:true});
      return json({privateAccessEnabled:false, token:await guestToken(settings), ...guestState(row)});
    }
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i,'');
    const guest = token.startsWith('guest.');
    if (!(guest ? await validGuest(token, settings) : await validPrivate(token))) {
      return json({error:'Session expired. Please log in again.'},401);
    }
    if (action === 'private-access') {
      if (!(await passwordMatches(body.password,settings))) return json({error:'The password is incorrect.'},403);
      if (typeof body.enabled !== 'boolean') return json({error:'Choose whether Private Access is on or off.'},400);
      const next = {...settings, privateAccessEnabled:body.enabled, accessModeVersion:Number(settings.accessModeVersion || 0)+1};
      await db('kapparos_app_state?id=eq.main', {method:'PATCH',body:JSON.stringify({settings:next,updated_at:new Date().toISOString()})});
      return json({ok:true,privateAccessEnabled:body.enabled,accessModeVersion:next.accessModeVersion});
    }
    if (!guest) {
      if (action === 'save') {
        // Snapshot saves cannot overwrite the password-verified entry setting.
        body.settings = {...(body.settings || {}),privateAccessEnabled:settings.privateAccessEnabled !== false,
          accessModeVersion:settings.accessModeVersion || 0};
      }
      return forward(body,token);
    }
    if (action === 'get') return json(guestState(row));
    if (action === 'logout') return json({ok:true});
    if (action === 'verify-password') {
      // Upgrade only after the existing service verifies the real password.
      const verified = await forward({action:'login',username:settings.username,password:body.password,importLocal:false},'');
      return verified.status === 401 ? json({error:'The password is incorrect.'},403) : verified;
    }
    if (action === 'save') {
      const incoming = body.settings && typeof body.settings === 'object' ? body.settings : {};
      const {password,passwordHash,_legacyPassword,username,accountingExpenses,privateAccessEnabled,accessModeVersion,...safe} = incoming;
      // Bulk reopening requires a password; ordinary individual task edits still work.
      const oldCompleted = (settings.todoTasks || []).filter((task:any)=>task.completed);
      const newTasks = Array.isArray(safe.todoTasks) ? safe.todoTasks : settings.todoTasks || [];
      const reopened = oldCompleted.filter((old:any)=>newTasks.some((task:any)=>task.id===old.id && !task.completed));
      if (reopened.length > 1) return json({error:'Enter the password before reopening multiple completed tasks.'},403);
      const rows = await db('kapparos_app_state?id=eq.main', {method:'PATCH',body:JSON.stringify({
        sales:Array.isArray(body.sales)?body.sales:row.sales, settings:{...settings,...safe},updated_at:new Date().toISOString(),
      })});
      return json(guestState(rows?.[0] || row));
    }
    if (action === 'send-ticket' || action === 'send-ticket-text') return sendGuestTicket(body);
    return json({error:'Enter the website password for this action.'},403);
  } catch {
    return json({error:'The online database is temporarily unavailable.'},500);
  }
});
