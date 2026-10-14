/* Small DOM helpers. Authored copy is always inserted as text, never as HTML. */

/**
 * Creates an element. attrs: class, text, on<Event> handlers, data-*, aria-*, boolean props.
 * Children may be nodes, strings, arrays or falsy (skipped).
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  Object.entries(attrs || {}).forEach(([k, v]) => {
    if (v === undefined || v === null || v === false) return;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in el && typeof v === 'boolean') el[k] = v;
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  });
  children.flat(Infinity).forEach((c) => {
    if (c === undefined || c === null || c === false) return;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  });
  return el;
}

const LINK_RE = /\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g;

/** Renders authored text with [label](https://...) links as safe anchors. */
export function rich(text = '') {
  const frag = document.createDocumentFragment();
  let last = 0;
  String(text).replace(LINK_RE, (match, label, href, offset) => {
    frag.append(text.slice(last, offset));
    frag.append(h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, label));
    last = offset + match.length;
    return match;
  });
  frag.append(String(text).slice(last));
  return frag;
}

/** Replaces {name} placeholders. */
export const fmt = (text, vars = {}) => String(text).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));

/** A toggle button with aria-pressed. */
export function chip(label, pressed, onClick, extra = {}) {
  return h('button', {
    type: 'button', class: `gd-chip${pressed ? ' is-on' : ''}${extra.class ? ` ${extra.class}` : ''}`, 'aria-pressed': pressed ? 'true' : 'false', onClick, ...extra.attrs,
  }, label);
}
