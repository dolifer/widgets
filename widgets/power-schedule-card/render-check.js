// Layout check, run by tests/render.mjs in the browser after every render:
// a function of the card element returning problems as strings.
// Text must clear the diagonal seam and the arrow by GAP px, and nothing
// may be cut off with an ellipsis.
(card) => {
  const GAP = 3;
  const root = card.shadowRoot;
  const split = root.querySelector('.split');
  if (!split) return ['no .split'];
  const R = split.getBoundingClientRect();
  const cs = getComputedStyle(split);
  // Stacked: --seam-l / --seam-r are the seam's height at the left and right
  // edge. Horizontal (.h): --seam-t / --seam-b are its x at the top and bottom.
  const horiz = split.classList.contains('h');
  const at = (v, size) => { v = v.trim(); return v.endsWith('%') ? size * parseFloat(v) / 100 : parseFloat(v); };
  const yl = at(cs.getPropertyValue('--seam-l') || '60%', R.height), yr = at(cs.getPropertyValue('--seam-r') || '40%', R.height);
  const xt = at(cs.getPropertyValue('--seam-t') || '58%', R.width), xb = at(cs.getPropertyValue('--seam-b') || '46%', R.width);
  const seamY = (x) => R.top + yl + (yr - yl) * (x - R.left) / R.width;
  const seamX = (y) => R.left + xt + (xb - xt) * (y - R.top) / R.height;
  // How far a box reaches past the seam: >0 means it crosses, toward "next" for
  // a "now" box (side 1) or toward "now" for a "next" box (side -1).
  const past = (r, side) => horiz
    ? (side > 0 ? Math.max(r.right - seamX(r.top), r.right - seamX(r.bottom)) : Math.max(seamX(r.top) - r.left, seamX(r.bottom) - r.left))
    : (side > 0 ? Math.max(r.bottom - seamY(r.left), r.bottom - seamY(r.right)) : Math.max(seamY(r.left) - r.top, seamY(r.right) - r.top));
  // The ink of an element: its text's box, not the block's full width.
  const ink = (el) => {
    if (el.classList.contains('ic')) return el.getBoundingClientRect();
    const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect();
  };
  const items = (sel) => [...root.querySelectorAll(sel)].filter((e) => e.classList.contains('ic') || e.textContent.trim());
  const name = (e) => e.classList.contains('ic') ? 'icon' : `"${e.textContent.trim()}"`;
  const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  const out = [];
  const next = root.querySelector('.next');
  const seam = root.querySelector('.seam')?.getBoundingClientRect();
  const nowItems = items('.now .lbl, .now strong, .now .sub, .now .ic, .now .why');
  const nextItems = next ? items('.next .lbl, .next strong, .next .sub, .next .when, .next .ic') : [];
  for (const e of nowItems) {
    const r = ink(e);
    if (next && past(r, 1) > -GAP) out.push(`now ${name(e)} reaches the seam`);
  }
  for (const e of nextItems) {
    const r = ink(e);
    if (past(r, -1) > -GAP) out.push(`next ${name(e)} reaches the seam`);
  }
  if (seam) {
    const s = { left: seam.left - GAP, right: seam.right + GAP, top: seam.top - GAP, bottom: seam.bottom + GAP };
    for (const e of [...nowItems, ...nextItems]) if (hit(ink(e), s)) out.push(`${name(e)} touches the arrow`);
  }
  for (const e of [...nowItems, ...nextItems]) {
    const r = ink(e);
    if (r.left < R.left || r.right > R.right || r.top < R.top || r.bottom > R.bottom) out.push(`${name(e)} spills out of the card`);
    if (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1) out.push(`${name(e)} is cut off`);
  }
  const when = root.querySelector('.next .when');
  if (when) for (const e of items('.next .nx > *, .next .ic')) if (hit(ink(e), ink(when))) out.push(`${name(e)} overlaps the time`);
  // The reason tag sits clear of the title and the duration.
  const why = root.querySelector('.now .why');
  if (why && !why.closest('.lbl')) for (const t of items('.now .lbl, .now strong, .now .sub')) if (hit(why.getBoundingClientRect(), ink(t))) out.push(`reason tag overlaps ${name(t)}`);
  // Centred or right-aligned, the reason tag lines up with the text: it sits
  // within the title's left and right edges, not out in the corner.
  const title = root.querySelector('.now strong');
  if (why && title && !split.classList.contains('al-left')) {
    const w = why.getBoundingClientRect(), t = ink(title);
    if (w.left < t.left - 1 && w.right > t.right + 1 ? false : w.right > t.right + 40 || w.left < t.left - 40) out.push('reason tag is not aligned with the text');
  }
  // Each icon sits beside its text, not on it.
  for (const half of ['.now', '.next']) {
    const a = root.querySelector(`${half} .ic`);
    if (a) for (const t of items(`${half} .lbl, ${half} strong, ${half} .sub, ${half} .when, ${half} .why`)) {
      if (hit(a.getBoundingClientRect(), ink(t))) out.push(`${half} icon overlaps ${name(t)}`);
    }
  }
  // Reading order holds: label above the title above the duration. Side by
  // side, the icon sits level with or above the label, within 8 px of it
  // (stacked, it sits beside the whole block instead).
  for (const half of ['.now', '.next']) {
    const [lbl, title, sub] = ['.lbl', 'strong', '.sub'].map((s) => root.querySelector(`${half} ${s}`));
    if (lbl && title && ink(title).top < ink(lbl).bottom - 1) out.push(`${half} title is above its label`);
    if (title && sub && sub.textContent.trim() && ink(sub).top < ink(title).bottom - 1) out.push(`${half} duration is above its title`);
    const a = root.querySelector(`${half} .ic`);
    if (horiz && a && lbl) {
      const r = a.getBoundingClientRect(), l = ink(lbl);
      if (r.top > l.bottom) out.push(`${half} icon is below its label`);
      const gap = Math.max(l.left - r.right, r.left - l.right, l.top - r.bottom, 0);
      if (gap > 8) out.push(`${half} icon is ${Math.round(gap)} px from its label`);
    }
  }
  return out;
}
