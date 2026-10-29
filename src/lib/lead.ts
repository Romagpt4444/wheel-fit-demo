import type { BrandConfig } from '../types';

export interface LeadPayload {
  name: string;
  phone: string;
  car: string;
  wheel: string;
  diameter: number;
  pricePerWheel: number;
  priceSet: number;
  pageUrl: string;
  picks?: string[];
}

export function leadText(p: LeadPayload, brandName: string): string {
  const fmt = (v: number) => v.toLocaleString('ru-RU');
  return [
    `Заявка с примерки дисков, ${brandName}`,
    `Имя: ${p.name}`,
    `Телефон: ${p.phone}`,
    p.car ? `Авто: ${p.car}` : '',
    `Диски: ${p.wheel}, R${p.diameter}`,
    `Цена: ${fmt(p.pricePerWheel)} ₽ за диск, ${fmt(p.priceSet)} ₽ за комплект`,
    p.picks?.length ? `Подборка: ${p.picks.join('; ')}` : '',
    `Примерка: ${p.pageUrl}`,
  ]
    .filter(Boolean)
    .join('\n');
}

/** Deep link to the shop's chat (or the share sheet when no account is configured). Always works. */
export function chatLink(brand: BrandConfig, text: string, pageUrl = location.href): string {
  const c = brand.contacts;
  if (brand.leads.channel === 'whatsapp') {
    const phone = (c.whatsapp || '').replace(/\D/g, '');
    return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  }
  const user = (c.telegram || '').replace(/^@/, '').trim();
  if (user) return `https://t.me/${encodeURIComponent(user)}?text=${encodeURIComponent(text)}`;
  return `https://t.me/share/url?url=${encodeURIComponent(pageUrl)}&text=${encodeURIComponent(text)}`;
}

export function phoneDigits(v: string): string {
  return v.replace(/\D/g, '');
}

/** +7 (900) 123-45-67 as the user types; also accepts 8… and 9… starts. */
export function formatPhone(v: string): string {
  let d: string;
  if (v.includes('+7')) {
    // the "+7" prefix may end up anywhere if the caret was placed before it
    const rest = phoneDigits(v.replace('+7', ''));
    // a full number pasted after the prefix: "+7" + "8 916 123-45-67"
    d = rest.length >= 11 && /^[78]/.test(rest) ? '7' + rest.slice(1) : '7' + rest;
  } else {
    d = phoneDigits(v);
    if (d.startsWith('8')) d = '7' + d.slice(1);
    if (d && !d.startsWith('7')) d = '7' + d;
  }
  d = d.slice(0, 11);
  const p = d.slice(1);
  let out = '+7';
  if (p.length) out += ' (' + p.slice(0, 3);
  if (p.length >= 3) out += ')';
  if (p.length > 3) out += ' ' + p.slice(3, 6);
  if (p.length > 6) out += '-' + p.slice(6, 8);
  if (p.length > 8) out += '-' + p.slice(8, 10);
  return out;
}

export function phoneValid(v: string): boolean {
  return phoneDigits(v).length === 11;
}

/** Sends the lead to the Cloudflare Worker (Telegram bot) with a JPEG preview ≤ 300 KB. */
export async function sendToWorker(url: string, payload: LeadPayload, preview: Blob | null): Promise<void> {
  const body: Record<string, unknown> = { ...payload };
  if (preview) body.image = await blobToBase64(preview);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(msg || `Сервер ответил ${res.status}`);
  }
}

function blobToBase64(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });
}
