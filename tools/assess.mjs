/**
 * Static assessment of the companion bundle.
 *
 * Reads lib/client.js and reports the mood inventory, which moods are actually
 * REACHABLE (derived from the return literals in the resolver functions, not from
 * a hand-kept list), the animation inventory, the cadence at which things change,
 * and the exact duty cycle of the street sign.
 *
 * Run: node tools/assess.mjs
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(here, '..', 'lib', 'client.js'), 'utf8')
const lines = src.split(/\r?\n/)

const grab = (start, end) => {
  const from = src.indexOf(start)
  if (from < 0) return ''
  const to = end === undefined ? src.length : src.indexOf(end, from)
  return src.slice(from, to < 0 ? src.length : to)
}
const literals = (text) => {
  const out = new Set()
  const re = /'([A-Za-z][A-Za-z0-9]*)'/g
  let m
  while ((m = re.exec(text)) !== null) out.add(m[1])
  return out
}

/* ---------------- moods ---------------- */
const moods = []
for (const line of lines) {
  const m = line.match(/^\t\t\t([A-Za-z]+): \{ tint: '(\w+)', bubble: (?:''|'(?:[^']*)'), look: (?:'(\w+)'|null), fx: (\[[^\]]*\]), anim: (?:''|'([^']+)'), pulse: (?:''|'([^']+)'), talk: (true|false), vec: vec\((\{.*\}|)\) \},$/)
  if (!m) continue
  moods.push({
    name: m[1], tint: m[2], look: m[3] || 'mouse',
    fx: m[4] === '[]' ? [] : m[4].replace(/[[\]']/g, '').split(', ').filter(Boolean),
    anim: m[5] || '', pulse: m[6] || '', talk: m[7] === 'true',
    vec: m[8] === '' ? {} : m[8],
  })
}
const moodNames = moods.map((m) => m.name)

/* ---------------- variant pools ---------------- */
const pools = {}
let current = null
for (const line of lines) {
  const head = line.match(/^\t\t\t([A-Za-z]+): \[$/)
  if (head) { current = head[1]; pools[current] = 0; continue }
  if (current && /^\t\t\t\],?$/.test(line)) { current = null; continue }
  if (current && /\{ key: '([^']+)'/.test(line)) pools[current] += 1
}

/* ---------------- reachability ---------------- */
// Every mood name a resolver can return, taken from the function bodies.
const reach = new Set()
for (const fn of ['deriveMood', 'rareThinkingMood', 'resolveMood']) {
  const body = grab(`function ${fn}(`, '\n\t\t}')
  for (const lit of literals(body)) if (moodNames.includes(lit)) reach.add(lit)
}
// Tool-mapped moods and the alarm/typing shortcuts.
// NOTE: the end marker must include the brace. `'\n\t\t'` alone also matches the
// prefix of the 3-tab entry lines, which silently truncates the block to its
// opening line and reports every tool-mapped mood as unreachable.
const toolBlock = grab('const TOOL_MOODS = {', '\n\t\t}')
for (const lit of literals(toolBlock)) if (moodNames.includes(lit)) reach.add(lit)
const toolMood = grab('function toolMood(', '\n\t\t}')
for (const lit of literals(toolMood)) if (moodNames.includes(lit)) reach.add(lit)
const resolve = grab('function resolveMood(', '\n\t\t\treturn deriveMood')
for (const lit of literals(resolve)) if (moodNames.includes(lit)) reach.add(lit)

/* ---------------- signs ---------------- */
const signBlock = grab('const SIGN = {', '\n\t\t}')
const signKeys = [...signBlock.matchAll(/^\t\t\t([A-Za-z]+): \{ glyph/gm)].map((m) => m[1])
const signShow = Number((grab('const SIGN_SHOW =', '\n') || '').match(/(\d+)/)?.[1] ?? 0)
const signUrgent = Number((grab('const SIGN_URGENT_SHOW =', '\n') || '').match(/(\d+)/)?.[1] ?? 0)

/* ---------------- animations ---------------- */
const keyframes = [...src.matchAll(/@keyframes (dshcp-[a-z]+)\{([^}]*)\}/g)].map((m) => m[1])
const cssAnims = []
for (const line of lines) {
  if (!line.includes('animation:dshcp-')) continue
  const name = line.match(/animation:(dshcp-[a-z]+) ([\d.]+)s ([a-z-]+)(?: (infinite))?/)
  if (name) cssAnims.push({ name: name[1], secs: Number(name[2]), loop: name[4] === 'infinite' })
}
const actions = []
for (const line of lines) {
  const m = line.match(/^\t\t\t([A-Za-z]+): \{ ms: (\d+), look: (?:'(\w+)'|null), vec: \{([^}]*)\}/)
  if (m) actions.push({ name: m[1], ms: Number(m[2]), vecKeys: m[4].split(',').length })
}

/* ---------------- report ---------------- */
const pad = (s, n) => String(s).padEnd(n)
console.log('='.repeat(78))
console.log('COMPANION ASSESSMENT')
console.log('='.repeat(78))

console.log(`\nMOOD INVENTORY - ${moods.length} moods, ${Object.keys(pools).length} with a variant pool\n`)
console.log(`  ${pad('mood', 15)} ${pad('pool', 5)} ${pad('fx', 22)} ${pad('anim', 15)} ${pad('reach', 6)}`)
for (const m of moods) {
  const pool = pools[m.name] || 0
  const anim = m.anim || m.pulse || (m.talk ? 'talk' : '')
  const mark = reach.has(m.name) ? 'yes' : 'DEAD'
  console.log(`  ${pad(m.name, 15)} ${pad(pool || '-', 5)} ${pad(m.fx.join('+') || '-', 22)} ${pad(anim || '-', 15)} ${pad(mark, 6)}`)
}

const dead = moodNames.filter((n) => !reach.has(n))
console.log(`\n  reachable : ${moodNames.length - dead.length}/${moodNames.length}`)
console.log(`  DEAD      : ${dead.length ? dead.join(', ') : '(none)'}`)
const poolless = moodNames.filter((n) => !pools[n])
console.log(`  no variant pool: ${poolless.length} moods -> they rely on the fatigue micro-pose`)
const signed = moodNames.filter((n) => signKeys.includes(n))
console.log(`  sign coverage  : ${signed.length}/${moodNames.length} moods carry a symbol`)

console.log(`\nSTREET SIGN CADENCE\n`)
// Derived from the source, never hardcoded: a stale copy of these numbers here
// would report a duty cycle the running code does not actually have.
const cycleSrc = grab('const cycle =', '\n')
const cm = cycleSrc.match(/=\s*(\d+)\s*\+\s*mod\(seed,\s*(\d+)\)\s*\*\s*(\d+)/)
let meanCycleSecs = 0
if (!cm) {
  console.log('  could not parse the sign cycle expression - check signVisible()')
} else {
  const cycleBase = Number(cm[1])
  const cycleCount = Number(cm[2])
  const cycleStep = Number(cm[3])
  const cycles = Array.from({ length: cycleCount }, (_, k) => cycleBase + k * cycleStep)
  meanCycleSecs = cycles.reduce((a, b) => a + b) / cycles.length / 1000
  const duty = cycles.map((c) => signShow / c)
  const dutyU = cycles.map((c) => signUrgent / c)
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length
  const meanCycle = mean(cycles)
  const pct = (v) => (v * 100).toFixed(0) + '%'
  console.log(`  show ${signShow}ms (urgent ${signUrgent}ms) on cycles ${cycles[0]}-${cycles[cycles.length - 1]}ms`)
  console.log(`  duty cycle normal : ${pct(Math.min(...duty))}-${pct(Math.max(...duty))}  (avg ${pct(mean(duty))})`)
  console.log(`  duty cycle urgent : ${pct(Math.min(...dutyU))}-${pct(Math.max(...dutyU))}  (avg ${pct(mean(dutyU))})`)
  console.log(`  mean sighting gap : every ${(meanCycle / 1000).toFixed(1)}s while a signed mood is held`)
  const BUDGET = 0.25
  if (mean(duty) > BUDGET) console.log(`  BUDGET EXCEEDED     : a normal sign is up ${pct(mean(duty))} of the time (budget ${pct(BUDGET)})`)
  else console.log(`  within budget     : a normal sign is up ${pct(mean(duty))} of the time, and hidden ${pct(1 - mean(duty))}`)
}

console.log(`\nANIMATION INVENTORY\n`)
console.log(`  CSS keyframes    : ${keyframes.length}`)
console.log(`  one-shot actions : ${actions.length}  (${actions.map((a) => a.name).join(', ')})`)
console.log(`  thinking variants: ${Object.values(pools).reduce((a, b) => a + b, 0)} across ${Object.keys(pools).length} pools`)
const fxKinds = new Set()
for (const m of moods) for (const f of m.fx) fxKinds.add(f)
const fxBlock = grab('const FX_COLORS = {', '\n\t\t}')
const fxDeclared = [...fxBlock.matchAll(/^\t\t\t(\w+): \[/gm)].map((m) => m[1])
const driftBlock = grab('const DRIFT = {', '\n\t\t}')
const driftMoods = [...driftBlock.matchAll(/^\t\t\t(\w+): \[/gm)].map((m) => m[1])
const driftKinds = [...new Set([...driftBlock.matchAll(/'(\w+)'/g)].map((m) => m[1]))]
console.log(`  effect fields    : ${fxDeclared.length} declared (${fxDeclared.join(', ')})`)
console.log(`  drift objects    : ${driftKinds.length} kinds across ${driftMoods.length} moods, only after a state is held 45s`)
console.log(`                     ${driftKinds.join(', ')}`)
const wisdomBlock = grab('const WISDOM_LINES = [', '\n\t\t]')
const wisdomLines = [...wisdomBlock.matchAll(/^\t\t\t'(.+)',?$/gm)].map((m) => m[1])
const everyMatch = src.match(/const WISDOM_EVERY = (\d+)/)
const showMatch = src.match(/const WISDOM_SHOW = (\d+)/)
if (wisdomLines.length > 0 && everyMatch && showMatch) {
  const every = Number(everyMatch[1])
  const show = Number(showMatch[1])
  const duty = show / every
  const cycle = (wisdomLines.length * every) / 1000 / 60
  console.log(`  idle sayings     : ${wisdomLines.length} lines, one every ${every / 1000}s for ${show / 1000}s`)
  console.log(`                     audible ${(duty * 100).toFixed(0)}% of a long wait, pool comes round every ${cycle.toFixed(1)} min`)
}

console.log(`\nCADENCE - how often something on screen changes\n`)
const rows = [
  ['body bob', 5.2, 'always'],
  ['look animation', 2.8, 'per look mode (sweep 2.8s / dart .46s / updown 2.1s)'],
  ['thinking variant', 5.0, 'pool moods only'],
  ['effect twinkle', 2.6, 'when a field is up'],
  ['street sign', meanCycleSecs, 'while a signed mood is held'],
  ['ambient richness', 10.0, 'level 1; 26s level 2; 52s level 3'],
  ['fatigue blink', 11.0, 'bare moods; up to 80s for rich ones'],
  ['idle action', 8.0, 'when idle (6s arm + action + 7-17s tier delay)'],
  ['drift objects', 45.0, 'only once a state is held 45s; 21s/27s/33s slow cycles'],
  ['idle saying', 75.0, '9% duty: up for 6.5s, then quiet for 68.5s'],
]
console.log(`  ${pad('layer', 18)} ${pad('period', 8)} note`)
for (const [name, secs, note] of rows) console.log(`  ${pad(name, 18)} ${pad(secs.toFixed(1) + 's', 8)} ${note}`)
const fast = rows.filter(([, s]) => s <= 5.2 && s > 0)
console.log(`\n  ${fast.length} layers run on a period of ~5s or less while a mood is held.`)
console.log(`  The eye look, body bob, effect twinkle and variant rotation are independent`)
console.log(`  oscillators, so the face is never still; the sign was the loudest of them.`)
