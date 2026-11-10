// Markdown (Claude's reply) -> PDF, on the server, with pdfkit's built-in fonts (no font files).
// Handles headings, paragraphs with bold/italic/code/links, bullet and numbered lists (nested),
// block quotes, code blocks, rules and simple tables. Characters the built-in fonts cannot draw
// are replaced so a stray symbol never breaks the file.
const PDFDocument = require('pdfkit/js/pdfkit.standalone.js') // fonts built in: the bundled action cannot read pdfkit's data files
const { marked } = require('marked')

const MARGIN = 54
const FONTS = { normal: 'Helvetica', bold: 'Helvetica-Bold', italic: 'Helvetica-Oblique', boldItalic: 'Helvetica-BoldOblique', code: 'Courier' }
const HEADING = { 1: 22, 2: 17, 3: 14, 4: 12, 5: 11, 6: 11 }
const INK = '#1f2328'
const SOFT = '#5b6470'
const ACCENT = '#3b63fb'

const REPLACEMENTS = [[/[‘’]/g, "'"], [/[“”]/g, '"'], [/→/g, '->'], [/←/g, '<-'], [/[✓✔]/g, 'v']]
/** Keeps what WinAnsi (the built-in fonts) can show; everything else becomes '?'. */
function clean (s) {
  let t = String(s == null ? '' : s)
  for (const [re, to] of REPLACEMENTS) t = t.replace(re, to)
  return t.replace(/[^\x09\x0a\x20-\x7e\xa0-\xff–—•…€]/g, '?')
}

/** Inline tokens -> runs of { text, font, color, link } */
function runsOf (tokens, style = {}, out = []) {
  for (const t of tokens || []) {
    if (t.type === 'strong') runsOf(t.tokens, { ...style, bold: true }, out)
    else if (t.type === 'em') runsOf(t.tokens, { ...style, italic: true }, out)
    else if (t.type === 'del') runsOf(t.tokens, style, out)
    else if (t.type === 'link') runsOf(t.tokens, { ...style, link: t.href }, out)
    else if (t.type === 'codespan') out.push({ text: t.text, style: { ...style, code: true } })
    else if (t.type === 'br') out.push({ text: '\n', style })
    else if (t.tokens && t.tokens.length) runsOf(t.tokens, style, out)
    else out.push({ text: t.text !== undefined ? unescapeHtml(t.text) : (t.raw || ''), style })
  }
  return out
}
const unescapeHtml = (s) => String(s).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")

const fontFor = (s, base) => (s.code ? FONTS.code : s.bold && (s.italic || base.italic) ? FONTS.boldItalic : s.bold || base.bold ? (s.italic || base.italic ? FONTS.boldItalic : FONTS.bold) : s.italic || base.italic ? FONTS.italic : FONTS.normal)

/** Writes runs as one wrapped paragraph starting at (x, current y), within `width`. */
function writeRuns (doc, runs, { x, width, size = 11, base = {}, color = INK, gap = 6 }) {
  const parts = runs.filter((r) => r.text !== '')
  if (!parts.length) return
  doc.x = x
  parts.forEach((r, i) => {
    doc.font(fontFor(r.style, base)).fontSize(r.style.code ? size - 1 : size).fillColor(r.style.link ? ACCENT : color)
    // set explicitly: options of a continued paragraph carry over to the runs after a link
    const link = { link: r.style.link || null, underline: !!r.style.link }
    // pdfkit keeps the first call's width and line gap for the rest of a continued paragraph
    if (i === 0) doc.text(clean(r.text), x, undefined, { width, continued: parts.length > 1, lineGap: 2, ...link })
    else doc.text(clean(r.text), { continued: i < parts.length - 1, ...link })
  })
  doc.x = x
  doc.moveDown(gap / 11)
}

function ensureSpace (doc, need) {
  if (doc.y + need > doc.page.height - doc.page.margins.bottom) doc.addPage()
}

function block (doc, tok, ctx) {
  const { x, width } = ctx
  switch (tok.type) {
    case 'space': return
    case 'heading': {
      const size = HEADING[tok.depth] || 11
      ensureSpace(doc, size * 3)
      doc.moveDown(tok.depth <= 2 ? 0.6 : 0.3)
      writeRuns(doc, runsOf(tok.tokens), { x, width, size, base: { bold: true }, color: tok.depth === 1 ? INK : tok.depth === 2 ? ACCENT : INK, gap: tok.depth === 1 ? 10 : 5 })
      if (tok.depth <= 2) {
        doc.moveTo(x, doc.y - 3).lineTo(x + width, doc.y - 3).lineWidth(tok.depth === 1 ? 1.2 : 0.5).strokeColor('#d9dde3').stroke()
        doc.moveDown(0.4)
      }
      return
    }
    case 'paragraph': case 'text':
      ensureSpace(doc, 30)
      return writeRuns(doc, runsOf(tok.tokens || [{ type: 'text', text: tok.text }]), { x, width })
    case 'list': {
      let n = Number(tok.start) || 1
      for (const item of tok.items) {
        ensureSpace(doc, 24)
        const marker = tok.ordered ? `${n}.` : '•'
        n += 1
        const top = doc.y
        doc.font(FONTS.normal).fontSize(11).fillColor(SOFT).text(marker, x, top, { width: 16, lineBreak: false })
        doc.y = top
        const inner = item.tokens || []
        inner.forEach((t, i) => {
          if (t.type === 'list') block(doc, t, { x: x + 18, width: width - 18 })
          else if (t.type === 'text' || t.type === 'paragraph') {
            writeRuns(doc, runsOf(t.tokens || [{ type: 'text', text: t.text }]), { x: x + 18, width: width - 18, gap: i === inner.length - 1 ? 3 : 5 })
          } else block(doc, t, { x: x + 18, width: width - 18 })
        })
      }
      doc.moveDown(0.3)
      return
    }
    case 'blockquote': {
      const top = doc.y
      tok.tokens.forEach((t) => block(doc, t, { x: x + 14, width: width - 14 }))
      doc.moveTo(x + 3, top).lineTo(x + 3, doc.y - 4).lineWidth(2).strokeColor('#c5ccd6').stroke()
      return
    }
    case 'code': {
      const text = clean(tok.text)
      doc.font(FONTS.code).fontSize(9.5)
      const h = doc.heightOfString(text, { width: width - 16 }) + 12
      ensureSpace(doc, Math.min(h, 200))
      const top = doc.y
      doc.rect(x, top, width, h).fill('#f1f3f6')
      doc.fillColor(INK).text(text, x + 8, top + 6, { width: width - 16 })
      doc.y = top + h + 6
      doc.x = x
      return
    }
    case 'hr':
      doc.moveTo(x, doc.y + 4).lineTo(x + width, doc.y + 4).lineWidth(0.5).strokeColor('#d9dde3').stroke()
      doc.moveDown(0.8)
      return
    case 'table': {
      const cols = tok.header.length
      const w = width / cols
      const cellText = (c) => clean(runsOf(c.tokens).map((r) => r.text).join(''))
      const rows = [tok.header.map((c) => ({ t: cellText(c), head: true })), ...tok.rows.map((r) => r.map((c) => ({ t: cellText(c), head: false })))]
      for (const row of rows) {
        const h = Math.max(...row.map((c) => doc.font(c.head ? FONTS.bold : FONTS.normal).fontSize(9.5).heightOfString(c.t, { width: w - 10 }))) + 8
        ensureSpace(doc, h)
        const top = doc.y
        row.forEach((c, i) => {
          if (c.head) doc.rect(x + i * w, top, w, h).fill('#eef1f6')
          doc.rect(x + i * w, top, w, h).lineWidth(0.5).strokeColor('#d9dde3').stroke()
          doc.font(c.head ? FONTS.bold : FONTS.normal).fontSize(9.5).fillColor(INK).text(c.t, x + i * w + 5, top + 4, { width: w - 10 })
        })
        doc.y = top + h
      }
      doc.x = x
      doc.moveDown(0.8)
      return
    }
    default:
      if (tok.raw && tok.raw.trim()) writeRuns(doc, [{ text: tok.raw.trim(), style: {} }], { x, width })
  }
}

/** Renders Markdown to a PDF; resolves to a Buffer. */
function markdownToPdf (markdown, { title = 'Document', footer = '' } = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margins: { top: MARGIN, bottom: MARGIN + 10, left: MARGIN, right: MARGIN }, bufferPages: true, info: { Title: clean(title) } })
    const chunks = []
    doc.on('data', (c) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
    try {
      const width = doc.page.width - MARGIN * 2
      for (const tok of marked.lexer(String(markdown || ''))) block(doc, tok, { x: MARGIN, width })
      const range = doc.bufferedPageRange()
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(range.start + i)
        doc.page.margins.bottom = 0 // the footer sits in the bottom margin; writing there must not add a page
        doc.font(FONTS.normal).fontSize(8).fillColor(SOFT)
        const y = doc.page.height - MARGIN + 4
        doc.text(clean(footer), MARGIN, y, { width: width - 60, lineBreak: false })
        doc.text(`${i + 1} / ${range.count}`, MARGIN + width - 60, y, { width: 60, align: 'right', lineBreak: false })
      }
      doc.end()
    } catch (e) { reject(e) }
  })
}

module.exports = { markdownToPdf, clean }
