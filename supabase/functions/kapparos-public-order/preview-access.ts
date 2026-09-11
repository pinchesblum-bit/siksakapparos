// Preview access is separate from admin sessions and never returns an admin token.
export const OPENING_NOTICE = 'Online ordering will open September 13.';
const attempts = new Map<string, { count:number; reset:number }>();
const encoder = new TextEncoder();
const base64url = (bytes:Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const decode = (value:string) => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
async function digest(value:string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))), byte => byte.toString(16).padStart(2, '0')).join('');
}
function equal(a:string, b:string) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i=0;i<a.length;i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}
async function key(secret:string) {
  return crypto.subtle.importKey('raw', encoder.encode('kapparos-buying-preview-v1:' + secret), {name:'HMAC', hash:'SHA-256'}, false, ['sign','verify']);
}
async function credentialsVersion(settings:any) {
  return digest(String(settings.username || '') + ':' + String(settings.passwordHash || settings._legacyPassword || ''));
}
export function publicAccessEnabled(settings:any) {
  return settings?.buyingWebsite?.publicAccessEnabled === true;
}
export async function hasBuyingAccess(req:Request, settings:any, secret:string) {
  if (publicAccessEnabled(settings)) return true;
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (token.length > 1200) return false;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'bp1') return false;
  try {
    const payload = JSON.parse(new TextDecoder().decode(decode(parts[1])));
    if (payload.scope !== 'buying-preview' || !Number.isFinite(payload.exp) || payload.exp <= Date.now()) return false;
    if (!equal(String(payload.credentials || ''), await credentialsVersion(settings))) return false;
    return await crypto.subtle.verify('HMAC', await key(secret), decode(parts[2]), encoder.encode('bp1.' + parts[1]));
  } catch { return false; }
}
export async function previewLogin(req:Request, body:any, settings:any, secret:string) {
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  const now = Date.now();
  const attemptKey = await digest((req.headers.get('x-forwarded-for') || '').split(',')[0] + ':' + username);
  for (const [id, attempt] of attempts) if (attempt.reset <= now) attempts.delete(id);
  const attempt = attempts.get(attemptKey) || {count:0,reset:now+15*60000};
  if (attempt.count >= 8) throw Object.assign(new Error('Too many login attempts. Please try again later.'), {status:429});
  attempt.count++; attempts.set(attemptKey, attempt);
  const hash = await digest(password);
  const matches = Boolean(settings.passwordHash) && equal(hash, String(settings.passwordHash));
  const legacy = Boolean(settings._legacyPassword) && equal(password, String(settings._legacyPassword));
  if (!username || username.length > 120 || !password || password.length > 256 || !equal(username, String(settings.username || '')) || !(matches || legacy)) {
    throw Object.assign(new Error('Incorrect username or password.'), {status:401});
  }
  attempts.delete(attemptKey);
  const payload = base64url(encoder.encode(JSON.stringify({scope:'buying-preview',exp:now+12*3600000,credentials:await credentialsVersion(settings),nonce:crypto.randomUUID()})));
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', await key(secret), encoder.encode('bp1.' + payload)));
  return 'bp1.' + payload + '.' + base64url(signature);
}
