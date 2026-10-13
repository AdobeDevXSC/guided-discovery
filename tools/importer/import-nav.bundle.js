/* eslint-disable */
var CustomImportScript = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
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

  // tools/importer/import-nav.js
  var import_nav_exports = {};
  __export(import_nav_exports, {
    default: () => import_nav_default
  });
  var LOGO_FILE = "images/adobe-summit-logo-red.svg";
  var import_nav_default = {
    transform: ({ document }) => {
      const header = document.querySelector("header.site, header");
      const main = document.createElement("div");
      const logoImg = header && header.querySelector(".logo img, img");
      if (logoImg) {
        const p = document.createElement("p");
        const img = document.createElement("img");
        img.src = LOGO_FILE;
        img.alt = logoImg.getAttribute("alt") || "Adobe";
        p.append(img);
        main.append(p);
      }
      const cta = header && header.querySelector("a.btn, a[href]");
      if (cta) {
        main.append(document.createElement("hr"));
        const p = document.createElement("p");
        const strong = document.createElement("strong");
        const a = document.createElement("a");
        a.href = cta.getAttribute("href");
        a.textContent = cta.textContent.trim();
        strong.append(a);
        p.append(strong);
        main.append(p);
      }
      return [{
        element: main,
        path: "/nav",
        report: { title: "nav", logo: !!logoImg, cta: cta ? cta.textContent.trim() : null }
      }];
    }
  };
  return __toCommonJS(import_nav_exports);
})();
