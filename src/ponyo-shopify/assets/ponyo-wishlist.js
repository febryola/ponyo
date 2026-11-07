/* Ponyo wishlist: saves product handles in this browser and keeps every heart,
   the header count and the wishlist page in sync. */
const KEY = 'ponyo:wishlist';

function read() {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(value) ? value.filter((h) => typeof h === 'string') : [];
  } catch {
    return [];
  }
}

function write(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage unavailable */ }
  document.dispatchEvent(new CustomEvent('ponyo:wishlist-change', { detail: { list } }));
}

function paint() {
  const list = read();
  document.querySelectorAll('[data-wishlist-toggle]').forEach((button) => {
    const saved = list.includes(button.dataset.wishlistToggle) ? 'true' : 'false';
    if (button.getAttribute('aria-pressed') !== saved) button.setAttribute('aria-pressed', saved);
  });
  document.querySelectorAll('[data-wishlist-count]').forEach((badge) => {
    const count = String(list.length);
    if (badge.textContent !== count) badge.textContent = count;
    const hide = list.length === 0;
    if (badge.hidden !== hide) badge.hidden = hide;
  });
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-wishlist-toggle]');
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  const handle = button.dataset.wishlistToggle;
  const list = read();
  const index = list.indexOf(handle);
  if (index === -1) list.unshift(handle); else list.splice(index, 1);
  write(list);
  button.animate?.([{ transform: 'scale(1)' }, { transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 300, easing: 'ease-out' });
});

document.addEventListener('ponyo:wishlist-change', paint);
window.addEventListener('storage', (event) => { if (event.key === KEY) paint(); });
let paintQueued = false;
new MutationObserver(() => {
  if (paintQueued) return;
  paintQueued = true;
  requestAnimationFrame(() => { paintQueued = false; paint(); });
}).observe(document.body, { childList: true, subtree: true });
paint();

/* Wishlist page */
const page = document.querySelector('[data-wishlist-page]');
if (page) {
  const grid = page.querySelector('[data-wishlist-grid]');
  const empty = page.querySelector('[data-wishlist-empty]');
  const template = page.querySelector('template[data-wishlist-card]');
  const locale = document.documentElement.lang || 'en';
  const currency = window.Shopify?.currency?.active || page.dataset.currency || 'JPY';
  const money = (cents) => {
    const digits = new Intl.NumberFormat(locale, { style: 'currency', currency }).resolvedOptions().maximumFractionDigits;
    return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: digits }).format(cents / 100);
  };
  const render = async () => {
    const list = read();
    empty.hidden = list.length > 0;
    grid.hidden = list.length === 0;
    grid.replaceChildren();
    const root = window.Shopify?.routes?.root || '/';
    const products = await Promise.all(list.map(async (handle) => {
      try {
        const response = await fetch(root + 'products/' + encodeURIComponent(handle) + '.js');
        return response.ok ? await response.json() : null;
      } catch { return null; }
    }));
    products.filter(Boolean).forEach((product) => {
      const node = template.content.firstElementChild.cloneNode(true);
      node.querySelectorAll('[data-link]').forEach((a) => { a.href = product.url; });
      const img = node.querySelector('[data-image]');
      if (product.featured_image) {
        const src = product.featured_image.startsWith('//') ? 'https:' + product.featured_image : product.featured_image;
        img.src = src + (src.includes('?') ? '&' : '?') + 'width=600';
        img.alt = product.title;
      } else img.remove();
      node.querySelector('[data-title]').textContent = product.title;
      node.querySelector('[data-price]').textContent = money(product.price);
      const compare = node.querySelector('[data-compare]');
      if (product.compare_at_price > product.price) compare.textContent = money(product.compare_at_price); else compare.remove();
      if (!product.available) node.querySelector('[data-soldout]').hidden = false;
      node.querySelector('[data-wishlist-toggle]').dataset.wishlistToggle = product.handle;
      grid.append(node);
    });
    paint();
  };
  document.addEventListener('ponyo:wishlist-change', (event) => {
    if (event.detail?.list && event.detail.list.length < grid.children.length) render();
  });
  render();
}

/* Recently viewed: record product pages and fill [data-recently-viewed] strips. */
const RECENT_KEY = 'ponyo:recent';
const readRecent = () => {
  try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
};
const record = document.querySelector('[data-recently-viewed-record]');
if (record) {
  const handle = record.dataset.recentlyViewedRecord;
  const list = readRecent().filter((h) => h !== handle);
  list.unshift(handle);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 12))); } catch { /* storage unavailable */ }
}
document.querySelectorAll('[data-recently-viewed]').forEach(async (section) => {
  const exclude = section.dataset.exclude;
  const handles = readRecent().filter((h) => h && h !== exclude).slice(0, 10);
  if (!handles.length) return;
  const listEl = section.querySelector('[data-recently-viewed-list]');
  const template = section.querySelector('template[data-recently-viewed-card]');
  const locale = document.documentElement.lang || 'en';
  const currency = window.Shopify?.currency?.active || section.dataset.currency || 'JPY';
  const format = (cents) => new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100);
  const root = window.Shopify?.routes?.root || '/';
  const products = await Promise.all(handles.map(async (h) => {
    try { const r = await fetch(root + 'products/' + encodeURIComponent(h) + '.js'); return r.ok ? await r.json() : null; } catch { return null; }
  }));
  products.filter(Boolean).forEach((product) => {
    const node = template.content.firstElementChild.cloneNode(true);
    node.querySelectorAll('[data-link]').forEach((a) => { a.href = product.url; });
    const img = node.querySelector('[data-image]');
    if (product.featured_image) {
      const src = product.featured_image.startsWith('//') ? 'https:' + product.featured_image : product.featured_image;
      img.src = src + (src.includes('?') ? '&' : '?') + 'width=400';
    } else img.remove();
    node.querySelector('[data-title]').textContent = product.title;
    node.querySelector('[data-price]').textContent = format(product.price);
    node.querySelector('[data-wishlist-toggle]').dataset.wishlistToggle = product.handle;
    listEl.append(node);
  });
  if (listEl.children.length) { section.hidden = false; paint(); }
});
