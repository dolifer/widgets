// Just enough Home Assistant for a custom card to render outside it: a fake
// clock, an <ha-card>, the theme variables and a hass object.

// ── clock ────────────────────────────────────────────────────────────────────
// Cards read the time with Date.now() and new Date(). Both answer the preview
// clock, so a card counts down as the slider moves. Install before loading a card.
const RealDate = Date;
let current = RealDate.now();
class PreviewDate extends RealDate {
  constructor(...args) { if (args.length) super(...args); else super(current); }
  static now() { return current; }
}
export const clock = {
  install() { globalThis.Date = PreviewDate; },
  set(t) { current = t; },
  get() { return current; },
  realNow: () => RealDate.now(),
};

// ── <ha-card> ────────────────────────────────────────────────────────────────
if (!customElements.get('ha-card')) {
  customElements.define('ha-card', class extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' }).innerHTML = `<style>
        :host { display:block; position:relative; box-sizing:border-box; color:var(--primary-text-color);
          background:var(--ha-card-background, var(--card-background-color)); border-radius:var(--ha-card-border-radius, 12px);
          border:1px solid var(--ha-card-border-color, var(--divider-color)); box-shadow:var(--ha-card-box-shadow, none);
          font-family:var(--paper-font-body1_-_font-family, Roboto, system-ui, sans-serif) }
      </style><slot></slot>`;
    }
  });
}

// ── themes ───────────────────────────────────────────────────────────────────
// The default HA theme's main variables, dark and light.
export const THEMES = {
  dark: {
    '--primary-background-color': '#111111', '--secondary-background-color': '#282828',
    '--card-background-color': '#1c1c1c', '--ha-card-background': '#1c1c1c', '--ha-card-border-color': 'rgba(225,225,225,.12)',
    '--primary-text-color': '#e1e1e1', '--secondary-text-color': '#9b9b9b', '--disabled-text-color': '#6f6f6f',
    '--divider-color': 'rgba(225,225,225,.12)', '--primary-color': '#03a9f4', '--accent-color': '#ff9800',
    '--state-icon-color': '#44739e', '--error-color': '#db4437', '--warning-color': '#ffa600', '--success-color': '#43a047',
  },
  light: {
    '--primary-background-color': '#fafafa', '--secondary-background-color': '#e5e5e5',
    '--card-background-color': '#ffffff', '--ha-card-background': '#ffffff', '--ha-card-border-color': '#e0e0e0',
    '--primary-text-color': '#212121', '--secondary-text-color': '#727272', '--disabled-text-color': '#bdbdbd',
    '--divider-color': 'rgba(0,0,0,.12)', '--primary-color': '#03a9f4', '--accent-color': '#ff9800',
    '--state-icon-color': '#44739e', '--error-color': '#db4437', '--warning-color': '#ffa600', '--success-color': '#43a047',
  },
};

export function applyTheme(el, name) {
  for (const [k, v] of Object.entries(THEMES[name] || THEMES.dark)) el.style.setProperty(k, v);
  el.style.background = 'var(--primary-background-color)';
  el.dataset.theme = name;
}

// ── hass ─────────────────────────────────────────────────────────────────────
export function makeHass({ states, language, theme, onService }) {
  return {
    states,
    language,
    locale: { language, number_format: 'language', time_format: '24' },
    themes: { darkMode: theme === 'dark', theme: 'default' },
    selectedTheme: null,
    user: { name: 'Preview', is_admin: true },
    config: { time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone, unit_system: { temperature: '°C' } },
    entities: {}, devices: {}, areas: {},
    callService: (domain, service, data) => { onService?.(`${domain}.${service}`, data); return Promise.resolve(); },
    callWS: () => Promise.resolve([]),
    callApi: () => Promise.resolve({}),
    connection: { subscribeMessage: () => Promise.resolve(() => {}), subscribeEvents: () => Promise.resolve(() => {}) },
    localize: (k) => k,
    formatEntityState: (s) => s?.state ?? '',
  };
}

// Loads a card script once. Resolves when its custom element is defined.
const loaded = new Map();
export function loadCard(src, tag) {
  if (!loaded.has(src)) {
    loaded.set(src, new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.type = 'module';
      s.src = src;
      s.onerror = () => reject(new Error(`could not load ${src}`));
      document.head.appendChild(s);
    }));
    loaded.get(src).catch(() => {});
  }
  return Promise.race([
    customElements.whenDefined(tag),
    loaded.get(src),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${src} did not define <${tag}>`)), 5000)),
  ]);
}
