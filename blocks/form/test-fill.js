/*
 * Site customization: "Fill test data" button for preview testing.
 * Loaded by form.js only on *.aem.page hosts, so it never reaches the live site.
 * Values are clearly marked as test data and derived from each field's type and name.
 */

const TEST_TAG = 'TEST';

function textValue(input, label) {
  const hint = `${input.name} ${label}`.toLowerCase();
  if (/zip|postal/.test(hint)) return '00000';
  if (/phone|tel|mobile/.test(hint)) return '5555550100';
  if (/last.?name|surname/.test(hint)) return 'Submission - please delete';
  if (/first.?name|given/.test(hint)) return TEST_TAG;
  if (/org|company/.test(hint)) return `${TEST_TAG} - Edge Delivery preview`;
  return `${TEST_TAG} ${label}`.trim();
}

function fieldLabel(input) {
  const wrapper = input.closest('.field-wrapper');
  const label = wrapper?.querySelector('label, legend');
  return (label?.textContent || input.name || '').replace(/\*/g, '').trim();
}

function setValue(el, value) {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * Fills every visible, enabled field of a form with test data.
 * Hidden inputs (e.g. op, consent) keep their sheet values.
 * @param {HTMLFormElement} form
 */
export function fillTestData(form) {
  const stamp = Date.now().toString(36);
  [...form.elements].forEach((el) => {
    if (!el.name || el.disabled || el.type === 'hidden' || el.matches('button, fieldset')) return;
    const wrapper = el.closest('.field-wrapper');
    if (wrapper && wrapper.dataset.visible === 'false') return;
    const label = fieldLabel(el);
    if (el.tagName === 'SELECT') {
      const option = [...el.options].find((o) => !o.disabled && o.value && !/^other$/i.test(o.value));
      if (option) setValue(el, option.value);
    } else if (el.type === 'checkbox' || el.type === 'radio') {
      if (!form.querySelector(`[name="${el.name}"]:checked`)) {
        el.checked = true;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } else if (el.type === 'email') {
      setValue(el, `test-${stamp}@example.com`);
    } else if (el.type === 'tel') {
      setValue(el, '5555550100');
    } else if (el.type === 'number' || el.type === 'range') {
      setValue(el, el.min || '1');
    } else if (el.type === 'date') {
      setValue(el, new Date().toISOString().slice(0, 10));
    } else if (el.type !== 'file') {
      setValue(el, textValue(el, label));
    }
  });
}

/**
 * Adds the "Fill test data" button above the form.
 * @param {Element} block The form block
 * @param {HTMLFormElement} form The rendered form
 */
export default function addTestFillButton(block, form) {
  if (!form || block.querySelector('.form-test-fill')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'form-test-fill';
  button.textContent = 'Fill test data';
  button.title = 'Preview only: fills the form with clearly marked test values';
  button.addEventListener('click', () => fillTestData(form));
  form.before(button);
}
