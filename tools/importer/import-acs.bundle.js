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

  // tools/importer/import-acs.js
  var import_acs_exports = {};
  __export(import_acs_exports, {
    default: () => import_acs_default
  });

  // tools/importer/parsers/columns-hero.js
  function parse(element, { document: document2 }) {
    const copy = element.querySelector(".hero-copy") || element;
    const kicker = copy.querySelector('.kicker, [class*="eyebrow"]');
    const heading = copy.querySelector("h1, h2");
    const sub = copy.querySelector("p.hero-sub") || copy.querySelector("p");
    const primary = copy.querySelector("a.btn-red, a.btn-primary");
    const secondary = copy.querySelector("a.btn-outline-white, a.btn-outline, a.btn-secondary");
    const imgContainer = element.querySelector(".collage") || element;
    const image = imgContainer.querySelector("img");
    if (!heading && !image) {
      element.replaceWith(...element.childNodes);
      return;
    }
    const makeCta = (link, wrapperTag) => {
      const a = document2.createElement("a");
      a.href = link.getAttribute("href") || "#";
      a.textContent = link.textContent.trim();
      const wrap = document2.createElement(wrapperTag);
      wrap.append(a);
      const p = document2.createElement("p");
      p.append(wrap);
      return p;
    };
    const textCell = [];
    if (kicker && kicker.textContent.trim()) {
      const p = document2.createElement("p");
      p.textContent = kicker.textContent.trim();
      textCell.push(p);
    }
    if (heading) textCell.push(heading);
    if (sub && sub.textContent.trim()) {
      const p = document2.createElement("p");
      p.textContent = sub.textContent.trim();
      textCell.push(p);
    }
    if (primary) textCell.push(makeCta(primary, "strong"));
    if (secondary && secondary !== primary) textCell.push(makeCta(secondary, "em"));
    const cells = [[textCell, image || ""]];
    const block = WebImporter.Blocks.createBlock(document2, { name: "columns-hero", cells });
    element.replaceWith(block);
  }

  // tools/importer/parsers/cards-stats.js
  function readValue(numEl) {
    if (!numEl) return "";
    const text = numEl.textContent.replace(/\s+/g, " ").trim();
    const attrNames = ["data-target", "data-count", "data-value", "data-to", "data-end", "data-final"];
    let attr = null;
    for (const name of attrNames) {
      const v = numEl.getAttribute(name);
      if (v !== null && v.trim() !== "") {
        attr = v.trim();
        break;
      }
    }
    if (attr !== null && (!text || /^0+(\.0+)?$/.test(text.replace(/[^\d.]/g, "")))) {
      const suffix = numEl.getAttribute("data-suffix") || "";
      const prefix = numEl.getAttribute("data-prefix") || "";
      return `${prefix}${attr}${suffix}`;
    }
    return text || attr || "";
  }
  function parse2(element, { document: document2 }) {
    const items = [...element.querySelectorAll(":scope > div, :scope > li")];
    const cells = [];
    items.forEach((item) => {
      const numEl = item.querySelector('.num, .counter, [class*="value"], strong');
      const capEl = item.querySelector("p.cap, .cap, p");
      const value = readValue(numEl);
      const caption = capEl && capEl !== numEl ? capEl.textContent.replace(/\s+/g, " ").trim() : "";
      if (!value && !caption) return;
      const cell = [];
      if (value) {
        const p = document2.createElement("p");
        const strong = document2.createElement("strong");
        strong.textContent = value;
        p.append(strong);
        cell.push(p);
      }
      if (caption) {
        const p = document2.createElement("p");
        p.textContent = caption;
        cell.push(p);
      }
      cells.push([cell]);
    });
    if (!cells.length) {
      element.replaceWith(...element.childNodes);
      return;
    }
    const block = WebImporter.Blocks.createBlock(document2, { name: "cards-stats", cells });
    element.replaceWith(block);
  }

  // tools/importer/parsers/cards-feature.js
  function parse3(element, { document: document2 }) {
    let items = [...element.querySelectorAll(":scope > .feature")];
    if (!items.length) items = [...element.querySelectorAll(":scope > div")];
    const cells = [];
    items.forEach((item) => {
      const img = item.querySelector("img");
      const headingSrc = item.querySelector("h3, h2, h4");
      const paras = [...item.querySelectorAll("p")].filter((p) => p.textContent.trim());
      const body = [];
      if (headingSrc && headingSrc.textContent.trim()) {
        const h = document2.createElement(headingSrc.tagName.toLowerCase());
        h.textContent = headingSrc.textContent.replace(/\s+/g, " ").trim();
        body.push(h);
      }
      paras.forEach((p) => {
        const np = document2.createElement("p");
        np.innerHTML = p.innerHTML.trim();
        body.push(np);
      });
      if (!img && !body.length) return;
      cells.push([img || "", body.length ? body : ""]);
    });
    if (!cells.length) {
      element.replaceWith(...element.childNodes);
      return;
    }
    const block = WebImporter.Blocks.createBlock(document2, { name: "cards-feature", cells });
    element.replaceWith(block);
  }

  // tools/importer/transformers/acs-cleanup.js
  var TransformHook = { beforeTransform: "beforeTransform", afterTransform: "afterTransform" };
  var ANIMATION_CLASSES = ["reveal", "is-visible", "reveal-child", "reveal-child-group"];
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
  function transform(hookName, element, payload) {
    if (hookName === TransformHook.beforeTransform) {
      removeComments(element);
      WebImporter.DOMUtils.remove(element, ["script", "style", "noscript", "iframe"]);
      const metaDoc = element.ownerDocument || document;
      const seenMeta = /* @__PURE__ */ new Set();
      metaDoc.querySelectorAll("meta[name], meta[property]").forEach((meta) => {
        const key = `${meta.getAttribute("name") || meta.getAttribute("property")}|${meta.getAttribute("content")}`;
        if (seenMeta.has(key)) meta.remove();
        else seenMeta.add(key);
      });
      const doc = element.ownerDocument || document;
      element.querySelectorAll("section.closing a.btn").forEach((link) => {
        if (link.closest("strong")) return;
        const p = doc.createElement("p");
        const strong = doc.createElement("strong");
        link.replaceWith(p);
        link.removeAttribute("class");
        strong.append(link);
        p.append(strong);
      });
    }
    if (hookName === TransformHook.afterTransform) {
      WebImporter.DOMUtils.remove(element, ["header.site", "footer.site", "link", "script", "style", "noscript", "iframe"]);
      removeComments(element);
      element.querySelectorAll(ANIMATION_CLASSES.map((c) => `.${c}`).join(",")).forEach((el) => {
        ANIMATION_CLASSES.forEach((c) => el.classList.remove(c));
        if (!el.getAttribute("class")) el.removeAttribute("class");
      });
    }
  }

  // tools/importer/transformers/acs-sections.js
  var SECTION_MARKER_ATTR = "data-excat-section-id";
  var SECTION_ANCHOR_IDS = {
    rc3: "how-it-works",
    rc4: "discovery"
  };
  function querySection(root, selectors) {
    const list = Array.isArray(selectors) ? selectors : [selectors];
    for (const sel of list) {
      const el = root.querySelector(sel);
      if (el) return el;
    }
    return null;
  }
  function metadataCells(section) {
    const cells = {};
    if (section.style) cells.style = section.style;
    if (SECTION_ANCHOR_IDS[section.id]) cells.id = SECTION_ANCHOR_IDS[section.id];
    return cells;
  }
  function transform2(hookName, element, payload) {
    const sections = payload && payload.template && payload.template.sections || [];
    if (sections.length < 2) return;
    const doc = element.ownerDocument || document;
    if (hookName === "beforeTransform") {
      for (let i = sections.length - 1; i >= 0; i -= 1) {
        const section = sections[i];
        const hasMeta = Object.keys(metadataCells(section)).length > 0;
        if (i === 0 && !hasMeta) continue;
        const sectionEl = querySection(element, section.selector);
        if (!sectionEl) continue;
        const hr = doc.createElement("hr");
        if (hasMeta) hr.setAttribute(SECTION_MARKER_ATTR, section.id);
        sectionEl.before(hr);
      }
    }
    if (hookName === "afterTransform") {
      for (let i = sections.length - 1; i >= 0; i -= 1) {
        const section = sections[i];
        const cells = metadataCells(section);
        if (Object.keys(cells).length === 0) continue;
        const marker = element.querySelector(`[${SECTION_MARKER_ATTR}="${section.id}"]`);
        const sectionEl = querySection(element, section.selector);
        const anchor = sectionEl || marker;
        if (!anchor) continue;
        const metadataBlock = WebImporter.Blocks.createBlock(doc, {
          name: "Section Metadata",
          cells
        });
        if (sectionEl) sectionEl.after(metadataBlock);
        else marker.after(metadataBlock);
        if (marker) {
          marker.removeAttribute(SECTION_MARKER_ATTR);
          if (i === 0) marker.remove();
        }
      }
    }
  }

  // tools/importer/import-acs.js
  var parsers = {
    "columns-hero": parse,
    "cards-stats": parse2,
    "cards-feature": parse3
  };
  var PAGE_TEMPLATE = {
    name: "acs",
    description: "ACS campaign landing page: dark split hero, light stats band, centered intro with feature cards, black closing CTA. Sections #how-it-works and #discovery are in-page anchor targets.",
    urls: [
      "https://landing.adobe.com/acs/analytics-modernization-readiness.html"
    ],
    blocks: [
      {
        name: "columns-hero",
        instances: ["main > section.hero > .wrap", "section.hero .wrap"]
      },
      {
        name: "cards-stats",
        instances: [".stats-band .stats-grid", "#stats-section .stats-grid"]
      },
      {
        name: "cards-feature",
        instances: ["#how-it-works .feature-row", "section .feature-row"]
      }
    ],
    sections: [
      {
        id: "rc1",
        name: "hero",
        selector: ["main > section.hero", "section.hero"],
        style: "dark",
        blocks: ["columns-hero"],
        defaultContent: []
      },
      {
        id: "rc2",
        name: "stats",
        selector: [".stats-band", "#stats-section"],
        style: "light",
        blocks: ["cards-stats"],
        defaultContent: []
      },
      {
        id: "rc3",
        name: "how-it-works",
        selector: ["#how-it-works", "main > section:has(.feature-row)"],
        style: "center",
        blocks: ["cards-feature"],
        defaultContent: [".intro-head h2", ".intro-head p"]
      },
      {
        id: "rc4",
        name: "discovery",
        selector: ["section.closing", "#discovery"],
        style: "black, center",
        blocks: [],
        defaultContent: ["section.closing h2", "section.closing a.btn"]
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
  var import_acs_default = {
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
  return __toCommonJS(import_acs_exports);
})();
