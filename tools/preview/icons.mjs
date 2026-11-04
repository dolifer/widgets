// Small line icons for option chips: `icon: <name>` on a value in widget.yaml.
// 24×24, drawn with currentColor so they follow the chip's text colour.
const frame = '<rect x="3" y="4" width="18" height="16" rx="2.5"/>';
export const ICONS = {
  'stack-vertical': `${frame}<path d="M3 12h18"/>`,
  'stack-horizontal': `${frame}<path d="M12 4v16"/>`,
  'align-left': '<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>',
  'align-center': '<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>',
  'align-right': '<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>',
  'valign-top': '<path d="M4 4h16"/><rect x="8" y="7.5" width="8" height="7" rx="1.5"/>',
  'valign-center': '<path d="M3 12h5M16 12h5"/><rect x="8" y="8.5" width="8" height="7" rx="1.5"/>',
  'valign-bottom': '<path d="M4 20h16"/><rect x="8" y="9.5" width="8" height="7" rx="1.5"/>',
  show: '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  hide: '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="M4 4l16 16"/>',
  'line-rise': `${frame}<path d="M3 15l18-6"/>`,
  'line-fall': `${frame}<path d="M3 9l18 6"/>`,
  'line-straight': `${frame}<path d="M3 12h18"/>`,
};
export const icon = (name) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

// The GitHub mark, filled, for the pages' source links (not a chip icon).
export const github = `<svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>`;
