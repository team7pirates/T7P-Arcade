// Save codes (v0.34.0): move saves to another device with a 6-letter code.
//
// The backup is gzipped and sent to the T7P Supabase project, which hands
// back a code. Type the code on the other device within 24 hours to get the
// saves. A code works once: the save is deleted from the server when it's
// claimed (or when it expires). The server only has two functions, put and
// take; nobody can list or browse saves. Needs the internet; the file
// transfer in Settings still works without it.

const URL_BASE = 'https://nntlexexjszkanptbrzq.supabase.co/rest/v1/rpc/';
const KEY = 'sb_publishable_aTqyp5TSnU5KblLqcOt37A_vjztXrLW'; // publishable (client) key
export const CODE_HOURS = 24;
export const CODE_LEN = 6;
export const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

async function rpc(fn, body) {
  let res;
  try {
    res = await fetch(URL_BASE + fn, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw new Error('offline');
  }
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(/too large/.test(t) ? 'too-large' : 'server');
  }
  return res.json();
}

const toB64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
const fromB64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

export async function pack(text) {
  if (typeof CompressionStream === 'undefined') return `j:${text}`;
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return `g:${toB64(new Uint8Array(await new Response(stream).arrayBuffer()))}`;
}
export async function unpack(payload) {
  if (payload.startsWith('j:')) return payload.slice(2);
  if (!payload.startsWith('g:')) throw new Error('bad');
  if (typeof DecompressionStream === 'undefined') throw new Error('old-browser');
  const stream = new Blob([fromB64(payload.slice(2))]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

// Clean up what someone typed: letters and numbers only, upper case.
export const cleanCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LEN);
export const looksLikeCode = (s) => cleanCode(s).length === CODE_LEN;

// Upload a backup object; returns { code, expires }.
export async function makeCode(backup) {
  const payload = await pack(JSON.stringify(backup));
  const rows = await rpc('new_save_put', { p_payload: payload });
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row?.code) throw new Error('server');
  return { code: row.code, expires: new Date(row.expires_at) };
}
// Trade a code for the backup object (null if the code is wrong, used or expired).
export async function takeCode(code) {
  const payload = await rpc('new_save_take', { p_code: cleanCode(code) });
  if (!payload) return null;
  return JSON.parse(await unpack(payload));
}
export const errorText = (e) => ({
  offline: 'You need the internet for codes. Check your connection, or use Save the file instead.',
  'too-large': 'These saves are too big for a code (over 8 MB). Pick fewer saves or use Save the file.',
  'old-browser': 'This browser is too old to open the code. Update it, or use a save file.',
}[e?.message] || 'The code server didn\'t answer. Try again in a minute, or use a save file.');
