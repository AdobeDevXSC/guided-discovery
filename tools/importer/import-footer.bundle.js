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

  // tools/importer/import-footer.js
  var import_footer_exports = {};
  __export(import_footer_exports, {
    default: () => import_footer_default
  });
  var import_footer_default = {
    transform: ({ document }) => {
      const footer = document.querySelector("footer.site, footer");
      const main = document.createElement("div");
      if (footer) {
        footer.querySelectorAll("script, noscript, style").forEach((el) => el.remove());
        footer.querySelectorAll("p").forEach((srcP) => {
          const p = document.createElement("p");
          const lines = srcP.innerHTML.split(/<br\s*\/?>/i).map((html) => {
            const tmp = document.createElement("div");
            tmp.innerHTML = html;
            return tmp.textContent.replace(/\s+/g, " ").trim();
          }).filter(Boolean);
          lines.forEach((line, i) => {
            if (i > 0) p.append(document.createElement("br"));
            p.append(document.createTextNode(line));
          });
          if (lines.length) main.append(p);
        });
      }
      return [{
        element: main,
        path: "/footer",
        report: { title: "footer", paragraphs: main.querySelectorAll("p").length }
      }];
    }
  };
  return __toCommonJS(import_footer_exports);
})();
