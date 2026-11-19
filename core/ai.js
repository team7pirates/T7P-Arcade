// AI texting (v0.27.0): players bring their own key from an AI service, and
// characters on the phone answer what they type. The key is saved only in
// this browser (localStorage 't7p:ai'), never in saves and never sent
// anywhere except the service the player picked. The game always works without
// a key: the reply buttons and quick texts stay.
//
// The AI never decides game effects. It writes the character's answer and
// labels the player's message with a tone from a fixed list; the game turns
// the tone into effects with its own rules and limits.

import { settings } from './settings.js';

const KEY = 't7p:ai';
const DAY_KEY = 't7p:aiCount';
export const DAILY_LIMIT = 300; // a soft cap to protect the player's free quota

// kind: 'gemini' (Google's own API), 'openai' (the common OpenAI-style API),
// 'anthropic'. browser: whether the service is known to accept calls straight
// from a web page. Free plans change often; each guide says what was true
// when this was written (Nov 2026).
export const PROVIDERS = [
  { id: 'gemini', name: 'Google Gemini', kind: 'gemini', free: 'Free', browser: 'works',
    base: 'https://generativelanguage.googleapis.com/v1beta', url: 'https://aistudio.google.com/apikey',
    steps: ['Go to aistudio.google.com/apikey and sign in with a Google account.', 'Click "Create API key".', 'Copy the key and paste it below.'],
    note: 'Free with daily limits. No card needed.' },
  { id: 'openrouter', name: 'OpenRouter', kind: 'openai', free: 'Free models', browser: 'works',
    base: 'https://openrouter.ai/api/v1', url: 'https://openrouter.ai/keys', model: 'openrouter/free',
    steps: ['Go to openrouter.ai and sign up.', 'Open Keys and click "Create key".', 'Copy the key and paste it below.'],
    note: 'Uses OpenRouter\'s free models (about 50 messages a day). No card needed.' },
  { id: 'groq', name: 'Groq', kind: 'openai', free: 'Free', browser: 'test',
    base: 'https://api.groq.com/openai/v1', url: 'https://console.groq.com/keys', model: 'llama-3.1-8b-instant',
    steps: ['Go to console.groq.com and sign up.', 'Open API Keys and click "Create API Key".', 'Copy the key, paste it below and press Test.'],
    note: 'Free with rate limits. Press Test: some browsers block it.' },
  { id: 'mistral', name: 'Mistral', kind: 'openai', free: 'Free plan', browser: 'test',
    base: 'https://api.mistral.ai/v1', url: 'https://console.mistral.ai/api-keys', model: 'mistral-small-latest',
    steps: ['Go to console.mistral.ai, sign up and verify your phone number.', 'Choose the free "Experiment" plan.', 'Open API Keys, create a key, paste it below and press Test.'],
    note: 'Free "Experiment" plan. Mistral may use messages to train its models. Press Test: some browsers block it.' },
  { id: 'anthropic', name: 'Anthropic (Claude)', kind: 'anthropic', free: 'Paid', browser: 'works',
    base: 'https://api.anthropic.com/v1', url: 'https://console.anthropic.com/settings/keys', model: 'claude-haiku-5-5',
    steps: ['Go to console.anthropic.com and sign up.', 'Add credits under Billing.', 'Open API Keys, create a key and paste it below.'],
    note: 'Paid, but very cheap for texting.' },
  { id: 'custom', name: 'Other (OpenAI-style)', kind: 'openai', free: '—', browser: 'test',
    base: '', url: '', model: '',
    steps: ['Enter the service\'s base URL (ending in /v1), its model name and your key.', 'Press Test.'],
    note: 'For any service that uses the OpenAI-style chat API.' },
];
export const provider = (id) => PROVIDERS.find((p) => p.id === id) || PROVIDERS[0];

let cfg = null;
function load() {
  if (cfg) return cfg;
  try { cfg = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { cfg = null; }
  if (!cfg) cfg = { provider: 'gemini', key: '', model: '', base: '', on: true, ok: false };
  return cfg;
}
function persist() { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch { /* ignore */ } }

export const ai = {
  get config() { return { ...load() }; },
  set(patch) { load(); cfg = { ...cfg, ...patch }; if ('key' in patch || 'provider' in patch || 'base' in patch) { cfg.ok = false; cfg.autoModel = ''; } persist(); },
  forget() { cfg = { provider: load().provider, key: '', model: '', base: '', on: true, ok: false }; persist(); },
  // Ready to use: a key is saved, it's turned on, and we're online.
  ready() { const c = load(); return !!(c.key && c.on && navigator.onLine && usedToday() < DAILY_LIMIT); },
  hasKey() { return !!load().key; },
  usedToday,
  async test() {
    const out = await chat({ system: 'You are a test. Answer with exactly: {"reply":"ready","tone":"friendly"}', messages: [{ role: 'user', content: 'ping' }], json: true, maxTokens: 40, noCount: true });
    load().ok = true; persist();
    return out;
  },
};

function today() { return new Date().toISOString().slice(0, 10); }
function usedToday() { try { const d = JSON.parse(localStorage.getItem(DAY_KEY) || '{}'); return d.day === today() ? d.n : 0; } catch { return 0; } }
function count() { try { localStorage.setItem(DAY_KEY, JSON.stringify({ day: today(), n: usedToday() + 1 })); } catch { /* ignore */ } }

async function fetchJson(url, init, ms = 25000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  let res;
  try { res = await fetch(url, { ...init, signal: ctl.signal }); }
  catch (e) {
    clearTimeout(t);
    if (e.name === 'AbortError') throw new Error('The AI took too long to answer.');
    throw new Error('Couldn\'t reach the AI service. It may block requests from web pages, or you may be offline.');
  }
  clearTimeout(t);
  let j = null; try { j = await res.json(); } catch { /* ignore */ }
  if (!res.ok) {
    const msg = j?.error?.message || j?.message || j?.error || `Error ${res.status}`;
    if (res.status === 401 || res.status === 403) throw new Error(`The service said the key isn't valid. (${String(msg).slice(0, 120)})`);
    if (res.status === 429) throw new Error('You\'ve hit this service\'s free limit for now. Try again later.');
    throw new Error(String(msg).slice(0, 200));
  }
  return j;
}

// Gemini: pick a free text model the key can use, so renamed models don't break.
async function geminiModel(c, p) {
  if (c.model) return c.model;
  if (c.autoModel) return c.autoModel;
  const j = await fetchJson(`${p.base}/models?pageSize=200`, { headers: { 'x-goog-api-key': c.key } });
  const names = (j.models || []).filter((m) => (m.supportedGenerationMethods || []).includes('generateContent')).map((m) => m.name.replace(/^models\//, ''))
    .filter((n) => !/(image|tts|audio|live|embed|vision|exp|preview|thinking|robotics|learnlm|gemma)/i.test(n));
  const rank = (n) => (/flash-lite/.test(n) ? 0 : /flash/.test(n) ? 1 : 2) * 100 - (parseFloat((n.match(/(\d+(\.\d+)?)/) || [0, 0])[1]) || 0);
  const best = names.sort((a, b) => rank(a) - rank(b))[0] || 'gemini-2.5-flash-lite';
  cfg.autoModel = best; persist();
  return best;
}

// messages: [{ role: 'user'|'assistant', content }]
export async function chat({ system, messages, json = false, maxTokens = 220, noCount = false }) {
  const c = load(); const p = provider(c.provider);
  if (!c.key) throw new Error('No AI key saved.');
  if (!navigator.onLine) throw new Error('You\'re offline.');
  if (!noCount && usedToday() >= DAILY_LIMIT) throw new Error('That\'s the AI limit for today. The reply buttons still work.');
  let text = '';
  if (p.kind === 'gemini') {
    const model = await geminiModel(c, p);
    const j = await fetchJson(`${p.base}/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': c.key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.9, ...(json ? { responseMimeType: 'application/json' } : {}) },
      }),
    });
    text = (j.candidates?.[0]?.content?.parts || []).map((x) => x.text || '').join('');
    if (!text && j.promptFeedback?.blockReason) throw new Error('The AI service blocked that message.');
  } else if (p.kind === 'anthropic') {
    const j = await fetchJson(`${p.base}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': c.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model: c.model || p.model, system, max_tokens: maxTokens, messages }),
    });
    text = (j.content || []).map((x) => x.text || '').join('');
  } else {
    const base = (p.id === 'custom' ? c.base : p.base).replace(/\/+$/, '');
    if (!base) throw new Error('Enter the service\'s base URL first.');
    const model = c.model || p.model;
    if (!model) throw new Error('Enter a model name first.');
    const j = await fetchJson(`${base}/chat/completions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${c.key}`, ...(p.id === 'openrouter' ? { 'X-Title': 'T7P Arcade' } : {}) },
      body: JSON.stringify({ model, max_tokens: maxTokens, temperature: 0.9, messages: [{ role: 'system', content: system }, ...messages] }),
    });
    text = j.choices?.[0]?.message?.content || '';
  }
  if (!noCount) count();
  if (!text) throw new Error('The AI sent back an empty answer.');
  return text.trim();
}

// Pull {"reply": ..., "tone": ...} out of whatever the model wrote.
export function parseReply(text, tones) {
  let obj = null;
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { obj = JSON.parse(m[0]); } catch { obj = null; } }
  let reply = obj?.reply ?? (m ? '' : text);
  reply = String(reply || '').replace(/^["']|["']$/g, '').trim();
  let tone = String(obj?.tone || '').toLowerCase().trim();
  if (!tones.includes(tone)) tone = tones.includes('neutral') ? 'neutral' : tones[0];
  return { reply: reply.slice(0, 400), tone };
}

export const cleanLanguage = () => settings.value.cleanLanguage !== false;
