/* eslint-disable */
/* global WebImporter */
/**
 * Parser for form. Base: form (no variant — form blocks never take variants). Template: acs-assessment.
 * Selector: .form-slot / .formFieldSection (contains a Qualtrics iframe).
 * Follows the forms-excat form-migration convention: a 2-row table
 *   | Form |
 *   | [assessment-contact-form.json](assessment-contact-form.json) |
 * The form definition sheet already exists at content/acs/assessment-contact-form.json,
 * next to the page, so the link is a relative filename. Fields are NOT read from the iframe.
 */
const FORM_SHEET = 'assessment-contact-form.json';

export default function parse(element, { document }) {
  const link = document.createElement('a');
  link.href = FORM_SHEET;
  link.textContent = FORM_SHEET;

  const cells = [[link]];

  const block = WebImporter.Blocks.createBlock(document, { name: 'Form', cells });
  element.replaceWith(block);
}
