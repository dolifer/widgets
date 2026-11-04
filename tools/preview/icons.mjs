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
