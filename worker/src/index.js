// Cloudflare Worker: lead form → Telegram bot message with a JPEG preview of the fitting.
// Secrets (wrangler secret put): TG_BOT_TOKEN, TG_CHAT_ID. Var: ALLOWED_ORIGINS (comma separated).

const MAX_BODY = 600 * 1024; // JSON with a ≤300 KB JPEG in base64 (~400 KB)
const MAX_IMAGE_B64 = 420 * 1024;
const RATE = { windowMs: 60_000, max: 5 };
const hits = new Map(); // best-effort per-isolate limiter; use the Rate Limiting binding in production

export default {
  async fetch(request, env) {
    const origin = request.headers.get('origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    const cors = {
      'access-control-allow-origin': allowed.includes(origin) ? origin : allowed[0] || '',
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
      'access-control-max-age': '86400',
      vary: 'origin',
    };
    const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json; charset=utf-8' } });

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/lead') return reply(404, { ok: false, error: 'Не найдено' });
    if (allowed.length && !allowed.includes(origin)) return reply(403, { ok: false, error: 'Источник запроса не разрешён' });
    if (!env.TG_BOT_TOKEN || !env.TG_CHAT_ID) return reply(500, { ok: false, error: 'Бот не настроен' });

    const ip = request.headers.get('cf-connecting-ip') || 'unknown';
    if (limited(ip)) return reply(429, { ok: false, error: 'Слишком много заявок, попробуйте через минуту' });

    const len = Number(request.headers.get('content-length') || 0);
    if (len > MAX_BODY) return reply(413, { ok: false, error: 'Слишком большая заявка' });
    let data;
    try {
      const raw = await request.text();
      if (raw.length > MAX_BODY) return reply(413, { ok: false, error: 'Слишком большая заявка' });
      data = JSON.parse(raw);
    } catch {
      return reply(400, { ok: false, error: 'Неверный формат заявки' });
    }
    const lead = validate(data);
    if (typeof lead === 'string') return reply(400, { ok: false, error: lead });

    const text = caption(lead);
    try {
      if (lead.image) await sendPhoto(env, lead.image, text);
      else await tg(env, 'sendMessage', { chat_id: env.TG_CHAT_ID, text, disable_web_page_preview: true });
    } catch (e) {
      console.error('telegram', e instanceof Error ? e.message : e);
      return reply(502, { ok: false, error: 'Telegram не принял заявку' });
    }
    return reply(200, { ok: true });
  },
};

function limited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < RATE.windowMs);
  list.push(now);
  hits.set(ip, list);
  return list.length > RATE.max;
}

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function validate(d) {
  if (!d || typeof d !== 'object') return 'Пустая заявка';
  const name = str(d.name, 60);
  const phone = str(d.phone, 30);
  const digits = phone.replace(/\D/g, '');
  if (name.length < 2) return 'Укажите имя';
  if (digits.length !== 11) return 'Укажите телефон из 11 цифр';
  const diameter = Number(d.diameter);
  if (!Number.isInteger(diameter) || diameter < 14 || diameter > 24) return 'Неверный диаметр';
  const pricePerWheel = Number(d.pricePerWheel);
  const priceSet = Number(d.priceSet);
  if (!(pricePerWheel > 0 && priceSet > 0)) return 'Неверная цена';
  const image = typeof d.image === 'string' ? d.image : '';
  if (image && (image.length > MAX_IMAGE_B64 || !/^[A-Za-z0-9+/=]+$/.test(image))) return 'Неверная картинка';
  return {
    name,
    phone,
    car: str(d.car, 80),
    wheel: str(d.wheel, 80),
    diameter,
    pricePerWheel,
    priceSet,
    pageUrl: /^https?:\/\//.test(str(d.pageUrl, 500)) ? str(d.pageUrl, 500) : '',
    picks: Array.isArray(d.picks) ? d.picks.slice(0, 20).map((p) => str(p, 80)).filter(Boolean) : [],
    image,
  };
}

export function caption(l) {
  const fmt = (n) => Math.round(n).toLocaleString('ru-RU');
  return [
    'Заявка с примерки дисков',
    `Имя: ${l.name}`,
    `Телефон: ${l.phone}`,
    l.car ? `Авто: ${l.car}` : '',
    `Диски: ${l.wheel}, R${l.diameter}`,
    `Цена: ${fmt(l.pricePerWheel)} ₽ за диск, ${fmt(l.priceSet)} ₽ за комплект`,
    l.picks.length ? `Подборка: ${l.picks.join('; ')}` : '',
    l.pageUrl ? `Примерка: ${l.pageUrl}` : '',
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, 1024); // Telegram caption limit
}

async function tg(env, method, body) {
  const res = await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${res.status}`);
}

async function sendPhoto(env, b64, text) {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const form = new FormData();
  form.append('chat_id', env.TG_CHAT_ID);
  form.append('caption', text);
  form.append('photo', new Blob([bytes], { type: 'image/jpeg' }), 'fitting.jpg');
  const res = await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendPhoto`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`sendPhoto ${res.status}`);
}
