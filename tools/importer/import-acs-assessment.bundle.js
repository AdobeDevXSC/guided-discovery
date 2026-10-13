/* eslint-disable */
var CustomImportScript = (() => {
  var __defProp = Object.defineProperty;
  var __defProps = Object.defineProperties;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };
  var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // tools/importer/import-acs-assessment.js
  var import_acs_assessment_exports = {};
  __export(import_acs_assessment_exports, {
    default: () => import_acs_assessment_default
  });

  // tools/importer/parsers/columns-banner.js
  function parse(element, { document: document2 }) {
    const copy = element.querySelector(".hero-copy") || element;
    const heading = copy.querySelector("h1, h2");
    const sub = copy.querySelector("p.hero-sub") || copy.querySelector("p");
    const imgContainer = element.querySelector(".collage") || element;
    const image = imgContainer.querySelector("img");
    const hasSub = sub && sub.textContent.trim();
    if (!heading && !hasSub && !image) {
      element.replaceWith(...element.childNodes);
      return;
    }
    const textCell = [];
    if (heading) textCell.push(heading);
    if (hasSub) {
      const p = document2.createElement("p");
      p.textContent = sub.textContent.trim();
      textCell.push(p);
    }
    if (image) image.setAttribute("alt", "");
    const cells = [[textCell.length ? textCell : "", image || ""]];
    const block = WebImporter.Blocks.createBlock(document2, { name: "columns-banner", cells });
    element.replaceWith(block);
  }

  // tools/importer/parsers/cards-steps.js
  function parse2(element, { document: document2 }) {
    let steps = [...element.querySelectorAll(":scope > .gate-step")];
    if (!steps.length) steps = [...element.querySelectorAll('.gate-step, [class*="step"]:not([class*="num"])')];
    const cells = [];
    steps.forEach((step) => {
      const numEl = step.querySelector('.gate-step-num, [class*="num"]');
      const number = numEl ? numEl.textContent.trim() : "";
      const clone = step.cloneNode(true);
      const cloneNum = clone.querySelector('.gate-step-num, [class*="num"]');
      if (cloneNum) cloneNum.remove();
      const text = clone.textContent.replace(/\s+/g, " ").trim();
      if (!number && !text) return;
      const cell = [];
      if (number) {
        const p = document2.createElement("p");
        p.textContent = number;
        cell.push(p);
      }
      if (text) {
        const p = document2.createElement("p");
        p.textContent = text;
        cell.push(p);
      }
      cells.push([cell]);
    });
    if (!cells.length) {
      element.replaceWith(...element.childNodes);
      return;
    }
    const block = WebImporter.Blocks.createBlock(document2, { name: "cards-steps", cells });
    element.replaceWith(block);
  }

  // tools/importer/parsers/form.js
  var FORM_SHEET = "assessment-contact-form.json";
  function parse3(element, { document: document2 }) {
    const link = document2.createElement("a");
    link.href = FORM_SHEET;
    link.textContent = FORM_SHEET;
    const cells = [[link]];
    const block = WebImporter.Blocks.createBlock(document2, { name: "Form", cells });
    element.replaceWith(block);
  }

  // tools/importer/transformers/acs-assessment-cleanup.js
  var TransformHook = { beforeTransform: "beforeTransform", afterTransform: "afterTransform" };
  function removeComments(root) {
    const doc = root.ownerDocument || document;
    const walker = doc.createTreeWalker(
      root,
      128
      /* NodeFilter.SHOW_COMMENT */
    );
    const comments = [];
    while (walker.nextNode()) comments.push(walker.currentNode);
    comments.forEach((c) => c.remove());
  }
  function removeGlobalChrome(element) {
    WebImporter.DOMUtils.remove(element, ["div.site-nav", "footer.site"]);
    const doc = element.ownerDocument || document;
    doc.querySelectorAll("body > div.site-nav, body > footer.site").forEach((el) => el.remove());
  }
  function transform(hookName, element, payload) {
    if (hookName === TransformHook.beforeTransform) {
      removeComments(element);
      WebImporter.DOMUtils.remove(element, ["script", "style", "noscript"]);
      removeGlobalChrome(element);
    }
    if (hookName === TransformHook.afterTransform) {
      removeGlobalChrome(element);
      WebImporter.DOMUtils.remove(element, ["link", "script", "style", "noscript", "iframe"]);
      removeComments(element);
    }
  }

  // tools/importer/transformers/acs-assessment-sections.js
  var SECTION_MARKER_ATTR = "data-excat-section-id";
  function querySection(root, selectors) {
    const list = Array.isArray(selectors) ? selectors : [selectors];
    for (const sel of list) {
      if (!sel) continue;
      const el = root.querySelector(sel);
      if (el) return el;
    }
    return null;
  }
  function transform2(hookName, element, payload) {
    const sections = payload && payload.template && payload.template.sections || [];
    if (sections.length < 2) return;
    const doc = element.ownerDocument || document;
    if (hookName === "beforeTransform") {
      for (let i = sections.length - 1; i >= 0; i -= 1) {
        const section = sections[i];
        if (i === 0 && !section.style) continue;
        const sectionEl = querySection(element, section.selector);
        if (!sectionEl) continue;
        const hr = doc.createElement("hr");
        if (section.style) hr.setAttribute(SECTION_MARKER_ATTR, section.id);
        sectionEl.before(hr);
      }
    }
    if (hookName === "afterTransform") {
      for (let i = sections.length - 1; i >= 0; i -= 1) {
        const section = sections[i];
        if (!section.style) continue;
        const marker = element.querySelector(`[${SECTION_MARKER_ATTR}="${section.id}"]`);
        const anchor = marker || querySection(element, section.selector);
        if (!anchor) continue;
        const metadataBlock = WebImporter.Blocks.createBlock(doc, {
          name: "Section Metadata",
          cells: { style: section.style }
        });
        anchor.after(metadataBlock);
        if (marker) {
          marker.removeAttribute(SECTION_MARKER_ATTR);
          if (i === 0) marker.remove();
        }
      }
    }
  }

  // tools/importer/import-acs-assessment.js
  var parsers = {
    "columns-banner": parse,
    "cards-steps": parse2,
    form: parse3
  };
  var PAGE_TEMPLATE = {
    name: "acs-assessment",
    description: "Assessment gate page: split hero, 3 numbered how-it-works steps, contact form (form block backed by a sheet).",
    urls: [
      "https://landing.adobe.com/acs/CJA-migration-assessment.html"
    ],
    blocks: [
      {
        name: "columns-banner",
        instances: ["main > section.hero > .wrap", "section.hero .wrap"]
      },
      {
        name: "cards-steps",
        instances: ["main > .gate-howitworks", ".gate-howitworks"]
      },
      {
        name: "form",
        instances: ["main > .form-slot", ".formFieldSection"]
      }
    ],
    sections: [
      {
        id: "rc1",
        name: "hero",
        selector: ["main > section.hero", "section.hero"],
        style: null,
        blocks: ["columns-banner"],
        defaultContent: []
      },
      {
        id: "rc2",
        name: "assessment-gate",
        selector: ["main > .gate-howitworks", ".gate-howitworks"],
        style: null,
        blocks: ["cards-steps", "form"],
        defaultContent: []
      }
    ]
  };
  var transformers = [
    transform,
    ...PAGE_TEMPLATE.sections && PAGE_TEMPLATE.sections.length > 1 ? [transform2] : []
  ];
  function executeTransformers(hookName, element, payload) {
    const enhancedPayload = __spreadProps(__spreadValues({}, payload), {
      template: PAGE_TEMPLATE
    });
    transformers.forEach((transformerFn) => {
      try {
        transformerFn.call(null, hookName, element, enhancedPayload);
      } catch (e) {
        console.error(`Transformer failed at ${hookName}:`, e);
      }
    });
  }
  function findBlocksOnPage(document2, template) {
    const pageBlocks = [];
    const seen = /* @__PURE__ */ new Set();
    template.blocks.forEach((blockDef) => {
      blockDef.instances.forEach((selector) => {
        const elements = document2.querySelectorAll(selector);
        if (elements.length === 0) {
          console.warn(`Block "${blockDef.name}" selector not found: ${selector}`);
        }
        elements.forEach((element) => {
          if (seen.has(element)) return;
          seen.add(element);
          pageBlocks.push({
            name: blockDef.name,
            selector,
            element,
            section: blockDef.section || null
          });
        });
      });
    });
    console.log(`Found ${pageBlocks.length} block instances on page`);
    return pageBlocks;
  }
  var import_acs_assessment_default = {
    transform: (payload) => {
      const { document: document2, url, params } = payload;
      const main = document2.body;
      executeTransformers("beforeTransform", main, payload);
      const pageBlocks = findBlocksOnPage(document2, PAGE_TEMPLATE);
      pageBlocks.forEach((block) => {
        if (!block.element.parentNode) return;
        const parser = parsers[block.name];
        if (parser) {
          try {
            parser(block.element, { document: document2, url, params });
          } catch (e) {
            console.error(`Failed to parse ${block.name} (${block.selector}):`, e);
          }
        } else {
          console.warn(`No parser found for block: ${block.name}`);
        }
      });
      executeTransformers("afterTransform", main, payload);
      const hr = document2.createElement("hr");
      main.appendChild(hr);
      WebImporter.rules.createMetadata(main, document2);
      WebImporter.rules.transformBackgroundImages(main, document2);
      WebImporter.rules.adjustImageUrls(main, url, params.originalURL);
      const rawPath = new URL(params.originalURL).pathname.replace(/\/$/, "").replace(/\.html?$/, "");
      const path = WebImporter.FileUtils.sanitizePath(rawPath === "" ? "/index" : rawPath);
      return [{
        element: main,
        path,
        report: {
          title: document2.title,
          template: PAGE_TEMPLATE.name,
          blocks: pageBlocks.map((b) => b.name)
        }
      }];
    }
  };
  return __toCommonJS(import_acs_assessment_exports);
})();
