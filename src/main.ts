import '@fontsource/tenor-sans/cyrillic-400.css';
import '@fontsource/tenor-sans/latin-400.css';
import '@fontsource-variable/golos-text/wght.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/screens.css';

import { applyBrand, loadData } from './data';
import { route, startRouter } from './router';
import { cars } from './screens/cars';
import { fit } from './screens/fit';
import { home } from './screens/home';
import { lead } from './screens/lead';
import { markup } from './screens/markup';
import { thanks } from './screens/thanks';
import { initState } from './state';

async function boot() {
  const app = document.getElementById('app')!;
  try {
    const data = await loadData();
    applyBrand(data.brand);
    initState(data);
    route('home', home);
    route('cars', cars);
    route('markup', markup);
    route('fit', fit);
    route('lead', lead);
    route('thanks', thanks);
    startRouter(app);
  } catch (e) {
    app.innerHTML = `<main class="page"><h1 class="title">Не удалось загрузить примерку</h1><p class="muted">${(e as Error).message}. Обновите страницу.</p></main>`;
    console.error(e);
  }
}

boot();
