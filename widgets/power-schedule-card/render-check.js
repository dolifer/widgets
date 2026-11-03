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
  // --seam-l / --seam-r: the seam's height at the left and right edge, px or %.
  const at = (v) => { v = v.trim(); return v.endsWith('%') ? R.height * parseFloat(v) / 100 : parseFloat(v); };
  const yl = at(cs.getPropertyValue('--seam-l') || '60%'), yr = at(cs.getPropertyValue('--seam-r') || '40%');
  const seamY = (x) => R.top + yl + (yr - yl) * (x - R.left) / R.width;
  // The ink of an element: its text's box, not the block's full width.
  const ink = (el) => {
    if (el.tagName.toLowerCase() === 'svg') return el.getBoundingClientRect();
    const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect();
  };
  const items = (sel) => [...root.querySelectorAll(sel)].filter((e) => e.tagName.toLowerCase() === 'svg' || e.textContent.trim());
  const name = (e) => e.tagName.toLowerCase() === 'svg' ? 'icon' : `"${e.textContent.trim()}"`;
  const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  const out = [];
  const next = root.querySelector('.next');
  const seam = root.querySelector('.seam')?.getBoundingClientRect();
  const nowItems = items('.now .lbl, .now strong, .now .sub, .now svg');
  const nextItems = next ? items('.next .lbl, .next strong, .next .sub, .next .when') : [];
  for (const e of nowItems) {
    const r = ink(e);
    if (next && Math.max(r.bottom - seamY(r.left), r.bottom - seamY(r.right)) > -GAP) out.push(`now ${name(e)} reaches the seam`);
  }
  for (const e of nextItems) {
    const r = ink(e);
    if (Math.max(seamY(r.left) - r.top, seamY(r.right) - r.top) > -GAP) out.push(`next ${name(e)} reaches the seam`);
  }
  if (seam) {
    const s = { left: seam.left - GAP, right: seam.right + GAP, top: seam.top - GAP, bottom: seam.bottom + GAP };
    for (const e of [...nowItems, ...nextItems]) if (hit(ink(e), s)) out.push(`${name(e)} touches the arrow`);
  }
  for (const e of [...nowItems, ...nextItems]) {
    const r = ink(e);
    if (r.left < R.left || r.right > R.right || r.top < R.top || r.bottom > R.bottom) out.push(`${name(e)} spills out of the card`);
    if (e.scrollWidth > e.clientWidth + 1) out.push(`${name(e)} is cut off`);
  }
  const when = root.querySelector('.next .when');
  if (when) for (const e of items('.next .nx > *')) if (hit(ink(e), ink(when))) out.push(`${name(e)} overlaps the time`);
  return out;
}
