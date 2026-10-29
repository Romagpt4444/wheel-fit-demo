import { asset } from '../data';
import { $, esc, icon, price, toast } from '../lib/dom';
import { leadPreview } from '../lib/export';
import { chatLink, formatPhone, leadText, phoneValid, sendToWorker, type LeadPayload } from '../lib/lead';
import { loadImage } from '../render/images';
import { Stage } from '../render/stage';
import { go, type ScreenFn } from '../router';
import { OWN, currentCar, currentWheel, fitHash, picksText, ratioFor, sizeOf, state } from '../state';
import { topbar } from './common';

export const lead: ScreenFn = (root) => {
  const { brand } = state.data;
  const car = currentCar();
  const w = currentWheel();
  const d = state.diameter;
  const s = sizeOf(w, d);
  if (!car || !s) {
    go('cars');
    return;
  }
  const L = state.lead;
  if (!L.car && state.carId !== OWN) L.car = '';

  root.innerHTML = `
  ${topbar({ back: fitHash(), backLabel: 'Вернуться к примерке' })}
  <main class="page lead-page">
    <div class="page-head">
      <h1 class="title">Заявка на диски</h1>
      <p class="muted">Перезвоним, проверим сверловку и вылет под вашу машину и назовём итоговую цену с шиномонтажом.</p>
    </div>
    <div class="lead-grid">
      <aside class="lead-summary" aria-label="Выбранные диски">
        <canvas class="stage-canvas lead-canvas" role="img" aria-label="${esc(w.name)} R${d} на машине"></canvas>
        <div class="lead-summary-body">
          <p class="wheel-name">${esc(w.name)}, R${d}</p>
          <p class="muted small">${s.width}J, ET ${s.et}, ${esc(w.pcd.join(', ').replace(/x/g, '×'))}</p>
          <p><b>${price(s.price * 4)}</b> <span class="muted small">за комплект, ${price(s.price)} за диск</span></p>
          ${picksText().length ? `<p class="muted small">В подборке: ${esc(picksText().join(', '))}. Отправим вместе с заявкой</p>` : ''}
        </div>
      </aside>
      <form class="lead-form" novalidate>
        <label class="field">
          <span>Имя</span>
          <input name="name" autocomplete="given-name" required maxlength="60" value="${esc(L.name)}" placeholder="Как к вам обращаться">
          <em class="field-error" id="e-name"></em>
        </label>
        <label class="field">
          <span>Телефон</span>
          <input name="phone" type="tel" inputmode="tel" autocomplete="tel" required value="${esc(L.phone)}" placeholder="+7 (900) 000-00-00">
          <em class="field-error" id="e-phone"></em>
        </label>
        <label class="field">
          <span>Марка и модель <small class="muted">необязательно</small></span>
          <input name="car" autocomplete="off" maxlength="80" value="${esc(L.car)}" placeholder="Например, Kia K5 2023">
        </label>
        <label class="check">
          <input type="checkbox" name="consent" required>
          <span>Согласен на обработку персональных данных по <a href="${esc(asset(brand.policyUrl || 'privacy.html'))}" target="_blank" rel="noopener">политике конфиденциальности</a></span>
        </label>
        <em class="field-error" id="e-consent"></em>
        <button class="btn btn-primary btn-wide" type="submit">${icon('send')}<span>Отправить заявку</span></button>
        <p class="muted small">${brand.leads.workerUrl ? 'Заявка придёт менеджеру в Telegram вместе с картинкой примерки.' : brand.leads.channel === 'whatsapp' ? 'Откроется WhatsApp с готовым текстом заявки: останется нажать «Отправить».' : 'Откроется Telegram с готовым текстом заявки: останется нажать «Отправить».'}</p>
      </form>
    </div>
  </main>`;

  // preview of the fitting (also used as the JPEG attached to the lead)
  const canvas = $<HTMLCanvasElement>('canvas', root);
  const stage = new Stage(canvas);
  stage.background = brand.colors.stage;
  stage.caliper = brand.colors.caliper;
  const imgP = state.carId === OWN ? Promise.resolve(state.user!.img) : loadImage(asset(car.image));
  Promise.all([imgP, loadImage(asset(w.image))]).then(([img, rim]) => {
    stage.setScene({ img, width: car.width, height: car.height, spots: car.wheels, isUserPhoto: state.carId === OWN, floorReflection: car.floorReflection });
    stage.setRim({ key: w.id, img: rim, ratio: ratioFor(w, d) }, false);
  });

  const form = $<HTMLFormElement>('form', root);
  const phone = form.elements.namedItem('phone') as HTMLInputElement;
  const caretToEnd = () => phone.setSelectionRange(phone.value.length, phone.value.length);
  phone.addEventListener('input', () => {
    phone.value = formatPhone(phone.value);
    caretToEnd();
  });
  phone.addEventListener('focus', () => {
    if (!phone.value) phone.value = '+7';
    requestAnimationFrame(caretToEnd);
    caretToEnd();
  });

  const setError = (id: string, msg: string, input?: HTMLInputElement) => {
    $(`#${id}`, root).textContent = msg;
    input?.setAttribute('aria-invalid', String(!!msg));
    if (input) input.setAttribute('aria-describedby', id);
  };

  // errors disappear as soon as the field is fixed
  form.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    const map: Record<string, string> = { name: 'e-name', phone: 'e-phone', consent: 'e-consent' };
    const id = map[t.name];
    if (id) setError(id, '', t.type === 'checkbox' ? undefined : t);
  });

  let sending = false;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (sending) return;
    const fd = new FormData(form);
    const name = String(fd.get('name') || '').trim();
    const ph = String(fd.get('phone') || '');
    const carText = String(fd.get('car') || '').trim();
    const nameInput = form.elements.namedItem('name') as HTMLInputElement;
    setError('e-name', name.length < 2 ? 'Напишите имя, хотя бы две буквы' : '', nameInput);
    setError('e-phone', phoneValid(ph) ? '' : 'Нужен номер из 11 цифр, например +7 900 123-45-67', phone);
    setError('e-consent', fd.get('consent') ? '' : 'Без согласия мы не сможем перезвонить');
    const firstBad = form.querySelector<HTMLInputElement>('[aria-invalid="true"]') ?? (fd.get('consent') ? null : form.querySelector<HTMLInputElement>('[name="consent"]'));
    if (firstBad) {
      firstBad.focus();
      return;
    }
    state.lead = { name, phone: ph, car: carText };
    const pageUrl = location.href.split('#')[0] + (state.carId === OWN ? '' : fitHash());
    const payload: LeadPayload = {
      name,
      phone: ph,
      car: carText || (state.carId === OWN ? '' : car.name),
      wheel: w.name,
      diameter: d,
      pricePerWheel: s.price,
      priceSet: s.price * 4,
      pageUrl,
      picks: picksText(),
    };
    const text = leadText(payload, brand.name);
    const link = chatLink(brand, text, pageUrl);
    state.lastLeadLink = link;

    if (!brand.leads.workerUrl) {
      // deep link: must open synchronously inside the submit handler or popup blockers stop it
      window.open(link, '_blank', 'noopener');
      go('thanks', { via: 'link' });
      return;
    }
    sending = true;
    const btn = form.querySelector<HTMLButtonElement>('[type=submit]')!;
    btn.disabled = true;
    btn.lastElementChild!.textContent = 'Отправляем…';
    try {
      await sendToWorker(brand.leads.workerUrl, payload, await leadPreview(stage));
      go('thanks', { via: 'bot' });
    } catch {
      toast('Сервер заявок не ответил. Открываем Telegram с готовым текстом');
      window.open(link, '_blank', 'noopener');
      go('thanks', { via: 'link' });
    } finally {
      sending = false;
    }
  });

  return () => stage.destroy();
};
