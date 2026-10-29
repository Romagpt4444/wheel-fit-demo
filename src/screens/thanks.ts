import { esc, icon } from '../lib/dom';
import { chatLink } from '../lib/lead';
import type { ScreenFn } from '../router';
import { fitHash, state } from '../state';
import { topbar } from './common';

export const thanks: ScreenFn = (root, params) => {
  const { brand } = state.data;
  const viaLink = params.get('via') === 'link';
  const name = state.lead.name;
  const chat = brand.leads.channel === 'whatsapp' ? 'WhatsApp' : 'Telegram';
  const writeLink = viaLink && state.lastLeadLink ? state.lastLeadLink : chatLink(brand, `Здравствуйте! Вопрос по дискам из примерки ${brand.name}.`);

  root.innerHTML = `
  ${topbar()}
  <main class="page thanks">
    <div class="thanks-mark" aria-hidden="true">${icon('check', 34)}</div>
    <h1 class="display-sm">${esc(name ? `${name}, ${brand.texts.thanksTitle.toLowerCase()}` : brand.texts.thanksTitle)}</h1>
    <p class="lead">${esc(brand.texts.thanksText)}</p>
    ${viaLink ? `<p class="muted note">Если ${chat} не открылся сам, нажмите «Написать в ${chat}»: текст заявки уже вставлен.</p>` : ''}
    <div class="thanks-actions">
      <a class="btn btn-ghost" href="${fitHash()}">Примерить другие</a>
      <a class="btn btn-primary" href="${esc(writeLink)}" target="_blank" rel="noopener">${icon('send')}<span>Написать в ${chat}</span></a>
    </div>
    ${brand.contacts.phone ? `<p class="muted small">Или позвоните: <a href="tel:${esc(brand.contacts.phone.replace(/[^\d+]/g, ''))}">${esc(brand.contacts.phone)}</a></p>` : ''}
  </main>`;
};
