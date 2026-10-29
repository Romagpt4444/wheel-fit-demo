// node --test worker/test — runs the Worker with a mocked Telegram API
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

const env = { TG_BOT_TOKEN: 'test-token', TG_CHAT_ID: '42', ALLOWED_ORIGINS: 'https://romagpt4444.github.io' };
const ORIGIN = 'https://romagpt4444.github.io';
const lead = { name: 'Марк', phone: '+7 (900) 123-45-67', car: 'Kia', wheel: 'APEX S5', diameter: 19, pricePerWheel: 61000, priceSet: 244000, pageUrl: 'https://romagpt4444.github.io/wheel-fit-demo/#/fit', picks: ['APEX Mono R19'] };

function req(body, { origin = ORIGIN, ip = '1.1.1.1', method = 'POST', path = '/lead' } = {}) {
  return new Request(`https://w.example${path}`, { method, headers: { origin, 'content-type': 'application/json', 'cf-connecting-ip': ip }, body: method === 'POST' ? JSON.stringify(body) : undefined });
}

function mockTelegram() {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response('{"ok":true}', { status: 200 });
  };
  return calls;
}

test('text lead goes to sendMessage', async () => {
  const calls = mockTelegram();
  const res = await worker.fetch(req(lead, { ip: 'a' }), env);
  assert.equal(res.status, 200);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /bottest-token\/sendMessage$/);
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.chat_id, '42');
  assert.match(body.text, /Телефон: \+7 \(900\) 123-45-67/);
  assert.match(body.text, /Подборка: APEX Mono R19/);
  assert.equal(res.headers.get('access-control-allow-origin'), ORIGIN);
});

test('lead with JPEG preview goes to sendPhoto as multipart', async () => {
  const calls = mockTelegram();
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).toString('base64');
  const res = await worker.fetch(req({ ...lead, image: jpeg }, { ip: 'b' }), env);
  assert.equal(res.status, 200);
  assert.match(calls[0].url, /sendPhoto$/);
  assert.ok(calls[0].init.body instanceof FormData);
  assert.equal(calls[0].init.body.get('chat_id'), '42');
});

test('rejects foreign origin, bad phone, wrong route, preflight ok', async () => {
  mockTelegram();
  assert.equal((await worker.fetch(req(lead, { origin: 'https://evil.example', ip: 'c' }), env)).status, 403);
  assert.equal((await worker.fetch(req({ ...lead, phone: '123' }, { ip: 'd' }), env)).status, 400);
  assert.equal((await worker.fetch(req(lead, { path: '/x', ip: 'e' }), env)).status, 404);
  const pre = await worker.fetch(new Request('https://w.example/lead', { method: 'OPTIONS', headers: { origin: ORIGIN } }), env);
  assert.equal(pre.status, 204);
});

test('rate limit: 6th lead per minute from one IP is refused', async () => {
  mockTelegram();
  let last;
  for (let i = 0; i < 6; i++) last = await worker.fetch(req(lead, { ip: 'same' }), env);
  assert.equal(last.status, 429);
});

test('telegram failure → 502 so the page falls back to the deep link', async () => {
  globalThis.fetch = async () => new Response('bad', { status: 401 });
  const res = await worker.fetch(req(lead, { ip: 'f' }), env);
  assert.equal(res.status, 502);
});
