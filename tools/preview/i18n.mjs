// The preview site's own text, by language: English source → translation.
// Text from a widget (its name, options, states) lives in widgets/<id>/i18n.yaml.
// A missing entry shows the English text; tests/build.test.mjs checks that
// every t('…') in the page scripts has an entry here.
export const PAGE = {
  uk: {
    'All widgets': 'Усі віджети',
    'Download': 'Завантажити',
    'Theme': 'Тема',
    'Dark': 'Темна',
    'Light': 'Світла',
    'Language': 'Мова',
    'Width': 'Ширина',
    'Phone': 'Телефон',
    'Card': 'Картка',
    'Wide': 'Широко',
    'Reset options': 'Скинути',
    'States': 'Стани',
    'Play': 'Грати',
    'Pause': 'Пауза',
    'Preview clock': 'Час перегляду',
    'Reset': 'Скинути',
    'start': 'початок',
    'Start': 'Початок',
    'No timeline in this state: move the clock to watch countdowns tick.': 'У цьому стані подій немає: посуньте час, щоб побачити відлік.',
    'Card config': 'Налаштування картки',
    'Copy': 'Копіювати',
    'Entities now': 'Сутності зараз',
    'config copied': 'налаштування скопійовано',
    'copy failed: select the text instead': 'не вдалося скопіювати: виділіть текст',
    '{m} min': '{m} хв',
    '{h} h {m} min': '{h} г {m} хв',
    '{d} d': '{d} д',
    'Widgets': 'Віджети',
    'Home Assistant cards. Open one to play through its states.': 'Картки для Home Assistant. Відкрийте будь-яку, щоб програти її стани.',
    '{n} states': 'станів: {n}',
  },
};

// t(text, vars): the page text in `lang`, then the widget's, then English.
export function translator(lang, widgetI18n = {}) {
  const page = PAGE[lang] || {}, own = widgetI18n[lang] || {};
  return (text, vars = {}) => {
    const k = String(text ?? '').trim();
    const s = page[k] ?? own[k] ?? k;
    return s.replace(/\{(\w+)\}/g, (m, v) => (v in vars ? vars[v] : m));
  };
}

// The language and theme a visitor last picked, shared by every page of the site.
export const remembered = {
  get(k) { try { return localStorage.getItem(`widgets.${k}`); } catch { return null; } },
  set(k, v) { try { if (v == null) localStorage.removeItem(`widgets.${k}`); else localStorage.setItem(`widgets.${k}`, v); } catch { /* private mode */ } },
};
