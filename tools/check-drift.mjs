/**
 * Drift-placement checker.
 *
 * The drift layer renders BEHIND the head. That is a draw-order decision, not a
 * licence to stand under the silhouette: the face is opaque, so a glyph whose
 * box overlaps the head ellipse is erased, not layered. And two glyphs given the
 * same spot are drawn at identical coordinates, so a "parade" collapses to one
 * object.
 *
 * Both defects were real. The original six-spot ring put two spots ([9,54] and
 * [91,50]) with their CENTRES inside the head - metric 0.91 - and picked spots
 * with `i * 3 mod 6`, which for a three-object pool gave 0,3,0 and for four gave
 * only two distinct positions. Meanwhile the free margin inside the 100x100 box
 * is 7 units and the glyphs need 8-11, so nothing could ever have been fully seen.
 *
 * This tool reads the layout straight out of the bundle and proves, over every
 * rotation offset and every mood pool, that:
 *
 *   1. no two objects in one parade share a spot;
 *   2. every glyph box clears the head ellipse;
 *   3. every glyph box stays inside the viewBox (the face parks near a screen
 *      edge, so anything outside is off-screen);
 *   4. no glyph box reaches into the street sign's corner.
 *
 * Usage: node companion-face/tools/check-drift.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, '..', 'lib', 'client.js'), 'utf8')

/* ---- read the layout out of the bundle, so this cannot drift from the code --- */

/** Slice out the balanced `[...]`/`{...}` literal that follows `const NAME = `. */
function literal(name) {
  const at = source.indexOf('const ' + name + ' = ')
  if (at < 0) throw new Error(`could not find ${name} in lib/client.js`)
  const from = at + ('const ' + name + ' = ').length
  const open = source[from]
  if (open !== '[' && open !== '{') throw new Error(`${name} is not a literal any more (starts with ${JSON.stringify(open)})`)
  const close = open === '[' ? ']' : '}'
  let depth = 0
  for (let i = from; i < source.length; i += 1) {
    const ch = source[i]
    if (ch === '[' || ch === '{') depth += 1
    else if (ch === ']' || ch === '}') {
      depth -= 1
      if (depth === 0) {
        if (ch !== close) throw new Error(`${name} has unbalanced brackets`)
        // Safe here: every value in these tables is a number or a bare identifier, and no
        // key or value contains a colon, so the three rewrites below cannot corrupt one.
        const text = source.slice(from, i + 1)
          .replace(/'/g, '"')
          .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":')
          .replace(/,(\s*[}\]])/g, '$1')
        return JSON.parse(text)
      }
    }
  }
  throw new Error(`${name} is unterminated`)
}

const SPOTS = literal('DRIFT_SPOTS')
const STEP = literal('DRIFT_STEP')
const SCALE = literal('DRIFT_SCALE')
const EXTENT = literal('DRIFT_EXTENT')
const DRIFT = literal('DRIFT')

/* ---- the geometry an object has to survive ---------------------------------- */

const HEAD = { cx: 50, cy: 52, rx: 43, ry: 41 }
/** The European warning triangle plus its post, in viewBox units. */
const SIGN = { x0: 72, y0: 71, x1: 104, y1: 110 }
const VIEW = 100
/**
 * Clearance floor. `metric > 1` only proves the box misses the ellipse; at 1.003 the
 * glyph's inner corner is grazing the silhouette, which looks like a clipped shape
 * rather than a drifting object. Require real air between glyph and face.
 */
const MIN_CLEARANCE = 1.05

/** Ellipse metric: < 1 inside the head, > 1 outside. */
const metric = (x, y) => Math.pow((x - HEAD.cx) / HEAD.rx, 2) + Math.pow((y - HEAD.cy) / HEAD.ry, 2)

/** Worst (smallest) metric over the glyph box, sampling edges and interior. */
function worstBox(x, y, h) {
  let worst = Infinity
  let at = null
  for (let dx = -h; dx <= h + 1e-9; dx += h / 2) {
    for (let dy = -h; dy <= h + 1e-9; dy += h / 2) {
      const value = metric(x + dx, y + dy)
      if (value < worst) { worst = value; at = [Math.round(x + dx), Math.round(y + dy)] }
    }
  }
  return { worst, at }
}

const problems = []
const note = (msg) => problems.push(msg)

/* ---- 1. one spot per object ------------------------------------------------- */

const poolLengths = [...new Set(Object.values(DRIFT).map((list) => list.length))].sort()
const offsets = SPOTS.map((_, i) => i)
let duplicateCases = 0

for (const poolLen of poolLengths) {
  const count = Math.min(4, poolLen)
  for (const offset of offsets) {
    const used = []
    for (let i = 0; i < count; i += 1) used.push(SPOTS[(offset + STEP[i]) % SPOTS.length])
    const seen = new Set()
    for (const spot of used) {
      const key = spot[0] + ',' + spot[1]
      if (seen.has(key)) {
        duplicateCases += 1
        note(`a ${count}-object parade stacks two glyphs on [${spot}] (offset ${offset})`)
      }
      seen.add(key)
    }
  }
}

/* ---- 2/3/4. every spot, against the worst glyph that may stand on it -------- */

const kinds = [...new Set(Object.values(DRIFT).flat())]
const missing = kinds.filter((kind) => EXTENT[kind] === undefined)
if (missing.length) note(`no DRIFT_EXTENT recorded for: ${missing.join(', ')}`)

const worstScale = Math.max(...SCALE)
let tightest = { metric: Infinity, spot: null, kind: null }
let narrowestMargin = { slack: Infinity, spot: null }

for (const spot of SPOTS) {
  for (const kind of kinds) {
    const h = (EXTENT[kind] === undefined ? 11 : EXTENT[kind]) * worstScale
    const box = worstBox(spot[0], spot[1], h)
    if (box.worst <= 1) {
      note(`[${spot}] with a ${kind} is buried in the face (metric ${box.worst.toFixed(3)} at [${box.at}])`)
    } else if (box.worst < MIN_CLEARANCE) {
      note(`[${spot}] with a ${kind} grazes the silhouette (metric ${box.worst.toFixed(3)} at [${box.at}], needs ${MIN_CLEARANCE})`)
    }
    if (box.worst < tightest.metric) tightest = { metric: box.worst, spot, kind }
    if (spot[0] - h < 0 || spot[0] + h > VIEW || spot[1] - h < 0 || spot[1] + h > VIEW) {
      note(`[${spot}] with a ${kind} leaves the viewBox, so it is off-screen when the face parks on an edge`)
    }
    if (spot[0] + h > SIGN.x0 && spot[1] + h > SIGN.y0) {
      note(`[${spot}] with a ${kind} reaches into the street sign's corner`)
    }
    const slack = Math.min(spot[0] - h, VIEW - (spot[0] + h), spot[1] - h, VIEW - (spot[1] + h))
    if (slack < narrowestMargin.slack) narrowestMargin = { slack, spot }
  }
}

/* ---- report ----------------------------------------------------------------- */

console.log(`drift layout: ${SPOTS.length} spots, ${kinds.length} glyph kinds, ${Object.keys(DRIFT).length} moods`)
console.log(`scales ${SCALE.join('/')}, worst glyph half-extent ${(Math.max(...Object.values(EXTENT)) * worstScale).toFixed(2)} units`)
console.log(`\nparades checked: ${poolLengths.length} pool sizes x ${offsets.length} offsets = ${poolLengths.length * offsets.length}`)
console.log(`duplicate placements: ${duplicateCases}`)
console.log(`tightest clearance: metric ${tightest.metric.toFixed(3)} for a ${tightest.kind} at [${tightest.spot}]`)
console.log(`narrowest viewBox margin: ${narrowestMargin.slack.toFixed(2)} units at [${narrowestMargin.spot}]`)

console.log('\nper spot, worst case across every glyph kind:')
for (const spot of SPOTS) {
  let worst = Infinity
  for (const kind of kinds) {
    const h = (EXTENT[kind] === undefined ? 11 : EXTENT[kind]) * worstScale
    worst = Math.min(worst, worstBox(spot[0], spot[1], h).worst)
  }
  console.log(`  [${String(spot[0]).padStart(4)},${String(spot[1]).padStart(4)}]  metric ${worst.toFixed(2)}  ${worst > 1 ? 'seen' : 'HIDDEN'}`)
}

if (problems.length) {
  console.log('\nFAILURES:')
  for (const msg of problems) console.log('  - ' + msg)
  console.log(`\n${problems.length} drift placement problem(s)`)
  process.exit(1)
}
console.log('\nevery drift object is on its own spot, clear of the face, inside the frame')
