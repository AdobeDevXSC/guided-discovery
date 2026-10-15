/*
 * Question widgets shared by the inline section and the guided overlay: answer tiles, selectable
 * cards and the stop slider (with optional journey / clock / signal gauge). Ported from the live
 * Guided Discovery app; every widget reports changes through the callbacks it is given.
 */
import { h } from '../guided-discovery/lib/dom.js';

export const isSingle = (q) => /-single$/.test(q.display || '') || q.display === 'slider';
export const fmt = (text, vars) => String(text || '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));

/** Tiles (chips displays): a grid of large buttons with a check mark. */
export function tiles(q, picked, toggle, labels) {
  const single = isSingle(q);
  return h(
    'div',
    { class: 'gd-q' },
    h('p', { class: 'gd-q-hint', text: single ? labels.selectOne : labels.selectAll }),
    h('div', { class: 'gd-tiles', role: single ? 'radiogroup' : 'group' }, (q.options || []).map((o) => {
      const on = picked.includes(o.id);
      return h('button', {
        type: 'button',
        class: `gd-tile${on ? ' is-on' : ''}`,
        role: single ? 'radio' : undefined,
        'aria-checked': single ? String(on) : undefined,
        'aria-pressed': single ? undefined : String(on),
        onClick: () => toggle(o.id),
      }, h('span', { class: 'gd-tile-check', 'aria-hidden': 'true', text: '✓' }), o.label);
    })),
  );
}

/** Selectable cards with the analysis / activation / both color strip. */
export function cards(q, options, picked, toggle) {
  const single = isSingle(q);
  return h('div', { class: 'gd-cards', role: single ? 'radiogroup' : 'group' }, options.map((o) => {
    const on = picked.includes(o.id);
    return h(
      'button',
      {
        type: 'button',
        class: `gd-card${on ? ' is-on' : ''}${o.bucket ? ` gd-bucket-${o.bucket}` : ''}`,
        role: single ? 'radio' : undefined,
        'aria-checked': single ? String(on) : undefined,
        'aria-pressed': single ? undefined : String(on),
        onClick: () => toggle(o.id),
      },
      h('span', { class: 'gd-card-top' }, h('strong', { text: o.label }), single ? null : h('span', { class: 'gd-card-check', 'aria-hidden': 'true', text: '✓' })),
      o.description && h('span', { class: 'gd-card-desc', text: o.description }),
    );
  }));
}

// ---------- slider ----------
const INSET = 11; // half the thumb width: keeps the thumb inside the track at both ends
const pos = (ratio) => `calc(${INSET}px + (100% - ${INSET * 2}px) * ${ratio.toFixed(4)})`;
const width = (ratio) => `calc((100% - ${INSET * 2}px) * ${ratio.toFixed(4)})`;
const SVG_NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs) => {
  const el = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  return el;
};

/** Gauge graphic that reacts to the slider position; returns { el, update(idx) }. */
function gauge(type, stopsLen) {
  if (type === 'journey') {
    const svg = svgEl('svg', { viewBox: '0 0 60 60', class: 'gd-gauge-svg', 'aria-hidden': 'true' });
    const ring = svgEl('circle', {
      cx: 30, cy: 30, r: 24, fill: 'none', 'stroke-width': 3,
    });
    const head = svgEl('circle', {
      cx: 30, cy: 22, r: 7, fill: 'none', 'stroke-width': 3,
    });
    const body = svgEl('path', { d: 'M 18 44 Q 30 28 42 44', fill: 'none', 'stroke-width': 3 });
    svg.append(ring, head, body);
    return {
      el: svg,
      update(idx) {
        const opacity = (0.25 + (idx / (stopsLen - 1)) * 0.75).toFixed(2);
        [ring, head, body].forEach((n) => n.setAttribute('opacity', opacity));
        ring.setAttribute('stroke-dasharray', idx === stopsLen - 1 ? 'none' : '5,4');
      },
    };
  }
  if (type === 'clock') {
    const svg = svgEl('svg', { viewBox: '0 0 60 60', class: 'gd-gauge-svg', 'aria-hidden': 'true' });
    svg.append(svgEl('circle', {
      cx: 30, cy: 30, r: 26, fill: 'none', class: 'gd-gauge-dial', 'stroke-width': 3,
    }));
    const hand = svgEl('line', {
      x1: 30, y1: 30, x2: 30, y2: 10, 'stroke-width': 3, 'stroke-linecap': 'round', class: 'gd-gauge-hand',
    });
    svg.append(hand, svgEl('circle', { cx: 30, cy: 30, r: 3 }));
    return {
      el: svg,
      update(idx) {
        const rad = ((-90 + idx * (180 / (stopsLen - 1))) * Math.PI) / 180;
        hand.setAttribute('x2', (30 + 20 * Math.cos(rad)).toFixed(1));
        hand.setAttribute('y2', (30 + 20 * Math.sin(rad)).toFixed(1));
      },
    };
  }
  if (type === 'signal') {
    const bars = Array.from({ length: stopsLen }, (_, i) => h('span', { class: 'gd-gauge-bar', style: `height:${16 + i * 10}px` }));
    return {
      el: h('div', { class: 'gd-gauge-signal', 'aria-hidden': 'true' }, bars),
      update(idx) { bars.forEach((b, i) => b.classList.toggle('is-on', i <= idx)); },
    };
  }
  return null;
}

/**
 * Stop slider: the first sliderStops options are points on a track, the rest are separate chips.
 * choose(optionId | null) commits an answer (single choice).
 */
export function slider(q, picked, choose, labels) {
  const opts = q.options || [];
  const n = Math.min(Math.max(q.sliderStops || opts.length, 2), opts.length);
  const stops = opts.slice(0, n);
  const escapes = opts.slice(n);
  const current = picked[0] || null;
  const stopIdx = stops.findIndex((o) => o.id === current);
  const answered = stopIdx >= 0;
  let idx = answered ? stopIdx : Math.floor((stops.length - 1) / 2);
  const ratio = (i) => i / (stops.length - 1);

  const fill = h('span', { class: 'gd-slider-fill' });
  const thumb = h('span', { class: 'gd-slider-thumb' });
  const track = h('span', { class: 'gd-slider-track' }, fill, stops.map((s, i) => h('span', { class: 'gd-slider-tick', style: `left:${pos(ratio(i))}` })), thumb);
  const caption = h('p', { class: 'gd-slider-caption' });
  const g = gauge(q.gauge, stops.length);
  const hit = h('div', {
    class: 'gd-slider-hit',
    role: 'slider',
    tabindex: '0',
    'aria-label': q.title,
    'aria-valuemin': '0',
    'aria-valuemax': String(stops.length - 1),
  }, track);
  const wrap = h(
    'div',
    { class: `gd-slider${answered ? '' : ' is-unanswered'}` },
    g && h('div', { class: 'gd-gauge' }, g.el),
    hit,
    h('div', { class: 'gd-slider-labels' }, stops.map((s, i) => {
      let style = `left:${pos(ratio(i))};transform:translateX(-50%);text-align:center`;
      if (i === 0) style = `left:${INSET}px;text-align:left`;
      if (i === stops.length - 1) style = `left:calc(100% - ${INSET}px);transform:translateX(-100%);text-align:right`;
      return h('span', { style, text: s.label });
    })),
    caption,
    escapes.length ? h('div', { class: 'gd-slider-escapes' }, escapes.map((o) => h('button', {
      type: 'button',
      class: `gd-escape${current === o.id ? ' is-on' : ''}`,
      'aria-pressed': String(current === o.id),
      onClick: () => choose(current === o.id ? null : o.id),
      text: o.label,
    }))) : null,
  );

  const paint = (i, isAnswered) => {
    thumb.style.left = pos(ratio(i));
    fill.style.width = width(ratio(i));
    hit.setAttribute('aria-valuenow', String(i));
    hit.setAttribute('aria-valuetext', stops[i].label);
    if (g) g.update(i);
    // answered: that stop's caption; an escape chip picked: no caption; otherwise the drag hint
    let text = labels.sliderHint;
    if (isAnswered) text = stops[i].caption || stops[i].label;
    else if (current) text = '';
    caption.textContent = text;
    wrap.classList.toggle('is-unanswered', !isAnswered);
  };
  paint(idx, answered);

  const idxFromEvent = (e) => {
    const rect = track.getBoundingClientRect();
    const usable = rect.width - INSET * 2;
    let pct = usable > 0 ? (e.clientX - rect.left - INSET) / usable : 0;
    pct = Math.max(0, Math.min(1, pct));
    if (pct <= 0.03) return 0;
    if (pct >= 0.97) return stops.length - 1;
    return Math.round(pct * (stops.length - 1));
  };
  hit.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    hit.focus();
    // capture keeps the drag going outside the track; it can throw for synthetic pointers
    try {
      hit.setPointerCapture(e.pointerId);
    } catch (err) { /* drag still works over the track */ }
    idx = idxFromEvent(e);
    paint(idx, true);
    const move = (ev) => { idx = idxFromEvent(ev); paint(idx, true); };
    const up = () => {
      hit.removeEventListener('pointermove', move);
      hit.removeEventListener('pointerup', up);
      hit.removeEventListener('pointercancel', up);
      choose(stops[idx].id);
    };
    hit.addEventListener('pointermove', move);
    hit.addEventListener('pointerup', up);
    hit.addEventListener('pointercancel', up);
  });
  hit.addEventListener('keydown', (e) => {
    let next = idx;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = Math.min(stops.length - 1, idx + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = Math.max(0, idx - 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = stops.length - 1;
    else return;
    e.preventDefault();
    idx = next;
    choose(stops[idx].id);
  });
  return wrap;
}

// ---------- inventory (filterable card grid) ----------
const BUCKET_LABEL = (labels, b) => ({ analysis: labels.bucketAnalysis, activation: labels.bucketActivation, both: labels.bucketBoth }[b] || '');
const COMPLEXITY_LABEL = (labels, c) => ({ low: labels.complexityLow, medium: labels.complexityMedium, high: labels.complexityHigh }[c] || '');

function inventoryCard(o, on, toggle, labels) {
  return h(
    'button',
    {
      type: 'button',
      class: `gd-card gd-inv-card${on ? ' is-on' : ''}${o.bucket ? ` gd-bucket-${o.bucket}` : ''}`,
      'aria-pressed': String(on),
      onClick: () => toggle(o.id),
    },
    h(
      'span',
      { class: 'gd-card-top' },
      h('span', {}, h('strong', { text: o.label }), o.subLabel && h('span', { class: 'gd-card-sub', text: o.subLabel })),
      h('span', { class: 'gd-card-check', 'aria-hidden': 'true', text: '✓' }),
    ),
    h(
      'span',
      { class: 'gd-badges' },
      o.complexity && h('span', { class: `gd-badge gd-badge-${o.complexity}`, text: COMPLEXITY_LABEL(labels, o.complexity) }),
      o.tier && h('span', { class: 'gd-badge', text: o.tier }),
      o.bucket && h('span', { class: 'gd-chip-label', text: BUCKET_LABEL(labels, o.bucket) }),
    ),
  );
}

/**
 * Filterable inventory. ui (per question, survives re-renders) holds the search and filters;
 * typing only re-renders the grid, so the search box keeps focus.
 */
export function inventory(q, options, picked, toggle, labels, ui) {
  const st = ui[q.id] || {
    query: '', category: '', complexity: '', bucket: '',
  };
  ui[q.id] = st;
  const categories = [...new Set(options.map((o) => o.category).filter(Boolean))];
  const grid = h('div', { class: 'gd-cards gd-inv-grid', role: 'group' });
  const count = h('p', { class: 'gd-inv-count', 'aria-live': 'polite' });
  const paint = () => {
    const query = st.query.trim().toLowerCase();
    const rows = options.filter((o) => {
      if (st.category && o.category !== st.category) return false;
      if (st.complexity && o.complexity !== st.complexity) return false;
      if (st.bucket && o.bucket !== st.bucket && o.bucket !== 'both') return false;
      return !query || `${o.label} ${o.subLabel || ''}`.toLowerCase().includes(query);
    });
    count.textContent = fmt(labels.resultCount, { n: rows.length, total: options.length });
    grid.replaceChildren(...(rows.length
      ? rows.map((o) => inventoryCard(o, picked.includes(o.id), toggle, labels))
      : [h('p', { class: 'gd-inv-empty', text: labels.noMatches })]));
  };
  const select = (key, all, values) => {
    const el = h('select', { 'aria-label': all }, h('option', { value: '', text: all }), values.map(([v, l]) => h('option', { value: v, selected: st[key] === v, text: l })));
    el.addEventListener('change', () => { st[key] = el.value; paint(); });
    return el;
  };
  const search = h('input', {
    type: 'search', placeholder: labels.search, 'aria-label': labels.search, value: st.query,
  });
  search.addEventListener('input', () => { st.query = search.value; paint(); });
  paint();
  return h(
    'div',
    { class: 'gd-inv' },
    h(
      'div',
      { class: 'gd-inv-filters' },
      search,
      select('category', labels.allCategories, categories.map((c) => [c, c])),
      select('complexity', labels.allComplexity, ['low', 'medium', 'high'].map((c) => [c, COMPLEXITY_LABEL(labels, c)])),
      select('bucket', labels.allBuckets, [['analysis', labels.bucketAnalysisFilter], ['activation', labels.bucketActivationFilter]]),
    ),
    count,
    grid,
  );
}

// ---------- per-item mapping cards ----------
/** One item's mapping card with the per-item choices; set(itemId, choiceId | null). */
export function mappingCard(q, item, current, set, labels) {
  const m = item.mapping || {};
  return h(
    'div',
    { class: 'gd-map-card' },
    h(
      'div',
      { class: 'gd-map-head' },
      h('strong', { text: item.label }),
      h(
        'span',
        { class: 'gd-badges' },
        item.complexity && h('span', { class: `gd-badge gd-badge-${item.complexity}`, text: COMPLEXITY_LABEL(labels, item.complexity) }),
        item.tier && h('span', { class: 'gd-badge', text: item.tier }),
      ),
    ),
    h(
      'div',
      { class: 'gd-map-row' },
      h('div', {}, h('span', { class: 'gd-map-label', text: labels.mappingFrom }), h('span', { class: 'gd-map-value', text: item.label })),
      h('span', { class: 'gd-map-arrow', 'aria-hidden': 'true', text: '→' }),
      h(
        'div',
        {},
        h('span', { class: 'gd-map-label', text: labels.mappingTo }),
        h('span', { class: 'gd-map-value', text: m.target || '' }),
        m.field && h('code', { class: 'gd-map-field', text: m.field }),
      ),
    ),
    (m.why || (m.prereqs && m.prereqs.length)) && h(
      'div',
      { class: 'gd-map-why' },
      m.why && h('p', {}, h('strong', { text: `${labels.mappingWhy} ` }), m.why),
      m.prereqs && m.prereqs.length ? h('p', {}, h('strong', { text: `${labels.mappingPrereqs} ` }), m.prereqs.join(', ')) : null,
    ),
    h(
      'div',
      { class: 'gd-map-choices' },
      h('span', { class: 'gd-map-q', text: q.title }),
      h('div', { class: 'gd-map-buttons', role: 'radiogroup', 'aria-label': `${q.title} ${item.label}` }, (q.choices || []).map((ch) => h('button', {
        type: 'button',
        class: `gd-choice${current === ch.id ? ' is-on' : ''}`,
        role: 'radio',
        'aria-checked': String(current === ch.id),
        onClick: () => set(item.id, current === ch.id ? null : ch.id),
        text: ch.label,
      }))),
    ),
  );
}

/** Current choice per item from a per-item answer list ("itemId:choiceId"). */
export const perItemChoice = (picked, itemId) => {
  const hit = (picked || []).find((v) => v.startsWith(`${itemId}:`));
  return hit ? hit.slice(itemId.length + 1) : null;
};

/** Renders a question's answer control for its display type. */
export function control(q, options, picked, { toggle, choose }, labels, extra = {}) {
  if (q.display === 'inventory') return inventory(q, options, picked, toggle, labels, extra.ui || {});
  if (q.display === 'per-item') {
    const items = extra.items || [];
    if (!items.length) return h('p', { class: 'gd-sc-help', text: labels.perItemEmpty });
    return h('div', { class: 'gd-map-list' }, items.map((item) => mappingCard(
      q,
      item,
      perItemChoice(picked, item.id),
      extra.setItem,
      labels,
    )));
  }
  if (q.display === 'slider') return slider(q, picked, choose, labels);
  if (/^cards-/.test(q.display) || q.display === 'swipe') return cards(q, options, picked, toggle);
  return tiles(q, picked, toggle, labels);
}
