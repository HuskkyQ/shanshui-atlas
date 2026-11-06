const STORAGE_KEY = 'atlas-theme';
const NAMES = { celadon: '湖青晨雾', inkstone: '砚墨朱砂' };
const root = document.documentElement;

function alternate(theme) {
  return theme === 'inkstone' ? 'celadon' : 'inkstone';
}

function syncToggle(button) {
  const theme = root.dataset.atlasTheme;
  const current = NAMES[theme];
  const next = NAMES[alternate(theme)];
  button.querySelector('.atlas-theme-name').textContent = current;
  button.title = `切换为${next}`;
  button.setAttribute('aria-label', `主题：${current}，切换为${next}`);
}

function applyTheme(theme) {
  if (root.dataset.atlasTheme === theme) return;
  root.dataset.atlasTheme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  meta.content = getComputedStyle(root).getPropertyValue('--startup-paper').trim();
  document.querySelectorAll('.atlas-theme-toggle').forEach(syncToggle);
  window.dispatchEvent(new Event('atlas-theme-change'));
}

export function mountThemeToggle(container) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'atlas-theme-toggle';
  button.innerHTML =
    '<span class="atlas-theme-swatch" aria-hidden="true"></span><span class="atlas-theme-name"></span>';
  syncToggle(button);
  button.addEventListener('click', () => {
    const theme = alternate(root.dataset.atlasTheme);
    applyTheme(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // The selected theme is already applied for this page.
    }
  });
  container.prepend(button);
}

function applyStoredTheme() {
  let theme;
  try {
    theme = localStorage.getItem(STORAGE_KEY);
  } catch {
    return;
  }
  applyTheme(theme === 'inkstone' ? 'inkstone' : 'celadon');
}

window.addEventListener('pageshow', (event) => {
  if (event.persisted) applyStoredTheme();
});
window.addEventListener('storage', (event) => {
  if (event.key === STORAGE_KEY || event.key === null) applyStoredTheme();
});
