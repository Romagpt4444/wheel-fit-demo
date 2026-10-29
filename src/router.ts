export type Cleanup = (() => void) | void;
export type ScreenFn = (root: HTMLElement, params: URLSearchParams) => Cleanup | Promise<Cleanup>;

const routes = new Map<string, ScreenFn>();
let cleanup: Cleanup;
let root: HTMLElement;

export function route(name: string, fn: ScreenFn): void {
  routes.set(name, fn);
}

export function parseHash(): { name: string; params: URLSearchParams } {
  const raw = location.hash.replace(/^#\/?/, '');
  const [name, query = ''] = raw.split('?');
  return { name: name || 'home', params: new URLSearchParams(query) };
}

export function go(name: string, params?: Record<string, string>): void {
  const q = params ? '?' + new URLSearchParams(params).toString() : '';
  const hash = `#/${name === 'home' ? '' : name}${q}`;
  if (location.hash === hash) render();
  else location.hash = hash;
}

async function render(): Promise<void> {
  const { name, params } = parseHash();
  const fn = routes.get(name) ?? routes.get('home')!;
  if (typeof cleanup === 'function') cleanup();
  cleanup = undefined;
  const screen = document.createElement('div');
  screen.className = `screen screen-${name}`;
  root.replaceChildren(screen);
  window.scrollTo(0, 0);
  cleanup = await fn(screen, params);
  const heading = screen.querySelector<HTMLElement>('h1');
  if (heading && document.activeElement === document.body) {
    heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
  }
}

export function startRouter(el: HTMLElement): void {
  root = el;
  window.addEventListener('hashchange', render);
  render();
}
