/* Lead capture gate (copy doc 5.1). Creates the server session; nothing else unlocks until then. */
import { h, rich } from '../lib/dom.js';
import { LEAD_OPTIONS } from '../lib/catalog.js';

const FIELDS = [
  {
    name: 'firstName', type: 'text', autocomplete: 'given-name', required: true,
  },
  {
    name: 'lastName', type: 'text', autocomplete: 'family-name', required: true,
  },
  {
    name: 'email', type: 'email', autocomplete: 'email', required: true,
  },
  {
    name: 'phone', type: 'tel', autocomplete: 'tel', required: true,
  },
  { name: 'jobTitle', select: true, required: true },
  { name: 'department', select: true, required: true },
  {
    name: 'organization', type: 'text', autocomplete: 'organization', required: true,
  },
  { name: 'country', select: true, required: false },
  {
    name: 'countryOther', type: 'text', required: true, when: (v) => v.country === 'other',
  },
  {
    name: 'state', type: 'text', autocomplete: 'address-level1', required: true,
  },
  {
    name: 'postalCode', type: 'text', autocomplete: 'postal-code', required: true,
  },
  { name: 'primaryProduct', select: true, required: true },
  { name: 'industry', select: true, required: true },
];
// same pattern as the form block (blocks/form/constant.js)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+()\-.\s]{5,30}$/;

const sourceInfo = () => {
  const q = new URLSearchParams(window.location.search);
  const utm = {};
  ['source', 'medium', 'campaign', 'term', 'content'].forEach((k) => { if (q.get(`utm_${k}`)) utm[k] = q.get(`utm_${k}`); });
  return {
    source: q.get('source') || `aem-eds:${window.location.pathname}`.slice(0, 100),
    pageUrl: window.location.href.split('#')[0],
    referrer: document.referrer,
    utm,
  };
};

export default function renderGate(ctx, { onStarted }) {
  const { t } = ctx.copy;
  const values = {};
  const inputs = {};
  const errors = {};

  const message = h('p', { class: 'gd-form-message', role: 'alert' });
  const submit = h('button', { type: 'submit', class: 'gd-btn gd-btn-primary', text: t('gate.submit') });

  const field = (f) => {
    const id = `gd-${f.name}`;
    const label = h('label', { for: id }, t(`gate.${f.name}`), f.required ? h('span', { class: 'gd-req', 'aria-hidden': 'true', text: '*' }) : null);
    let input;
    if (f.select) {
      input = h('select', {
        id, name: f.name, required: f.required,
      }, h('option', { value: '', text: t('gate.select') }), LEAD_OPTIONS[f.name].map((opt) => h('option', { value: opt, text: ctx.copy.leadLabel(f.name, opt) })));
    } else {
      input = h('input', {
        id, name: f.name, type: f.type, autocomplete: f.autocomplete, required: f.required, maxlength: '200',
      });
    }
    const err = h('p', { class: 'gd-field-error', id: `${id}-err` });
    input.setAttribute('aria-describedby', err.id);
    inputs[f.name] = input;
    errors[f.name] = err;
    const wrap = h('div', { class: `gd-field gd-field-${f.name}` }, label, input, err);
    if (f.when) wrap.hidden = true;
    input.addEventListener('input', () => {
      values[f.name] = input.value.trim();
      err.textContent = '';
      FIELDS.filter((x) => x.when).forEach((x) => {
        inputs[x.name].closest('.gd-field').hidden = !x.when(values);
      });
    });
    return wrap;
  };

  const validate = () => {
    let first = null;
    FIELDS.forEach((f) => {
      const v = (values[f.name] || '').trim();
      const visible = !f.when || f.when(values);
      let msg = '';
      if (visible && f.required && !v) msg = t('gate.error.required');
      else if (v && f.name === 'email' && !EMAIL_RE.test(v)) msg = t('gate.error.email');
      else if (v && f.name === 'phone' && !PHONE_RE.test(v)) msg = t('gate.error.phone');
      errors[f.name].textContent = msg;
      inputs[f.name].setAttribute('aria-invalid', msg ? 'true' : 'false');
      if (msg && !first) first = inputs[f.name];
    });
    if (first) first.focus();
    return !first;
  };

  const honeypot = h('input', {
    type: 'text', name: 'website', tabindex: '-1', autocomplete: 'off', class: 'gd-hp', 'aria-hidden': 'true',
  });

  const form = h(
    'form',
    { class: 'gd-gate-form', novalidate: true },
    h('p', { class: 'gd-gate-intro', text: t('gate.intro') }),
    h('div', { class: 'gd-fields' }, FIELDS.map(field)),
    honeypot,
    h('p', { class: 'gd-consent' }, rich(t('gate.consent'))),
    message,
    submit,
  );

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    message.textContent = '';
    if (honeypot.value) return;
    if (!validate()) return;
    submit.disabled = true;
    submit.textContent = t('gate.submitting');
    const lead = Object.fromEntries(FIELDS
      .filter((f) => (!f.when || f.when(values)) && values[f.name])
      .map((f) => [f.name, values[f.name]]));
    try {
      const res = await ctx.api.start(lead, sourceInfo(), ctx.copy.contentVersion);
      onStarted(res.sessionId, lead);
    } catch (err) {
      const fieldErrors = (err.body && err.body.errors) || {};
      Object.entries(fieldErrors).forEach(([k, v]) => {
        if (errors[k]) errors[k].textContent = v;
      });
      message.textContent = t('gate.error.server');
      submit.disabled = false;
      submit.textContent = t('gate.submit');
    }
  });

  // preview-only helper, like the form block's "Fill test data" (blocks/form/test-fill.js)
  let testFill = null;
  if (window.location.hostname.endsWith('.aem.page') || window.location.hostname === 'localhost') {
    testFill = h('button', {
      type: 'button',
      class: 'gd-btn gd-btn-ghost gd-test-fill',
      text: 'Fill test data',
      onClick: () => {
        const stamp = Date.now().toString(36);
        const sample = {
          firstName: 'TEST', lastName: 'Guided Discovery - please delete', email: `test-${stamp}@example.com`, phone: '5555550100', organization: 'TEST org', state: 'CA', postalCode: '00000',
        };
        FIELDS.forEach((f) => {
          const input = inputs[f.name];
          if (f.select) input.value = f.name === 'country' ? '' : LEAD_OPTIONS[f.name][0];
          else if (sample[f.name]) input.value = sample[f.name];
          input.dispatchEvent(new Event('input'));
        });
      },
    });
  }

  return h(
    'section',
    { class: 'gd-gate' },
    h('ol', { class: 'gd-gate-steps' }, ['gate.step1', 'gate.step2', 'gate.step3'].map((k) => h('li', { text: t(k) }))),
    testFill,
    form,
  );
}
