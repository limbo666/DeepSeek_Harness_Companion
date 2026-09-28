/**
 * Design sheet renderer.
 *
 * The harness can prove a face MOOD, a class or a reset. It cannot tell you whether the
 * thing looks good, and neither can a diff. This tool draws it: it serializes the rendered
 * SVG straight out of the component tree and rasterizes a contact sheet, so a design change
 * can be looked at instead of imagined.
 *
 * Two caveats, both stated rather than hidden:
 *
 *  - librsvg (behind sharp) ignores CSS animations, so animated layers render at their
 *    RESTING opacity, not mid-cycle. Fields therefore look stronger here than they do live.
 *  - CSS custom properties are not resolved by librsvg either, so every `var(--x, fallback)`
 *    is rewritten to its fallback before rasterizing. That is exactly why the face's palette
 *    is now literal: a themed face would render as black holes here.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

/**
 * Where sharp lives. It is a dependency of the DSH profile, not of this package, so it is
 * resolved at run time rather than declared in `package.json`. Tried in order:
 *
 *   1. the DSH profile's own node_modules, which is where it already is on a working install
 *   2. beside this package, so `npm i sharp` inside a clone is enough
 *   3. the machine this was developed on, kept only as a last resort
 *
 * If none resolve, the error lists every path tried instead of failing obscurely.
 */
const SHARP_CANDIDATES = [
  join(process.env.DSH_HOME || join(process.env.USERPROFILE || '', '.dsh'), 'profiles', 'node_modules', 'sharp', 'dist', 'index.mjs'),
  join(here, '..', 'node_modules', 'sharp', 'dist', 'index.mjs'),
  'C:/Users/admin/.dsh/profiles/node_modules/sharp/dist/index.mjs',
]

let sharpPromise = null
async function loadSharp() {
  if (!sharpPromise) {
    sharpPromise = (async () => {
      const tried = []
      for (const candidate of SHARP_CANDIDATES) {
        try {
          const mod = await import(pathToFileURL(candidate).href)
          return mod.default
        } catch (error) {
          tried.push(candidate + ' (' + error.code + ')')
        }
      }
      throw new Error('could not load sharp. Install it beside the plugin or run this from the DSH profile.\n  ' + tried.join('\n  '))
    })()
  }
  return sharpPromise
}

/* ---- vdom -> SVG ---------------------------------------------------------- */

const KEBAB = {
  strokeWidth: 'stroke-width', strokeLinecap: 'stroke-linecap', strokeLinejoin: 'stroke-linejoin',
  strokeDasharray: 'stroke-dasharray', stopColor: 'stop-color', stopOpacity: 'stop-opacity',
  textAnchor: 'text-anchor', fontSize: 'font-size', fontWeight: 'font-weight',
  fontFamily: 'font-family', clipPath: 'clip-path', className: 'class',
}
const DROP = /^(on[A-Z]|key$|ref$|dangerously)/
const ID_KEYS = ['id', 'fill', 'stroke', 'clipPath', 'style', 'filter']

/** Resolve `var(--token, fallback)` to the fallback: librsvg does not know custom properties. */
function resolveVars(value) {
  if (typeof value !== 'string' || value.indexOf('var(') < 0) return value
  return value.replace(/var\(\s*--[A-Za-z0-9_-]+\s*(?:,\s*([^)]*?)\s*)?\)/g, (whole, fallback) => (fallback === undefined ? 'none' : fallback))
}

function escapeText(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function styleString(style) {
  if (!style || typeof style !== 'object') return null
  const parts = []
  for (const key of Object.keys(style)) {
    const name = key.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())
    parts.push(name + ':' + resolveVars(String(style[key])))
  }
  return parts.join(';')
}

/** Namespace the paint-server ids so several faces can share one document. */
function namespaceIds(text, suffix) {
  if (!suffix) return text
  return text.replace(/\b(dshcp(?:Glow|Skin|Shade|Blush|HeadClip|AuraTight|AuraWide))\b/g, '$1' + suffix)
}

/**
 * Serialize one vdom node. `suffix` namespaces gradient/clip ids when several faces are
 * placed in a single sheet - without it every tile after the first would inherit tile one's
 * gradients, and all the tint colours would collapse to the same hue.
 */
export function serialize(node, suffix) {
  if (node === null || node === undefined || node === false) return ''
  if (Array.isArray(node)) return node.map((child) => serialize(child, suffix)).join('')
  if (typeof node === 'string' || typeof node === 'number') return escapeText(node)
  if (typeof node !== 'object') return ''

  const type = node.type
  if (typeof type !== 'string') {
    // A component would have been rendered by the harness already; anything else is skipped
    // rather than guessed at.
    return serialize(node.children, suffix)
  }

  const props = node.props || {}
  const attrs = []
  for (const key of Object.keys(props)) {
    if (DROP.test(key)) continue
    const name = KEBAB[key] || key
    let value = props[key]
    if (name === 'style') { value = styleString(props.style); if (!value) continue }
    if (name === 'class' && !value) continue
    if (value === null || value === undefined || value === false) continue
    if (value === true) { attrs.push(name); continue }
    let text = resolveVars(String(value))
    if (ID_KEYS.indexOf(key) >= 0) text = namespaceIds(text, suffix)
    attrs.push(name + '="' + text.replace(/"/g, '&quot;') + '"')
  }

  const open = '<' + type + (attrs.length ? ' ' + attrs.join(' ') : '') + '>'
  const body = serialize(node.children, suffix)
  if (body === '' && /^(rect|circle|ellipse|path|line|polygon|polyline|stop|use|image)$/.test(type)) {
    return open.replace(/>$/, '/>')
  }
  return open + body + '</' + type + '>'
}

/** The face's own `<svg>` element, re-emitted with a namespace suffix. */
export function faceSvgElement(view, suffix) {
  const found = findFirst(view.tree, (n) => n.type === 'svg')
  return found ? serialize(found, suffix) : null
}

function findFirst(node, predicate) {
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findFirst(child, predicate)
      if (hit) return hit
    }
    return null
  }
  if (!node || typeof node !== 'object') return null
  if (typeof node.type === 'string' && predicate(node)) return node
  return findFirst(node.children, predicate)
}

/* ---- sheet --------------------------------------------------------------- */

/**
 * Build a contact sheet from rendered views.
 *
 * Each face is emitted as `<g transform="translate(x y) scale(s)">` around the face's own
 * children, so every tile keeps its own 0..100 coordinate system and none of them need a
 * nested `<svg>`.
 */
export function buildSheet(tiles, options) {
  const opts = options || {}
  const columns = opts.columns || 4
  const tile = opts.tile || 170
  const pad = opts.pad || 10
  const label = opts.label || 15
  const background = opts.background || '#0e1117'
  const ink = opts.ink || '#c9d1e0'
  const rows = Math.ceil(tiles.length / columns)
  const width = columns * (tile + pad) + pad
  const height = rows * (tile + pad + label) + pad

  const parts = []
  parts.push('<rect width="' + width + '" height="' + height + '" fill="' + background + '"/>')
  tiles.forEach((entry, index) => {
    const col = index % columns
    const row = Math.floor(index / columns)
    const x = pad + col * (tile + pad)
    const y = pad + row * (tile + pad + label)
    const scale = tile / 100
    const svg = faceSvgElement(entry.view, '_t' + index)
    if (!svg) return
    const inner = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')
    parts.push('<g transform="translate(' + x + ' ' + y + ') scale(' + scale + ')">' + inner + '</g>')
    parts.push('<text x="' + (x + 2) + '" y="' + (y + tile + 11) + '" font-family="Segoe UI, sans-serif" font-size="10" fill="' + ink + '">' + escapeText(entry.name) + '</text>')
  })

  return { svg: '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '">' + parts.join('') + '</svg>', width, height }
}

/** Rasterize an SVG string and write it. Returns the PNG byte length. */
export async function writePng(svg, outPath, width) {
  const sharp = await loadSharp()
  let image = sharp(Buffer.from(svg))
  if (width) image = image.resize({ width })
  const buffer = await image.png().toBuffer()
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, buffer)
  return buffer.length
}

/** Convenience: sheet -> file. */
export async function writeSheet(tiles, outPath, options) {
  const sheet = buildSheet(tiles, options)
  const bytes = await writePng(sheet.svg, outPath, options && options.outWidth)
  writeFileSync(outPath.replace(/\.png$/, '.svg'), sheet.svg)
  return { bytes, width: sheet.width, height: sheet.height }
}

/** Read the CSS the bundle installs, so a single face can be rendered with its own rules. */
export function readBundle() {
  return readFileSync(join(here, '..', 'lib', 'client.js'), 'utf8')
}
