/**
 * Offline harness for the companion face bundle.
 *
 * REBUILT after the original was destroyed by a bad `Set-Content` in a shell step: a
 * boolean was assigned over the file content and written out. It is therefore NOT the
 * identical artifact it replaces - it is rewritten against the invariant list at the
 * top of lib/client.js, and individual check wording may differ from the original.
 *
 * What it does: loads lib/client.js into a fabricated browser environment, renders the
 * two registered components, and asserts the contract - mood routing, variant rotation,
 * speech gating, ambient escalation, poke reactions, the street-sign gate, repetition
 * fatigue, bubble reset, drag gravity and the seat.
 *
 * What it cannot do: judge how any of it LOOKS. Timing, feel, colour and taste are not
 * measurable here. Geometry is measured against the head ellipse; whole travel paths
 * and the rotating rings are checked separately by tools/check-fx.mjs.
 *
 * Run: node verify.mjs
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

let failed = 0
let passed = 0
const runtimeProblems = []

/* ---------------- controllable time ---------------- */
const START = 1_700_000_000_000
let clock = START
const timers = new Set()
let timerSeq = 0

// CRITICAL: the plugin derives every duration from Date.now() - alarms, the speech
// window, idle tiers, the held-mood clock. Without this patch the simulated `clock`
// moves while Date.now() keeps returning real wall-clock time, so `advance()` cannot
// expire an alarm and idle durations ignore it entirely. Checks then pass or fail on
// how long the test process happened to take.
const realDateNow = Date.now
Date.now = () => clock
// Pinned so the suite is reproducible: noteMood seeds the held variant from Math.random,
// so an unpinned run varies which effect field a mood shows and therefore which
// geometry assertions run. A flaky suite hides real regressions.
Math.random = () => 0.5

/** Advance the clock, firing due timers in chronological order. */
function advance(ms) {
  const target = clock + ms
  for (;;) {
    let pick = null
    for (const entry of timers) if (entry.at <= target && (!pick || entry.at < pick.at)) pick = entry
    if (!pick) break
    timers.delete(pick)
    clock = pick.at
    try { pick.fn() } catch (error) { runtimeProblems.push('timer threw: ' + error.message) }
  }
  clock = target
}

/* ---------------- animation frames ---------------- */
let rafSeq = 0
const rafQueue = []
const rafLive = new Set()

/** Run `count` animation frames, advancing the clock `stepMs` each frame. */
function flushFrames(count, stepMs) {
  const step = stepMs || 16
  for (let i = 0; i < count; i += 1) {
    clock += step
    const pending = rafQueue.splice(0, rafQueue.length)
    for (const entry of pending) {
      if (!rafLive.has(entry.id)) continue
      rafLive.delete(entry.id)
      entry.cb(clock)
    }
  }
}

/* ---------------- fabricated environment ---------------- */
const storage = new Map()
const domListeners = new Map()

const windowStub = {
  innerWidth: 1280,
  innerHeight: 800,
  requestAnimationFrame(cb) { rafSeq += 1; rafQueue.push({ id: rafSeq, cb }); rafLive.add(rafSeq); return rafSeq },
  cancelAnimationFrame(id) { rafLive.delete(id) },
  addEventListener(type, fn) { if (!domListeners.has(type)) domListeners.set(type, new Set()); domListeners.get(type).add(fn) },
  removeEventListener(type, fn) { if (domListeners.has(type)) domListeners.get(type).delete(fn) },
  localStorage: {
    getItem(k) { return storage.has(k) ? storage.get(k) : null },
    setItem(k, v) { storage.set(k, String(v)) },
  },
}

const documentStub = {
  querySelector() { return null },
  createElement() { return { dataset: {}, textContent: '' } },
  head: { appendChild() {} },
}

/* ---------------- minimal React ---------------- */
// useEffect HONOURS deps and runs cleanups. This matters: the gravity integrator is
// gated on [motionActive], and without cleanups several loops run at once and each
// re-applies the bounce, which hides a working physics step behind a broken one.
const hookState = new Map()
const effectState = new Map()
let currentRender = null

const React = {
  createElement(type, props, ...children) {
    const flat = []
    const push = (c) => {
      if (Array.isArray(c)) { for (const x of c) push(x); return }
      if (c === null || c === undefined || c === false || c === true) return
      flat.push(c)
    }
    for (const c of children) push(c)
    return { type: type, props: props || {}, children: flat }
  },
  useState(init) {
    const key = currentRender.name + '#' + (currentRender.index++)
    if (!hookState.has(key)) hookState.set(key, typeof init === 'function' ? init() : init)
    return [hookState.get(key), (value) => {
      hookState.set(key, typeof value === 'function' ? value(hookState.get(key)) : value)
    }]
  },
  // Refs are deliberately NON-persistent: a fresh ref starts null on every render, so
  // `animRef.current = targetVec` makes the rendered vector exactly the target and
  // geometry assertions stay exact instead of reading a mid-lerp frame.
  useRef() { return { current: null } },
  useMemo(fn) { return fn() },
  useEffect(fn, deps) {
    const key = currentRender.name + '#' + (currentRender.index++)
    const previous = effectState.get(key)
    const next = deps === undefined ? null : deps
    const same = previous && previous.deps !== null && next !== null
      && previous.deps.length === next.length
      && previous.deps.every((d, i) => Object.is(d, next[i]))
    if (same) return
    if (previous && typeof previous.cleanup === 'function') previous.cleanup()
    const record = { deps: next, cleanup: null }
    effectState.set(key, record)
    currentRender.effects.push(() => { record.cleanup = fn() })
  },
}

/* ---------------- cordis context and module host ---------------- */
const registered = new Map()
const ctx = {
  // The permanent bundle wraps its slot registrations in ctx.effect so they are torn
  // down with the plugin; the dynamic package calls the slot API directly.
  effect(fn) { return fn() },
  timeout(fn, ms) {
    timerSeq += 1
    const entry = { id: timerSeq, at: clock + ms, fn }
    timers.add(entry)
    return () => { timers.delete(entry) }
  },
  interval(fn, ms) {
    const arm = () => { ctx.timeout(() => { fn(); arm() }, ms) }
    arm()
    return () => {}
  },
  slots: {
    inject(name, fn) { fn() },
    register(spec, Component) {
      registered.set(spec.id, { spec: spec, Component: Component })
      return () => registered.delete(spec.id)
    },
  },
}

let bundle = null
const windowObj = Object.assign(windowStub, {
  __ModuleLoader__: { load(descriptor) { bundle = descriptor; return descriptor } },
})
const quietConsole = process.env.PROBE ? console : { log() {}, error() {} }
if (process.env.PROBE) windowObj.__DSHCP_PROBE = true

// BUNDLE lets the same harness drive an older bundle, which is how the design sheet renders
// a before/after against the frozen Stable 1 tree without touching it.
const BUNDLE = process.env.BUNDLE || join(here, 'lib', 'client.js')
const source = readFileSync(BUNDLE, 'utf8')
const runner = new Function('React', 'styles', 'host', 'ctx', 'window', 'document', 'console', source)
runner(React, { insert() {} }, { call() {}, handle() {} }, ctx, windowObj, documentStub, quietConsole)

if (!bundle) throw new Error('the bundle never registered itself')
const plugin = bundle.factory((name) => {
  if (name === 'react') return React
  throw new Error('unexpected require: ' + name)
})
plugin.apply(ctx)

const Face = registered.get('dynamic-companion-face')
const Chip = registered.get('dynamic-companion-chip')
const Options = registered.get('dynamic-companion-options')
if (!Face || !Chip) throw new Error('the plugin did not register both slots')

/* ---------------- render and collect ---------------- */
function collect(node, acc) {
  if (node === null || node === undefined || node === false || node === true) return
  if (Array.isArray(node)) { for (const c of node) collect(c, acc); return }
  if (typeof node === 'string' || typeof node === 'number') { acc.text.push(String(node)); return }
  if (typeof node !== 'object') return
  if (node.props && typeof node.props.className === 'string') acc.classes.push(node.props.className)
  acc.nodes.push(node)
  collect(node.children, acc)
}

function render(Component, props) {
  currentRender = { name: Component.spec.id, index: 0, effects: [] }
  const tree = Component.Component(props || {})
  const view = { tree: tree, nodes: [], classes: [], text: [] }
  collect(tree, view)
  const effects = currentRender.effects
  currentRender = null
  for (const run of effects) run()
  return view
}

const findElems = (node, pred, acc) => {
  const out = acc || []
  if (Array.isArray(node)) { for (const c of node) findElems(c, pred, out); return out }
  if (!node || typeof node !== 'object') return out
  if (pred(node)) out.push(node)
  findElems(node.children, pred, out)
  return out
}
const byClass = (view, cls) => findElems(view.tree, (n) => typeof n.props.className === 'string' && n.props.className.split(' ').indexOf(cls) >= 0, [])[0]
const countClass = (view, cls) => findElems(view.tree, (n) => typeof n.props.className === 'string' && n.props.className.split(' ').indexOf(cls) >= 0, []).length
const hasClass = (r, c) => r.classes.some((x) => String(x).split(' ').indexOf(c) >= 0)
const textOf = (node) => { const acc = { nodes: [], classes: [], text: [] }; collect(node, acc); return acc.text.join(' ') }
const bubbleText = (view) => { const b = byClass(view, 'dshcp-bubble'); return b ? textOf(b) : '' }

/**
 * The face's OWN class tokens. `collect` gathers every className in the tree, so the
 * street sign is included - and the sign runs on its own show/hide cycle, which has
 * nothing to do with the face's animation state. Tokens are split because a wrapper
 * carries its state as an extra token ('dshcp-hopwrap dshcp-hop'), so comparing whole
 * strings would treat an unchanged wrapper as a changed element.
 */
const ownClasses = (view) => view.classes
  .flatMap((c) => String(c).split(' '))
  .filter((c) => c !== '' && c !== 'dshcp-sign')

const faceEl = (view) => byClass(view, 'dshcp-face')
const faceLabel = (view) => { const el = faceEl(view); return el ? String(el.props['aria-label'] || '') : '' }
const variantOf = (view) => { const p = faceLabel(view).split(' / '); return p.length > 1 ? p[1] : '' }
const faceTilt = (view) => {
  const el = faceEl(view)
  if (!el) return null
  const m = String(el.props.style.transform || '').match(/rotate\(([-\d.]+)deg\)/)
  return m ? Number(m[1]) : null
}
const scaleOf = (view) => {
  const el = faceEl(view)
  if (!el) return null
  const m = String(el.props.style.transform || '').match(/scale\(([-\d.]+),([-\d.]+)\)/)
  return m ? { x: Number(m[1]), y: Number(m[2]) } : null
}
/**
 * The head silhouette path.
 *
 * Found by its KEY, not by its stroke width. It used to be found by `strokeWidth === 2.8`,
 * so the moment the contour weight changed the helper silently returned null and TWO checks
 * ("the head outline changes between moods", "melt flattens the head shape") failed with a
 * misleading message about the outline not morphing. A key is the thing that actually
 * identifies this element.
 */
const headPathOf = (view) => {
  const el = findElems(view.tree, (n) => n.type === 'path' && n.props && n.props.key === 'head' && typeof n.props.d === 'string', [])[0]
  return el ? String(el.props.d) : null
}
const featureTransformOf = (view) => {
  const el = findElems(view.tree, (n) => n.type === 'g' && typeof n.props.transform === 'string' && n.props.transform.indexOf('scale(') >= 0, [])[0]
  return el ? String(el.props.transform) : null
}
const glowOf = (view) => {
  const el = findElems(view.tree, (n) => n.type === 'circle' && typeof n.props.fill === 'string' && n.props.fill.indexOf('dshcpGlow') >= 0, [])[0]
  return el ? el.props.opacity : null
}
const shadowCount = (view) => findElems(view.tree, (n) => n.props && n.props['data-dshcp-shadow'], []).length

/** The street sign: glyph, plate shape and paints, and the glyph centre. */
function signOf(view) {
  const group = byClass(view, 'dshcp-sign')
  if (!group) return null
  const texts = findElems(group, (n) => n.type === 'text', [])
  if (texts.length === 0) return null
  const plates = findElems(group, (n) => (n.type === 'path' || n.type === 'rect') && typeof n.props.fill === 'string' && n.props.stroke !== undefined, [])
  const plate = plates.length > 0 ? plates[0] : null
  return {
    glyph: texts[0].children.length > 0 ? String(texts[0].children[0]) : '',
    shape: plate ? plate.type : '',
    fill: plate ? String(plate.props.fill) : '',
    stroke: plate ? String(plate.props.stroke) : '',
    cx: Number(texts[0].props.x),
    cy: Number(texts[0].props.y),
  }
}

/* ---------------- snapshot fixtures ---------------- */
const userNode = (text) => ({ kind: 'user', seq: 1, time: clock, content: [{ type: 'text', text: text }] })
const assistantNode = (text) => ({ kind: 'assistant', seq: 2, time: clock, blocks: [{ kind: 'text', text: text }] })
const kindNode = (kind, extra) => Object.assign({ kind: kind, seq: 9, time: clock }, extra || {})
const call = (name) => ({ callId: 'c1', name: name, argsRaw: '{}', turn: 1, step: 1, time: clock, callView: null, subCalls: [] })
const streaming = (kind, text) => ({ turn: 1, step: 1, blocks: [{ kind: kind, text: text }] })

function snapshot(over) {
  return Object.assign({ nodes: [], chat: null, partial: null, runningCalls: [], queue: [], pending: [], running: false, lastAgentError: '', composerPhase: '', blank: false }, over || {})
}
const runningSnap = (label, over) => snapshot(Object.assign({ nodes: [userNode(label), assistantNode('working on it')], running: true }, over || {}))
const chipProps = (snap) => ({ useSession: (pick) => pick(snap), useInput: (pick) => pick({ draft: '' }) })
const longHistory = () => {
  const nodes = [assistantNode('starting')]
  for (let i = 0; i < 150; i += 1) nodes.push(kindNode('tool-result'))
  nodes.push(userNode('and now?'))
  return nodes
}

const reasoningSnap = runningSnap('think it through', { partial: streaming('reasoning', 'weighing options') })
const delegatingSnap = runningSnap('split the work up', { runningCalls: [call('subagent')] })

/* ---------------- assertion helpers ---------------- */
function check(name, fn) {
  let local
  try { local = fn() } catch (error) { local = ['threw: ' + error.message] }
  if (!local || local.length === 0) { passed += 1; console.log('  ok    ' + name) }
  else { failed += 1; console.log('  FAIL  ' + name + '  -> ' + local.join('; ')) }
}

/** Publish a conversation state and let a mood settle before sampling. */
function stage(snap, settleMs) {
  render(Chip, chipProps(snapshot({})))
  render(Face)
  if (snap) render(Chip, chipProps(snap))
  if (settleMs) advance(settleMs)
  return render(Face)
}

/**
 * Hold a mood and sample it. Streamed text is republished on every step so the speech
 * gate keeps seeing fresh content; without that a held reasoning mood goes stale and
 * falls back to pondering.
 */
function holdFace(snap, holdMs) {
  clock += 12000                                  // expire any alarm from an earlier section
  render(Chip, chipProps(snapshot({})))
  render(Face)                                    // let the face see the blank state, resetting the held clock
  render(Chip, chipProps(snap))
  advance(1100)                                   // past the new-message startle, inside the speech window
  let view = render(Face)
  let held = 0
  let ticks = 0
  while (held < holdMs) {
    const step = Math.min(800, holdMs - held)
    advance(step)
    held += step
    if (snap.partial) {
      ticks += 1
      // The text must actually CHANGE on every republish. Appending to the original
      // each time produced an identical string from the second step on, freshness
      // lapsed, and the held mood silently degraded to pondering.
      const blocks = snap.partial.blocks.map((b) => ({ kind: b.kind, text: b.text + ' ' + String(ticks) }))
      render(Chip, chipProps(Object.assign({}, snap, { partial: { turn: 1, step: 1, blocks: blocks } })))
    }
    view = render(Face)
  }
  return view
}

/* ================= 1. mood routing ================= */
console.log('\n--- mood routing ---')

const MOOD_CASES = [
  ['idle on a blank conversation', snapshot({}), 'idle', 500, ''],
  ['listening while you type', snapshot({}), 'listening', 500, 'let me explain'],
  ['curious about a question', snapshot({ nodes: [userNode('what about the other one?')] }), 'curious', 500, ''],
  ['thinking while running with no output', runningSnap('do the thing'), 'thinking', 500, ''],
  ['searching during grep', runningSnap('find it', { runningCalls: [call('grep')] }), 'searching', 500, ''],
  ['writing during edit', runningSnap('fix it', { runningCalls: [call('edit')] }), 'writing', 500, ''],
  ['planning during todo_write', runningSnap('plan it', { runningCalls: [call('todo_write')] }), 'planning', 500, ''],
  ['running a command', runningSnap('run it', { runningCalls: [call('pwsh')] }), 'running', 500, ''],
  ['delegating to a subagent', delegatingSnap, 'delegating', 500, ''],
  ['needs you on an approval', snapshot({ nodes: [userNode('go')], pending: [{ kind: 'approval', payload: { toolName: 'pwsh' } }] }), 'needs you', 500, ''],
  ['happy after a positive answer', snapshot({ nodes: [userNode('build it'), assistantNode('Done, all set and ready')] }), 'happy', 500, ''],
  ['disappointed after a negative answer', snapshot({ nodes: [userNode('build it'), assistantNode('That failed, sorry')] }), 'disappointed', 500, ''],
  ['confused when told it is wrong', snapshot({ nodes: [userNode('build it'), assistantNode('ok'), userNode('that is wrong')] }), 'confused', 8000, ''],
  ['yawning before boredom sets in', snapshot({ nodes: [userNode('hi'), assistantNode('hello')] }), 'yawning', 30000, ''],
  ['bored after a longer idle', snapshot({ nodes: [userNode('hi'), assistantNode('hello')] }), 'bored', 60000, ''],
  ['sleepy after a very long idle', snapshot({ nodes: [userNode('hi'), assistantNode('hello')] }), 'sleepy', 200000, ''],
]

for (const [name, snap, expect, wait, draft] of MOOD_CASES) {
  check(name, () => {
    clock += 300000
    render(Chip, chipProps(snapshot({})))
    if (process.env.PROBE) console.log('        [probe] after blank publish:', faceLabel(render(Face)))
    const props = draft ? { useSession: (pick) => pick(snap), useInput: (pick) => pick({ draft: draft }) } : chipProps(snap)
    render(Chip, props)
    if (process.env.PROBE) console.log('        [probe] after real publish :', faceLabel(render(Face)))
    advance(wait)
    const label = faceLabel(render(Face))
    if (process.env.PROBE) console.log(`        [probe] ${name} after +${wait}ms:`, label)
    return label.indexOf(expect) >= 0 ? [] : [`expected "${expect}", got "${label}"`]
  })
}

check('a stable thinking mood keeps an active variant', () => {
  const view = holdFace(runningSnap('do the thing'), 2000)
  const label = faceLabel(view)
  if (label.indexOf('thinking') < 0) return [`expected thinking, got ${label}`]
  if (variantOf(view) === '') return ['expected an active thinking variant']
  return []
})

/* ================= 2. variant rotation ================= */
console.log('\n--- thinking variants ---')

check('the pool rotates on a 5s clock', () => {
  clock += 300000
  render(Chip, chipProps(snapshot({})))
  render(Chip, chipProps(runningSnap('do the thing')))
  advance(1100)
  const seen = []
  for (let i = 0; i < 10; i += 1) {
    seen.push(variantOf(render(Face)))
    advance(5000)
  }
  const unique = new Set(seen.filter(Boolean))
  if (unique.size < 3) return [`expected several variants over 50s, saw ${[...unique].join(',') || '(none)'}`]
  console.log(`        (${[...unique].join(' ')})`)
  return []
})

/* ================= 3. speech gating ================= */
console.log('\n--- speech gating ---')

check('a streamed answer opens the mouth', () => {
  const view = holdFace(runningSnap('say something', { partial: streaming('text', 'here is the answer') }), 1000)
  if (faceLabel(view).indexOf('answering') < 0) return [`expected answering, got ${faceLabel(view)}`]
  if (!hasClass(view, 'dshcp-talk')) return ['expected the mouth to animate']
  return []
})

check('an answer whose stream stalls closes the mouth', () => {
  const view = holdFace(runningSnap('say something', { partial: streaming('text', 'here is the answer') }), 1500)
  advance(4000)                                   // no republish: the text goes stale
  const still = render(Face)
  const label = faceLabel(still)
  if (label.indexOf('thinking') < 0) return [`expected thinking after the stream stalled, got ${label}`]
  if (hasClass(still, 'dshcp-talk')) return ['the mouth kept moving on stale text']
  return []
})

check('an over-long answer composes instead of talking', () => {
  const view = holdFace(runningSnap('say something', { partial: streaming('text', 'x'.repeat(400)) }), 1000)
  const label = faceLabel(view)
  if (label.indexOf('composing') < 0) return [`expected composing past the length gate, got ${label}`]
  if (hasClass(view, 'dshcp-talk')) return ['the mouth moved on an over-long answer']
  return []
})

/* ================= 4. ambient escalation ================= */
console.log('\n--- ambient escalation ---')

check('level 1 after ~12s adds stardust and glow', () => {
  const view = holdFace(reasoningSnap, 12000)
  if (process.env.PROBE) console.log('        [probe] level1 mood=' + faceLabel(view) + ' glow=' + glowOf(view) + ' twinkle=' + countClass(view, 'dshcp-twinkle'))
  const local = []
  if (glowOf(view) !== 0.3) local.push('expected glow 0.3 at level 1, got ' + glowOf(view))
  if (countClass(view, 'dshcp-twinkle') === 0) local.push('expected stardust at level 1')
  return local
})

check('level 2 after ~20s is cumulative', () => {
  const view = holdFace(reasoningSnap, 20000)
  if (process.env.PROBE) console.log('        [probe] level2 mood=' + faceLabel(view) + ' glow=' + glowOf(view))
  const local = []
  if (glowOf(view) !== 0.55) local.push('expected glow 0.55 at level 2, got ' + glowOf(view))
  if (countClass(view, 'dshcp-twinkle') === 0) local.push('level 2 dropped the level-1 layer')
  if (countClass(view, 'dshcp-sloworbit') === 0) local.push('expected stars at level 2')
  return local
})

check('level 3 after ~60s maxes the glow', () => {
  const view = holdFace(reasoningSnap, 60000)
  if (process.env.PROBE) console.log('        [probe] level3 mood=' + faceLabel(view) + ' glow=' + glowOf(view))
  const local = []
  if (glowOf(view) !== 0.8) local.push('expected glow 0.8 at level 3, got ' + glowOf(view))
  if (countClass(view, 'dshcp-rise') === 0) local.push('expected bubbles at level 3')
  return local
})

check('per-mood rush ripens a mood sooner than raw time allows', () => {
  // firstContact has rush 3.0 and no alarm: 5.5s x 3.0 = 16.5s effective -> level 2.
  // Without the rush factor 5.5s alone would be level 1. The mood is bounded (it ends
  // once the run passes 8s), so the hold stays inside that window.
  const snap = snapshot({ nodes: [userNode('hello')], running: true })
  const view = holdFace(snap, 5500)
  return glowOf(view) === 0.55 ? [] : [`expected glow 0.55 (level 2 via rush), got ${glowOf(view)}`]
})

check('ambient layers never duplicate a base fx', () => {
  const view = holdFace(delegatingSnap, 60000)
  const orbits = countClass(view, 'dshcp-orbit')
  return orbits === 1 ? [] : ['expected exactly 1 orbit group, got ' + orbits]
})

check('changing mood resets the ambient richness', () => {
  holdFace(reasoningSnap, 30000)
  render(Chip, chipProps(runningSnap('now write it up', { runningCalls: [call('write')] })))
  advance(600)
  const view = render(Face)
  return glowOf(view) === null ? [] : ['richness survived a mood change (glow ' + glowOf(view) + ')']
})

/* ================= 5. rare moods ================= */
console.log('\n--- rare conversation states ---')

const RARE_CASES = [
  ['a compaction remembers', snapshot({ nodes: [userNode('go'), kindNode('compaction')], running: true }), 'remembering'],
  ['an unknown node kind baffles', snapshot({ nodes: [userNode('go'), kindNode('unknown')], running: true }), 'baffled'],
  ['a steering message realigns', snapshot({ nodes: [userNode('go'), kindNode('steering')], running: true }), 'realigning'],
  ['a context injection is received', snapshot({ nodes: [userNode('go'), kindNode('context')], running: true }), 'receiving'],
  ['a slash command commands', snapshot({ nodes: [userNode('go'), assistantNode('ok'), kindNode('command')], running: true }), 'commanding'],
  ['truncated output overflows', snapshot({ nodes: [userNode('go'), assistantNode('ok'), kindNode('turn-max-tokens')], running: true }), 'overflowing', 10000],
  ['a model retry recovers', snapshot({ nodes: [userNode('go'), assistantNode('ok'), kindNode('model-retry')], running: true }), 'recovering', 10000],
  ['two delegating calls conduct', runningSnap('fan out', { runningCalls: [call('subagent'), call('workflow')] }), 'conducting'],
  ['three tools at once juggle', runningSnap('do everything', { runningCalls: [call('read'), call('glob'), call('grep')] }), 'juggling'],
  ['two queued messages juggle', runningSnap('one more thing', { queue: [{}, {}] }), 'juggling'],
  ['a very long history consults the archivist', snapshot({ nodes: longHistory(), running: true }), 'archivist'],
  ['an opening turn is a first contact', snapshot({ nodes: [userNode('hello')], running: true }), 'first contact'],
]

for (const [name, snap, expect, hold] of RARE_CASES) {
  check(name, () => {
    const label = faceLabel(holdFace(snap, hold || 1200))
    return label.indexOf(expect) >= 0 ? [] : [`expected "${expect}", got "${label}"`]
  })
}

check('a very long think goes into deep focus', () => {
  const label = faceLabel(holdFace(runningSnap('think hard'), 130000))
  return label.indexOf('deep focus') >= 0 ? [] : [`expected "deep focus", got "${label}"`]
})

/* ================= 6. poke reactions ================= */
console.log('\n--- poke reactions ---')

const POOL = ['startle', 'giggle', 'wobble', 'squish', 'stretch', 'spin', 'blush', 'annoyed', 'dizzy', 'melt', 'pop', 'shrink', 'love', 'peek', 'boing']
const POOL_INDEX = {}
for (let i = 0; i < POOL.length; i += 1) POOL_INDEX[POOL[i]] = i

function withRandom(value, fn) {
  const original = Math.random
  Math.random = () => value
  try { return fn() } finally { Math.random = original }
}

function clickFace(view) {
  const el = faceEl(view)
  el.props.onPointerDown({ button: 0, pointerId: 1, clientX: 10, clientY: 10, currentTarget: null })
  el.props.onPointerUp({ pointerId: 1 })
}

function pokeCase(name, poke, ms, opts) {
  check(poke + ' -> ' + name, () => {
    clock += 12000
    render(Chip, chipProps(snapshot({})))
    render(Chip, chipProps(runningSnap('do the thing')))
    advance(2000)
    flushFrames(40, 16)
    const base = render(Face)
    const baseScale = scaleOf(base)
    withRandom((POOL_INDEX[poke] + 0.5) / POOL.length, () => clickFace(base))
    render(Face)
    flushFrames(30, 16)
    const during = render(Face)
    const local = []
    for (const cls of opts.classes || []) if (!hasClass(during, cls)) local.push('missing class ' + cls)
    if (opts.bubble && bubbleText(during).indexOf(opts.bubble) < 0) local.push(`bubble lacks "${opts.bubble}" (got: ${bubbleText(during).slice(0, 60)})`)
    if (opts.scaleBelow !== undefined) { const s = scaleOf(during); if (!s || s.x >= opts.scaleBelow) local.push('scale should be < ' + opts.scaleBelow) }
    if (opts.scaleWithin) {
      const s = scaleOf(during)
      if (!s || s.x < opts.scaleWithin[0] || s.x > opts.scaleWithin[1]) local.push('expected the vector scale to stay in ' + JSON.stringify(opts.scaleWithin) + ', got ' + JSON.stringify(s))
    }
    if (opts.headDiffers) { const a = headPathOf(base); const b = headPathOf(during); if (!a || !b || a === b) local.push('head outline did not morph') }
    advance(ms + 400)
    flushFrames(40, 16)                  // let the click's own drop settle
    const after = render(Face)
    // Expiry must undo the poke. Asserted by POKE-ADDED classes and the head outline
    // rather than a raw class-set comparison: the idle gesture scheduler can fire an
    // unrelated action between the two renders, which made a correct reset look wrong.
    const baseClasses = ownClasses(base)
    const lingering = ownClasses(during)
      .filter((c) => baseClasses.indexOf(c) < 0)
      .filter((c) => ownClasses(after).indexOf(c) >= 0)
    if (lingering.length > 0) local.push('poke classes survived expiry: ' + lingering.join(','))
    if (headPathOf(after) !== headPathOf(base)) local.push('the head outline did not return')
    return local
  })
}

pokeCase('startle shows the surprise bubble', 'startle', 1050, { bubble: 'Oh!' })
pokeCase('giggle bounces with sparkles', 'giggle', 1500, { classes: ['dshcp-bounce', 'dshcp-sparkle'], bubble: 'Hehe!' })
pokeCase('squish is CSS-only', 'squish', 950, { classes: ['dshcp-squish'], scaleWithin: [0.85, 1.15] })
pokeCase('spin rotates', 'spin', 950, { classes: ['dshcp-spin'] })
pokeCase('melt flattens the head shape', 'melt', 1500, { headDiffers: true, bubble: 'blorp...' })
pokeCase('pop is CSS-only', 'pop', 850, { classes: ['dshcp-popout'], scaleWithin: [0.85, 1.15] })
pokeCase('shrink resizes via the vector', 'shrink', 900, { scaleBelow: 0.7, bubble: 'eek!' })
pokeCase('love floats hearts', 'love', 1800, { classes: ['dshcp-float', 'dshcp-bounce'] })

/* ================= 7. transformation ================= */
console.log('\n--- transformation ---')

check('features are wrapped in a morph group', () => {
  const view = stage(runningSnap('do the thing'), 900)
  return featureTransformOf(view) ? [] : ['features are not wrapped in a morph group']
})

check('the head outline changes between moods', () => {
  const a = stage(snapshot({ nodes: [userNode('build it'), assistantNode('Done, all set and ready')] }), 900)
  const b = holdFace(snapshot({ nodes: [userNode('x'), assistantNode('y'), kindNode('tool-result', { isError: true, call: { name: 'pwsh' } })] }), 1500)
  return headPathOf(a) === headPathOf(b) ? ['the head outline did not change between moods'] : []
})

/* ================= 8. effects clear the face ================= */
console.log('\n--- effects stay off the face ---')

const HEAD_SHAPE = { cx: 50, cy: 52, rx: 43, ry: 41 }
const PARTICLE_TRAVEL = { 'dshcp-rise': -24, 'dshcp-fall': 22, 'dshcp-float': -17 }
// Only the EFFECT fields. The face's own 'dshcp-tint' ring and head outline also carry
// dshcp- classes, and they are supposed to be inside the face.
const FX_CLASSES = ['dshcp-twinkle', 'dshcp-dot', 'dshcp-rise', 'dshcp-fall', 'dshcp-float', 'dshcp-sparkle', 'dshcp-flicker', 'dshcp-halo', 'dshcp-orbit', 'dshcp-sloworbit', 'dshcp-revorbit', 'dshcp-swirl', 'dshcp-sweat', 'dshcp-steam', 'dshcp-zzz']
// Half-extent of each path shape. One generous radius reported the small spark zigzags
// (~5 units) as reaching into the face when they do not.
const FX_RADIUS = { 'dshcp-flicker': 5, 'dshcp-sparkle': 6.5, 'dshcp-sloworbit': 9, 'dshcp-revorbit': 6.3, 'dshcp-float': 8, 'dshcp-sweat': 6 }
const radiusFor = (kind) => {
  for (const t of kind.split(' ')) if (FX_RADIUS[t] !== undefined) return FX_RADIUS[t]
  return 8
}

/** Walk the tree accumulating translate(x,y), so each particle's real position is known. */
function particlesOf(view) {
  const out = []
  // `inherited` carries an fx class down from a wrapping <g>. The orbit, swirl and star
  // fields put the class on the GROUP and leave the circles/paths unclassed, so without
  // this they were invisible to the checker and reported as "no particles rendered".
  const walk = (node, tx, ty, inherited) => {
    if (Array.isArray(node)) { for (const c of node) walk(c, tx, ty, inherited); return }
    if (!node || typeof node !== 'object') return
    let nx = tx
    let ny = ty
    const t = node.props && node.props.transform
    if (typeof t === 'string') {
      const m = t.match(/translate\(([-\d.]+)[, ]+([-\d.]+)\)/)
      if (m) { nx += Number(m[1]); ny += Number(m[2]) }
    }
    const own = String((node.props && node.props.className) || '')
    const isFx = FX_CLASSES.some((fx) => own.split(' ').indexOf(fx) >= 0)
    const cls = own || inherited
    const childInherit = isFx ? own : inherited
    const p = node.props || {}
    if (node.type === 'circle' && typeof p.cx === 'number') out.push({ kind: cls, x: nx + p.cx, y: ny + p.cy, r: typeof p.r === 'number' ? p.r : 0 })
    else if (node.type === 'ellipse' && typeof p.cx === 'number') out.push({ kind: cls, x: nx + p.cx, y: ny + p.cy, r: typeof p.ry === 'number' ? p.ry : 2 })
    else if (node.type === 'rect' && typeof p.x === 'number') out.push({ kind: cls, x: nx + p.x + (p.width || 0) / 2, y: ny + p.y + (p.height || 0) / 2, r: 2 })
    else if (node.type === 'text' && typeof p.x === 'number') out.push({ kind: cls, x: nx + p.x, y: ny + p.y, r: 7 })
    else if (node.type === 'path' && cls.indexOf('dshcp-') >= 0) {
      // Star and sparkle paths are drawn CENTRED on their origin, so a translated path
      // sits at the translate. Only an untranslated path (the sparks) carries its
      // position in its own data.
      if (nx !== 0 || ny !== 0) out.push({ kind: cls, x: nx, y: ny, r: radiusFor(cls) })
      else {
        const m = String(p.d || '').match(/M\s*(-?[\d.]+)[ ,]+(-?[\d.]+)/)
        if (m) out.push({ kind: cls, x: Number(m[1]), y: Number(m[2]), r: radiusFor(cls) })
      }
    }
    walk(node.children, nx, ny, childInherit)
  }
  walk(view.tree, 0, 0, '')
  return out.filter((p) => FX_CLASSES.some((fx) => p.kind.split(' ').indexOf(fx) >= 0))
}

/**
 * Pull each particle's nearest point toward the head centre, then test the ellipse.
 * Sampling along the travel path matters: fields that rise or fall sweep through the
 * head even when their resting position is clear.
 */
function faceClearance(view) {
  const bad = []
  for (const p of particlesOf(view)) {
    const travel = PARTICLE_TRAVEL[p.kind.split(' ')[0]] || 0
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      let x = p.x
      let y = p.y + travel * t
      const dx = HEAD_SHAPE.cx - x
      const dy = HEAD_SHAPE.cy - y
      const len = Math.hypot(dx, dy) || 1
      if (p.r > len) continue
      x += (dx / len) * p.r
      y += (dy / len) * p.r
      const metric = ((x - HEAD_SHAPE.cx) / HEAD_SHAPE.rx) ** 2 + ((y - HEAD_SHAPE.cy) / HEAD_SHAPE.ry) ** 2
      if (metric <= 1) bad.push(`${p.kind} at (${Math.round(x)},${Math.round(y)}) lands inside the face`)
    }
  }
  return bad
}

const FIELD_CASES = [
  ['dots while thinking', () => holdFace(runningSnap('do the thing'), 1200)],
  ['stardust and stars at max richness', () => holdFace(reasoningSnap, 60000)],
  ['sparkles on delight', () => holdFace(snapshot({ nodes: [userNode('a'), assistantNode('b'), userNode('perfect, thank you')] }), 1200)],
  ['embers on a retry', () => holdFace(snapshot({ nodes: [userNode('go'), assistantNode('x'), kindNode('model-retry')], running: true }), 9000)],
  ['bubbles on incoming context', () => holdFace(snapshot({ nodes: [userNode('go'), assistantNode('x'), kindNode('context')], running: true }), 1200)],
  ['swirl on an unknown node', () => holdFace(snapshot({ nodes: [userNode('go'), assistantNode('x'), kindNode('unknown')], running: true }), 1200)],
  ['orbit while delegating', () => holdFace(delegatingSnap, 1200)],
  ['codeflow while writing', () => holdFace(runningSnap('w', { runningCalls: [call('edit')] }), 1200)],
  ['halo over a long history', () => holdFace(snapshot({ nodes: longHistory(), running: true }), 60000)],
  ['zzz while sleepy', () => holdFace(snapshot({ nodes: [userNode('hi'), assistantNode('Hello there, ready when you are')] }), 200000)],
]

check('every effect field clears the head', () => {
  let total = 0
  const local = []
  for (const [name, make] of FIELD_CASES) {
    const view = make()
    const count = particlesOf(view).length
    if (process.env.PROBE) console.log('        [probe] field: ' + faceLabel(view) + ' -> ' + count + ' particles, fx classes: ' + view.classes.filter((c) => c.indexOf('dshcp-') >= 0).join('|'))
    total += count
    if (count === 0) local.push(name + ' : no particles (mood: ' + faceLabel(view) + ', classes: ' + view.classes.join('|') + ')')
    for (const p of faceClearance(view)) local.push(name + ': ' + p)
  }
  if (local.length === 0) console.log(`        (${total} particles across ${FIELD_CASES.length} states all clear the face)`)
  return local.slice(0, 4)
})

/* ================= 9. drift objects ================= */
console.log('\n--- long-haul drift objects ---')

const driftLayer = (view) => byClass(view, 'dshcp-drift-layer')
const driftKinds = (view) => {
  const layer = driftLayer(view)
  if (!layer) return []
  return findElems(layer, (n) => n.props['data-drift'] !== undefined, []).map((n) => String(n.props['data-drift']))
}
/** Where the drift layer sits among the SVG children, relative to the head path. */
function driftBehindHead(view) {
  const kids = []
  const walk = (node) => {
    if (Array.isArray(node)) { for (const c of node) walk(c); return }
    if (!node || typeof node !== 'object') return
    kids.push(node)
    walk(node.children)
  }
  walk(view.tree)
  const driftAt = kids.findIndex((n) => n.props && n.props.className === 'dshcp-drift-layer')
  const headAt = kids.findIndex((n) => n.props && n.props.key === 'head')
  if (driftAt < 0) return { present: false, driftAt: -1, headAt: headAt }
  return { present: true, driftAt: driftAt, headAt: headAt, behind: driftAt < headAt }
}

check('a young state shows no drift objects', () => {
  const layer = driftLayer(holdFace(reasoningSnap, 20000))
  return layer ? ['drift appeared after only 20s'] : []
})

check('a state that drags on grows a drift layer', () => {
  const view = holdFace(reasoningSnap, 46000)
  const layer = driftLayer(view)
  if (!layer) return ['no drift layer after 46s of reasoning']
  const kinds = driftKinds(view)
  if (kinds.length === 0) return ['the drift layer is empty']
  if (kinds.length > 4) return ['too many drift objects: ' + kinds.length]
  console.log(`        (${kinds.join(', ')})`)
  return []
})

check('drift objects are the ones assigned to that mood', () => {
  // reasoning is assigned cloud / letter / clock. Anything else means the mood-to-object
  // mapping is not what it claims to be.
  const expected = ['cloud', 'letter', 'clock']
  const stray = driftKinds(holdFace(reasoningSnap, 46000)).filter((k) => expected.indexOf(k) < 0)
  return stray.length === 0 ? [] : ['unassigned drift objects: ' + stray.join(', ')]
})

check('a different mood drifts different objects', () => {
  const kinds = driftKinds(holdFace(delegatingSnap, 46000))
  const expected = ['note', 'letter']
  if (kinds.length === 0) return ['delegating showed no drift']
  const stray = kinds.filter((k) => expected.indexOf(k) < 0)
  return stray.length === 0 ? [] : ['delegating drifted ' + stray.join(', ') + ' (expected only ' + expected.join('/') + ')']
})

check('drift renders behind the head so the face occludes it', () => {
  const where = driftBehindHead(holdFace(reasoningSnap, 46000))
  if (!where.present) return ['no drift layer to place']
  if (where.headAt < 0) return ['could not find the head path']
  return where.behind ? [] : [`the drift layer is drawn AFTER the head (${where.driftAt} vs ${where.headAt})`]
})

check('drift stays faint', () => {
  const layer = driftLayer(holdFace(reasoningSnap, 46000))
  if (!layer) return ['no drift layer']
  const opacity = Number(layer.props.opacity)
  if (!(opacity > 0)) return ['the drift layer has no opacity']
  return opacity <= 0.35 ? [] : [`drift opacity ${opacity} is too strong for a background layer`]
})

check('an urgent state never drifts', () => {
  // A pending approval can be held indefinitely. It must stay legible.
  const snap = snapshot({ nodes: [userNode('go'), assistantNode('ok')], pending: [{ kind: 'approval', payload: { toolName: 'pwsh' } }] })
  const view = holdFace(snap, 46000)
  if (faceLabel(view).indexOf('needs you') < 0) return [`setup failed: got ${faceLabel(view)}`]
  return driftLayer(view) ? ['an approval prompt grew background objects'] : []
})

/**
 * Placement: the two things that decide whether drift is ever SEEN.
 *
 * The layer renders behind the head, so a glyph under the silhouette is erased rather
 * than layered, and two glyphs handed one spot are drawn at identical coordinates.
 * Neither was covered, and both were broken in v20: two of six spots had their centres
 * INSIDE the head (metric 0.91, so they could never be seen at all), and the spot stride
 * `i * 3 mod 6` resolved to 0,3,0 for a three-object pool. The free margin inside the
 * 100x100 box is 7 units while a glyph needs 8-11, so nothing could ever have been whole.
 */

/** Per-glyph half-extents, read out of the bundle so the check cannot drift from the code. */
const DRIFT_EXTENT = (() => {
  const at = source.indexOf('const DRIFT_EXTENT = ')
  if (at < 0) return {}
  const from = source.indexOf('{', at)
  const to = source.indexOf('}', from)
  const out = {}
  for (const pair of source.slice(from + 1, to).split(',')) {
    const bits = pair.split(':')
    if (bits.length === 2) out[bits[0].trim()] = Number(bits[1])
  }
  return out
})()

/** Each drift object's spot and scale, read off its rendered transform. */
function driftPlacements(view) {
  const layer = driftLayer(view)
  if (!layer) return []
  return findElems(layer, (n) => n.props['data-drift'] !== undefined, []).map((n) => {
    const m = String(n.props.transform || '').match(/translate\(([-\d.]+)[, ]+([-\d.]+)\)\s*scale\(([-\d.]+)\)/)
    return {
      kind: String(n.props['data-drift']),
      x: m ? Number(m[1]) : NaN,
      y: m ? Number(m[2]) : NaN,
      s: m ? Number(m[3]) : NaN,
    }
  })
}

const driftMetric = (x, y) => Math.pow((x - HEAD_SHAPE.cx) / HEAD_SHAPE.rx, 2) + Math.pow((y - HEAD_SHAPE.cy) / HEAD_SHAPE.ry, 2)

/** Worst (smallest) ellipse metric over every glyph box, plus the object that owns it. */
function driftClearance(view) {
  let worst = Infinity
  let at = null
  for (const d of driftPlacements(view)) {
    const h = (DRIFT_EXTENT[d.kind] === undefined ? 11 : DRIFT_EXTENT[d.kind]) * d.s
    for (let dx = -h; dx <= h + 1e-9; dx += h / 2) {
      for (let dy = -h; dy <= h + 1e-9; dy += h / 2) {
        const value = driftMetric(d.x + dx, d.y + dy)
        if (value < worst) { worst = value; at = d }
      }
    }
  }
  return { worst, at }
}

// Pools of 2, 3 and 4 objects, sampled at every spot offset.
//
// The offset is `mod(variantSeed + floor(heldMs / 20s), 8)`, so it can be walked two ways.
// Holding longer than 120s is NOT one of them: past that point `rareThinkingMood` switches
// the run to `deepDive`, whose own held clock is then only a few seconds old, so no drift
// has accumulated and the sample reads as "zero objects". Four holds inside the window
// give four consecutive offsets (51k/71k/91k/111k -> cycle 2..5), and a second pinned seed
// four apart gives the other four. Expected counts come from min(4, pool length).
//
// The holds start at 51s rather than 46s on purpose: `now` is only recomputed when the 2s
// tick or a store bump changes, so the render clock can sit up to one tick behind the
// timer clock. A sample 1s past the 45s threshold therefore measures the lag, not the
// feature, and reads as a false failure.
//
// `overflowing` is deliberately NOT a sweep case even though its pool has four objects.
// A newly truncated turn raises the 8s agitation alarm, so the mood is `agitated` until
// that expires and its held clock only starts ~9s in: at a 51s hold it has drifted for
// 42s and legitimately shows nothing. Sweeping it here would test the alarm, not the
// drift. `juggling` reaches four objects with no alarm in the way.
const DRIFT_SWEEP = [
  ['reasoning/3', reasoningSnap, 3],
  ['delegating/2', delegatingSnap, 2],
  ['archivist/4', snapshot({ nodes: longHistory(), running: true }), 4],
  ['juggling/4', runningSnap('keep it all up', { runningCalls: [call('grep'), call('edit'), call('pwsh')] }), 4],
]
// 0.5 -> floor(0.5 * 997) = 498 variants seed; 0.504 -> 502. Offsets differ by 4.
const DRIFT_PICKS = [[0.5, 'seed A'], [0.504, 'seed B']]
const DRIFT_HOLDS = [51000, 71000, 91000, 111000]
const driftSamples = []
for (const [name, snap, expected] of DRIFT_SWEEP) {
  for (const [pick, seedName] of DRIFT_PICKS) {
    for (const holdMs of DRIFT_HOLDS) {
      const view = withRandom(pick, () => holdFace(snap, holdMs))
      driftSamples.push({
        name, expected, view, label: faceLabel(view), placed: driftPlacements(view),
        where: `${name} ${seedName} @${Math.round(holdMs / 1000)}s`,
      })
    }
  }
}

check('every drift object gets its own spot', () => {
  const local = []
  let total = 0
  for (const s of driftSamples) {
    if (s.placed.length !== s.expected) {
      local.push(`${s.where}: drew ${s.placed.length} objects, expected ${s.expected} (mood read as ${s.label})`)
      continue
    }
    total += s.placed.length
    const seen = new Map()
    for (const d of s.placed) {
      const key = d.x + ',' + d.y
      if (seen.has(key)) local.push(`${s.where}: a ${seen.get(key)} and a ${d.kind} are stacked on [${key}]`)
      seen.set(key, d.kind)
    }
  }
  if (total === 0) return ['not one drift object was rendered across all ' + driftSamples.length + ' samples']
  if (local.length === 0) {
    const spots = new Set()
    for (const s of driftSamples) for (const d of s.placed) spots.add(d.x + ',' + d.y)
    console.log(`        (${total} objects across ${driftSamples.length} samples, ${spots.size} distinct spots, none shared)`)
  }
  return local.slice(0, 4)
})

check('no drift object is buried in the face', () => {
  const local = []
  let tightest = Infinity
  let tightestAt = ''
  for (const s of driftSamples) {
    if (s.placed.length === 0) continue
    const { worst, at } = driftClearance(s.view)
    if (worst < tightest) {
      tightest = worst
      tightestAt = `${s.where}: ${at.kind} at [${at.x},${at.y}]`
    }
    // 1.05 is a clearance floor, not just "outside": at metric 1.00 the inner corner of
    // the glyph is grazing the silhouette and it reads as a clipped shape.
    if (worst <= 1.05) local.push(`${s.where}: ${at.kind} at [${at.x},${at.y}] metric ${worst.toFixed(3)}`)
  }
  if (tightest === Infinity) return ['no drift sample produced a placement']
  console.log(`        (tightest clearance ${tightest.toFixed(3)} — ${tightestAt})`)
  return local.slice(0, 4)
})

/* ================= 10. accessories + retouch ================= */
console.log('\n--- praise accessories ---')

/** Walk to the accessory group and return the whole ancestor chain, or null. */
function accessoryChain(view) {
  let found = null
  const walk = (node, path) => {
    if (found) return
    if (Array.isArray(node)) { for (const c of node) walk(c, path); return }
    if (!node || typeof node !== 'object') return
    const next = path.concat([node])
    if (node.props && node.props['data-acc'] !== undefined) { found = next; return }
    walk(node.children, next)
  }
  walk(view.tree, [])
  return found
}
const accessoryKind = (view) => { const a = accessoryChain(view); return a ? String(a[a.length - 1].props['data-acc']) : '' }

const PRAISE = 'amazing, thank you'
const KINDS = ['sunglasses', 'glasses', 'partyHat', 'topHat', 'cap', 'beanie', 'crown', 'headphones', 'bowTie', 'monocle', 'flowerCrown', 'scarf']

/** Publish a two-message exchange ending in `reply`, and sample the face. */
function replyView(reply, settle) {
  clock += 20000                                 // clear any accessory from an earlier case (16s life)
  render(Chip, chipProps(snapshot({})))
  render(Face)
  render(Chip, chipProps(snapshot({ nodes: [userNode('build the thing')] })))
  render(Face)
  render(Chip, chipProps(snapshot({ nodes: [userNode('build the thing'), assistantNode('done'), userNode(reply)] })))
  advance(settle === undefined ? 600 : settle)
  return render(Face)
}

check('praise dresses the companion up', () => {
  const kind = accessoryKind(replyView(PRAISE))
  if (kind === '') return ['kind words produced no accessory']
  if (KINDS.indexOf(kind) < 0) return ['unknown accessory: ' + kind]
  console.log(`        (wearing ${kind})`)
  return []
})

check('an ordinary message wears nothing', () => {
  const kind = accessoryKind(replyView('now do the next one'))
  return kind === '' ? [] : ['a plain message produced ' + kind]
})

check('a correction wears nothing', () => {
  const kind = accessoryKind(replyView('that is wrong, revert it'))
  return kind === '' ? [] : ['a correction produced ' + kind]
})

check('the accessory comes off again', () => {
  if (accessoryKind(replyView(PRAISE)) === '') return ['setup failed: nothing was worn']
  advance(17000)                                   // ACCESSORY_MS is 16000
  const later = render(Face)
  const kind = accessoryKind(later)
  return kind === '' ? [] : ['the accessory never came off: ' + kind]
})

check('two compliments in a row look different', () => {
  // Read each immediately: replyView already advances past the accessory's life, so a
  // settle here would expire the very thing being compared.
  const first = accessoryKind(replyView(PRAISE))
  const second = accessoryKind(replyView(PRAISE))
  if (first === '' || second === '') return ['one of the compliments produced nothing']
  return first === second ? ['both compliments wore the same ' + first] : []
})

check('the accessory rides the head morph', () => {
  // It must live inside the feature-scale group, or a hat would drift off the silhouette
  // every time the face squashed.
  const chain = accessoryChain(replyView(PRAISE))
  if (!chain) return ['no accessory to place']
  const scaled = chain.some((n) => typeof n.props.transform === 'string' && n.props.transform.indexOf('scale(') >= 0)
  return scaled ? [] : ['the accessory is outside the morph group']
})

console.log('\n--- character retouch ---')

const byKey = (view, key) => findElems(view.tree, (n) => n.props && n.props.key === key, [])[0]
/** The blink shows as the open-eye group going to opacity 0 and the lid arc to 1. */
const eyeClosed = (view) => { const g = byKey(view, 'L-open'); return !!g && g.props.opacity === 0 }

check('the face blinks on its own', () => {
  // A face that never blinks reads as a doll. Sampled at 40ms across 12s of simulated time so
  // the 140ms closed window cannot be missed by coarse sampling.
  clock += 12000
  render(Chip, chipProps(snapshot({})))
  render(Chip, chipProps(runningSnap('do the thing')))
  advance(1100)
  let view = render(Face)
  let closed = 0
  const SAMPLES = 300
  for (let i = 0; i < SAMPLES; i += 1) {
    if (eyeClosed(view)) closed += 1
    advance(40)
    view = render(Face)
  }
  if (closed === 0) return ['the eyes never closed across 12s']
  const duty = closed / SAMPLES
  if (duty > 0.15) return [`the eyes were shut ${(duty * 100).toFixed(0)}% of the time - that is a stare, not a blink`]
  console.log(`        (${closed}/${SAMPLES} samples shut, ${(duty * 100).toFixed(1)}%)`)
  return []
})

check('a shut lid never shows the eyeball through it', () => {
  // Asserted as an invariant over samples rather than "sleepy means arcOpacity is exactly 1":
  // an idle gesture (peek sets 0.85) can legitimately override the mood, so pinning the value
  // tests the fixture, not the character. Whenever the lid is shut, the eyeball must be hidden.
  const snap = snapshot({ nodes: [userNode('hi'), assistantNode('Hello there, ready when you are')] })
  clock += 12000
  render(Chip, chipProps(snapshot({})))
  render(Face)
  render(Chip, chipProps(snap))
  advance(200000)
  let view = render(Face)
  let shutSamples = 0
  for (let i = 0; i < 40; i += 1) {
    const arc = byKey(view, 'L-arc')
    const open = byKey(view, 'L-open')
    if (!arc || !open) return ['could not find the eye groups']
    if (Number(arc.props.opacity) >= 0.95) {
      shutSamples += 1
      if (Number(open.props.opacity) > 0.05) {
        return [`the eyeball shows through a shut lid (open=${open.props.opacity}, arc=${arc.props.opacity})`]
      }
    }
    advance(250)
    view = render(Face)
  }
  if (shutSamples === 0) return ['setup failed: the lid never fully shut across the sweep']
  console.log(`        (${shutSamples} shut samples, eyeball hidden in all)`)
  return []
})

check('the silhouette outweighs the interior lines', () => {
  // Line-weight hierarchy: the contour carries the shape, the features sit inside it.
  const view = holdFace(runningSnap('do the thing'), 1200)
  const head = byKey(view, 'head')
  const sclera = findElems(view.tree, (n) => n.type === 'ellipse' && n.props.className === 'dshcp-eye', [])[0]
  if (!head || !sclera) return ['could not find the head outline or an eye']
  const hw = Number(head.props.strokeWidth)
  const sw = Number(sclera.props.strokeWidth)
  return hw > sw ? [] : [`the contour (${hw}) does not outweigh the eye outline (${sw})`]
})

/* ================= 12. the illustration's own palette ================= */
console.log('\n--- design: palette and line system ---')

/** WCAG contrast, so "is the outline visible" is a number and not an opinion. */
function relativeLuminance(hex) {
  const h = String(hex).replace('#', '')
  const full = h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h
  const parts = []
  for (let i = 0; i < 3; i += 1) {
    const c = parseInt(full.slice(i * 2, i * 2 + 2), 16) / 255
    parts.push(c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
  }
  return 0.2126 * parts[0] + 0.7152 * parts[1] + 0.0722 * parts[2]
}
function contrastRatio(a, b) {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/**
 * Read a flat `const NAME = { key: 'string', ... }` table out of the bundle.
 *
 * Deliberately a regex over key/value pairs rather than a JSON.parse of the slice: the
 * bundle's style puts a trailing comma on the last entry, which JSON rejects, and the first
 * attempt at this returned null and reported a false failure rather than a parse problem.
 */
function stringMap(name) {
  const at = source.indexOf('const ' + name + ' = {')
  if (at < 0) return null
  const open = source.indexOf('{', at)
  let depth = 0
  let end = -1
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1
    else if (source[i] === '}') { depth -= 1; if (depth === 0) { end = i; break } }
  }
  if (end < 0) return null
  const out = {}
  for (const m of source.slice(open, end + 1).matchAll(/([A-Za-z_$][\w$]*)\s*:\s*'([^']+)'/g)) out[m[1]] = m[2]
  return Object.keys(out).length > 0 ? out : null
}

const ACCENTS = stringMap('ACCENT')
const MOOD_KEYS = (() => {
  const from = source.indexOf('const MOODS = {')
  const to = source.indexOf('const THINK_VARIANTS')
  if (from < 0 || to < 0) return []
  return [...source.slice(from, to).matchAll(/^\t{3}([A-Za-z][A-Za-z0-9]*): \{/gm)].map((m) => m[1])
})()

check('the face never themes half a drawing', () => {
  // THE bug this section exists for. Ink, sclera and contour used to come from
  // `--dsw-alias-*` tokens while the skin was a fixed off-white. `--dsw-alias-label-primary`
  // resolves to neutral-bluish-1000 in the light theme and neutral-bluish-50 in the dark
  // one, so in dark mode the face drew near-white features on a near-white head. Nothing
  // may theme part of a drawing: either the whole face follows the shell or none of it does,
  // and an illustration with its own material has to choose "none".
  const view = holdFace(runningSnap('do the thing'), 1200)
  const offline = []
  const walk = (node) => {
    if (Array.isArray(node)) { for (const c of node) walk(c); return }
    if (!node || typeof node !== 'object') return
    const p = node.props || {}
    for (const key of ['fill', 'stroke', 'stopColor']) {
      if (typeof p[key] === 'string' && p[key].indexOf('var(--dsw-alias') >= 0) {
        offline.push(`${node.type}.${key} = ${p[key]}`)
      }
    }
    walk(node.children)
  }
  walk(view.tree)
  return offline.slice(0, 4)
})

check('the contour is visible against the skin', () => {
  // The old outline was `--dsw-alias-border-l2` (#cfd4dc) on a head whose darkest tone was
  // #e9eef6: about 1.26:1, invisible. It was also the HEAVIEST line in the drawing at 2.8,
  // so a lot of weight was doing no work - which is what "the design has some flow there"
  // looks like. Weight without contrast reads as a wobble rather than as an edge.
  const view = holdFace(runningSnap('do the thing'), 1200)
  const head = byKey(view, 'head')
  if (!head) return ['no head path']
  const skin = findElems(view.tree, (n) => n.props && n.props.id === 'dshcpSkin', [])[0]
  const stops = skin ? findElems(skin, (n) => n.type === 'stop', []) : []
  if (stops.length === 0) return ['could not read the skin gradient']
  const darkest = String(stops[stops.length - 1].props.stopColor)
  const ratio = contrastRatio(String(head.props.stroke), darkest)
  console.log(`        (contour ${head.props.stroke} on skin ${darkest} = ${ratio.toFixed(2)}:1, was 1.26:1)`)
  return ratio >= 4.5 ? [] : [`the contour is only ${ratio.toFixed(2)}:1 against the skin`]
})

check('the contour is thinner than it was, and still the heaviest line', () => {
  const view = holdFace(runningSnap('do the thing'), 1200)
  const head = byKey(view, 'head')
  if (!head) return ['no head path']
  const contour = Number(head.props.strokeWidth)
  const group = byKey(view, 'features')
  const inner = group ? findElems(group, (n) => typeof n.props.strokeWidth === 'number', []) : []
  const heaviest = inner.reduce((max, n) => Math.max(max, Number(n.props.strokeWidth)), 0)
  const local = []
  if (!(contour <= 1.8)) local.push(`the contour is ${contour}, expected 1.8 or less`)
  if (!(heaviest < contour)) local.push(`an interior line is ${heaviest}, which does not sit inside a ${contour} contour`)
  if (inner.length === 0) local.push('no interior strokes found to compare')
  return local
})

check('every mood has its own colour', () => {
  if (!ACCENTS) return ['could not read the ACCENT table']
  const keys = Object.keys(ACCENTS)
  const values = keys.map((k) => ACCENTS[k])
  const local = []
  const missing = MOOD_KEYS.filter((m) => !ACCENTS[m])
  if (missing.length) local.push('moods with no accent: ' + missing.join(', '))
  const extra = keys.filter((k) => MOOD_KEYS.indexOf(k) < 0)
  if (extra.length) local.push('accents for moods that do not exist: ' + extra.join(', '))
  const dupes = values.filter((v, i) => values.indexOf(v) !== i)
  if (dupes.length) local.push('moods sharing an accent: ' + [...new Set(dupes)].join(', '))
  // The rim and glow sit next to skin, so the accent has to be separable from it.
  const flat = values.filter((v) => contrastRatio(v, '#ffffff') < 1.5)
  if (flat.length) local.push('accents too pale to read against the skin: ' + flat.join(', '))
  if (local.length === 0) console.log(`        (${keys.length} moods, ${new Set(values).size} distinct accents, was 7 shared tokens)`)
  return local.slice(0, 4)
})

check('the mood colour follows the silhouette, not a circle', () => {
  // The old ring was a perfect circle (r 46) filled with the mood colour behind a rounded
  // SQUARE blob: a band at the sides, nothing at the corners, and a second outline that
  // disagreed with the first. The rim has to be a stroke on a copy of the head path.
  const view = holdFace(runningSnap('do the thing'), 1200)
  const rim = byKey(view, 'rim')
  if (!rim) return ['no rim element']
  const local = []
  if (rim.type !== 'path') local.push('the rim is a ' + rim.type + ', not a path following the head')
  if (!/^#[0-9a-f]{6}$/.test(String(rim.props.stroke))) local.push('the rim is not stroked with a literal accent')
  if (String(rim.props.fill) !== 'none') local.push('the rim is filled, so it hides the face instead of edging it')
  const head = byKey(view, 'head')
  if (head && String(rim.props.d) === String(head.props.d)) local.push('the rim is exactly the head outline, so it shows nothing')
  const discs = findElems(view.tree, (n) => n.type === 'circle' && Number(n.props.r) > 40 && typeof n.props.fill === 'string' && n.props.fill.charAt(0) === '#', [])
  if (discs.length) local.push('a filled disc is still drawn behind the head: ' + discs[0].props.fill)
  if (local.length === 0) console.log(`        (rim stroke ${rim.props.strokeWidth}, opacity ${rim.props.opacity})`)
  return local
})

check('the accessory fades out before it goes', () => {
  const view = replyView(PRAISE)
  if (accessoryKind(view) === '') return ['setup failed: nothing was worn']
  advance(15300)                                   // into the last 380ms of its 16s life
  const leaving = accessoryChain(render(Face))
  if (!leaving) return ['the accessory vanished before its leaving phase']
  const cls = String(leaving[leaving.length - 1].props.className || '')
  return cls.indexOf('dshcp-accout') >= 0 ? [] : ['expected an exit animation class, got: ' + cls]
})

check('a negated compliment is not praise', () => {
  // "this is not very good" contains "very good". Before the guard, the companion dressed up
  // for an insult.
  const kind = accessoryKind(replyView('this is not very good'))
  return kind === '' ? [] : ['a negated compliment dressed the companion in ' + kind]
})

check('both eyes carry two glints', () => {
  // One glint reads as a dot; two read as a wet sphere. Guards the retouch.
  const view = holdFace(runningSnap('do the thing'), 1200)
  const glints = findElems(view.tree, (n) => n.type === 'circle' && n.props.fill === '#ffffff', [])
  return glints.length === 4 ? [] : [`expected 4 glints (2 per eye), got ${glints.length}`]
})

check('the head carries a clipped form shadow', () => {
  const view = holdFace(runningSnap('do the thing'), 1200)
  const shade = findElems(view.tree, (n) => n.type === 'rect' && String(n.props.clipPath || '').indexOf('dshcpHeadClip') >= 0, [])
  if (shade.length !== 1) return ['expected exactly 1 clipped shadow, got ' + shade.length]
  const clip = findElems(view.tree, (n) => n.type === 'clipPath' && n.props.id === 'dshcpHeadClip', [])
  if (clip.length !== 1) return ['the clip path is missing, so the shadow would spill outside the head']
  return []
})

check('brows are filled tapered shapes, not uniform strokes', () => {
  const view = holdFace(runningSnap('do the thing'), 1200)
  const brows = findElems(view.tree, (n) => typeof n.props.className === 'string' && n.props.className === 'dshcp-brow', [])
  if (brows.length !== 2) return ['expected 2 brows, got ' + brows.length]
  for (const b of brows) {
    if (b.props.fill === 'none') return ['a brow is still an unfilled stroke']
    if (!String(b.props.d).endsWith('Z')) return ['a brow is not a closed tapered outline']
  }
  return []
})

/* ================= 11. street sign ================= */
console.log('\n--- street sign (notable moods only) ---')

function signCase(name, snap, settleMs, expectGlyph) {
  check(name, () => {
    clock += 12000                              // expire any alarm left by an earlier case
    render(Chip, chipProps(snapshot({})))
    render(Face)                                // reset the held clock before the real state
    render(Chip, chipProps(snap))
    advance(settleMs)
    const sign = signOf(render(Face))
    if (expectGlyph === null) return sign ? [`expected no sign, got "${sign.glyph}"`] : []
    if (!sign) return ['no sign rendered']
    const local = []
    if (sign.glyph !== expectGlyph) local.push(`expected glyph "${expectGlyph}", got "${sign.glyph}"`)
    if (sign.cx < 60 || sign.cy < 60) local.push(`not in the lower-right corner (${sign.cx}, ${sign.cy})`)
    // The European warning-triangle identity.
    if (sign.shape !== 'path') local.push(`the plate is a <${sign.shape}>, not a triangle`)
    if (sign.fill.toLowerCase() !== '#ffffff') local.push(`expected a white field, got ${sign.fill}`)
    if (sign.stroke.toLowerCase() !== '#cc0605') local.push(`expected a red warning border, got ${sign.stroke}`)
    return local
  })
}

// The gate: routine work must carry NO sign, or a sign on everything says nothing.
signCase('idle wears no sign', snapshot({}), 900, null)
signCase('routine thinking carries no sign', runningSnap('do the thing'), 900, null)
signCase('routine reasoning carries no sign', reasoningSnap, 900, null)
signCase('routine searching carries no sign', runningSnap('find it', { runningCalls: [call('grep')] }), 900, null)
signCase('routine writing carries no sign', runningSnap('fix it', { runningCalls: [call('edit')] }), 900, null)
signCase('routine delegating carries no sign', delegatingSnap, 900, null)
signCase('routine commands carry no sign', runningSnap('run it', { runningCalls: [call('pwsh')] }), 900, null)

// Notable: attention-demanding states and the rare ones.
signCase('an approval demands an exclamation', snapshot({ nodes: [userNode('go'), assistantNode('ok')], pending: [{ kind: 'approval', payload: { toolName: 'pwsh' } }] }), 900, '!')
signCase('a correction shouts twice', snapshot({ nodes: [userNode('build it'), assistantNode('done'), userNode('that is wrong, revert it')] }), 900, '!!')
signCase('an unknown node asks twice', snapshot({ nodes: [userNode('go'), kindNode('unknown')], running: true }), 900, '??')
signCase('incoming context points down', snapshot({ nodes: [userNode('go'), kindNode('context')], running: true }), 900, '\u2193')
signCase('a slash command shows a prompt', snapshot({ nodes: [userNode('go'), assistantNode('ok'), kindNode('command')], running: true }), 900, '>')
signCase('a compaction shows a star', snapshot({ nodes: [userNode('go'), kindNode('compaction')], running: true }), 900, '\u2606')
signCase('a model retry turns around', snapshot({ nodes: [userNode('go'), assistantNode('ok'), kindNode('model-retry')], running: true }), 10000, '\u21BB')
signCase('two delegating calls conduct', runningSnap('fan out', { runningCalls: [call('subagent'), call('workflow')] }), 900, '\u221E')
signCase('a long history consults the archivist', snapshot({ nodes: longHistory(), running: true }), 900, '\u2606')
signCase('an opening turn waves', snapshot({ nodes: [userNode('hello')], running: true }), 500, '\u2605')

check('the sign stays rare', () => {
  clock += 12000
  render(Chip, chipProps(snapshot({})))
  render(Chip, chipProps(snapshot({ nodes: [userNode('go'), kindNode('compaction')], running: true })))
  advance(1000)
  let view = render(Face)
  const SAMPLES = 120
  let seen = 0
  for (let i = 0; i < SAMPLES; i += 1) {
    if (signOf(view)) seen += 1
    advance(250)
    view = render(Face)
  }
  const duty = seen / SAMPLES
  if (seen === 0) return ['the sign never appeared across 30s']
  if (duty > 0.30) return [`the sign is on screen ${(duty * 100).toFixed(0)}% of the time - it must stay rare`]
  console.log(`        (${(duty * 100).toFixed(0)}% of 30s, ${seen}/${SAMPLES} samples)`)
  return []
})

/* ================= 10. bubble reset ================= */
console.log('\n--- bubble reset ---')

check('the bubble is a clickable, focusable control', () => {
  const view = stage(runningSnap('do the thing'), 1200)
  const bubble = byClass(view, 'dshcp-bubble')
  if (!bubble) return ['no bubble rendered']
  const local = []
  if (bubble.props.role !== 'button') local.push('the bubble is not a button')
  if (typeof bubble.props.onClick !== 'function') local.push('the bubble has no click handler')
  if (bubble.props.tabIndex !== 0) local.push('the bubble is not focusable')
  if (typeof bubble.props.onKeyDown !== 'function') local.push('the bubble has no keyboard handler')
  return local
})

check('each click resumes on a different variant', () => {
  render(Chip, chipProps(snapshot({})))
  render(Chip, chipProps(runningSnap('do the thing')))
  advance(1200)
  let view = render(Face)
  const seen = []
  for (let i = 0; i < 4; i += 1) {
    const before = variantOf(view)
    const bubble = byClass(view, 'dshcp-bubble')
    if (!bubble) return ['no bubble to click on step ' + i]
    bubble.props.onClick({ stopPropagation() {} })
    view = render(Face)
    const after = variantOf(view)
    if (after === '' || after === before) return [`click ${i + 1} repeated "${after}" instead of moving on (was ${before})`]
    seen.push(after)
  }
  console.log(`        (${seen.join(' -> ')})`)
  return []
})

check('a click drops the ambient richness back to level 0', () => {
  const view = holdFace(reasoningSnap, 30000)
  if (process.env.PROBE) console.log('        [probe] richness mood=' + faceLabel(view) + ' glow=' + glowOf(view))
  if (glowOf(view) === null) return ['setup failed: no richness to reset']
  const bubble = byClass(view, 'dshcp-bubble')
  if (!bubble) return ['no bubble to click']
  bubble.props.onClick({ stopPropagation() {} })
  const after = render(Face)
  return glowOf(after) === null ? [] : ['richness survived the reset (glow ' + glowOf(after) + ')']
})

check('a mood with no variant pool still resets, without crashing', () => {
  const view = stage(snapshot({ nodes: [userNode('build it'), assistantNode('Done, all set and ready')] }), 900)
  const bubble = byClass(view, 'dshcp-bubble')
  if (!bubble) return ['no bubble rendered']
  bubble.props.onClick({ stopPropagation() {} })
  const after = render(Face)
  return faceLabel(after).indexOf('happy') >= 0 ? [] : ['the mood did not survive the reset: ' + faceLabel(after)]
})

/* ================= 11. repetition fatigue ================= */
console.log('\n--- repetition fatigue ---')

check('a bare mood blinks to idle and returns on a new pose', () => {
  const snap = snapshot({ nodes: [userNode('build it'), assistantNode('Done, all set and ready')] })
  clock += 12000
  render(Chip, chipProps(snapshot({})))
  render(Chip, chipProps(snap))
  advance(1500)                                   // past the startle
  let view = render(Face)
  const beforeLabel = faceLabel(view)
  const beforeTilt = faceTilt(view)
  let sawIdle = false
  let idleTilt = null
  for (let i = 0; i < 50; i += 1) {
    const label = faceLabel(view)
    if (label.indexOf('idle') >= 0) { sawIdle = true; idleTilt = faceTilt(view) }
    advance(250)
    view = render(Face)
  }
  const afterTilt = faceTilt(view)
  if (beforeLabel.indexOf('happy') < 0) return [`setup failed: expected happy, got ${beforeLabel}`]
  if (!sawIdle) return ['a pool-less mood never blinked to idle across a whole fatigue cycle']
  if (idleTilt !== null && idleTilt !== 0) return [`the blink should show plain idle, tilt was ${idleTilt}`]
  if (beforeTilt === null || afterTilt === null) return ['could not read the face tilt']
  if (beforeTilt === afterTilt) return [`the return pose was identical (${beforeTilt})`]
  console.log(`        (${beforeTilt} -> ${afterTilt})`)
  return []
})

check('an exempt mood never blinks', () => {
  const snap = runningSnap('answer me', { partial: streaming('text', 'Here is the answer') })
  clock += 12000
  render(Chip, chipProps(snapshot({})))
  render(Chip, chipProps(snap))
  advance(1500)
  let view = render(Face)
  let sawIdle = false
  let sawAnswering = false
  for (let i = 0; i < 150; i += 1) {
    const label = faceLabel(view)
    if (label.indexOf('idle') >= 0) sawIdle = true
    if (label.indexOf('answering') >= 0) sawAnswering = true
    advance(250)
    if (i % 3 === 2) render(Chip, chipProps(Object.assign({}, snap, { partial: streaming('text', 'Here is the answer ' + i) })))
    view = render(Face)
  }
  if (!sawAnswering) return ['setup failed: the stream never held the answering mood']
  if (sawIdle) return ['a mood whose motion IS the message blinked to idle']
  return []
})

check('the blink advances the variant', () => {
  // Sampled tightly either side of the blink: heating to 45800 and 47800 both floor to
  // tick 9, so the ONLY difference is the blink's own +1 tick. Sampling far apart would
  // let the ordinary 5s rotation satisfy this instead of the blink.
  clock += 12000
  render(Chip, chipProps(snapshot({})))
  const feed = (i) => {
    render(Chip, chipProps(Object.assign({}, reasoningSnap, { partial: streaming('reasoning', 'weighing options ' + i) })))
    return render(Face)
  }
  let view = feed(0)
  advance(800)
  view = render(Face)
  const beforeLabel = faceLabel(view)
  for (let i = 1; i <= 90; i += 1) { advance(500); view = feed(i) }
  const before = variantOf(view)
  for (let i = 91; i <= 94; i += 1) { advance(500); view = feed(i) }
  const after = variantOf(view)
  if (beforeLabel.indexOf('reasoning') < 0) return [`setup failed: expected reasoning, got ${beforeLabel}`]
  if (before === '') return ['setup failed: no variant pool was active']
  if (faceLabel(view).indexOf('reasoning') < 0) return ['the mood drifted to ' + faceLabel(view)]
  if (after === before) return [`the variant did not advance across the blink (${before})`]
  console.log(`        (${before} -> ${after})`)
  return []
})

/* ================= 12. drag gravity ================= */
console.log('\n--- drag gravity (held -> fall -> bounce -> settle) ---')

check('a drag moves the face, then it falls and settles at the drop point', () => {
  clock += 12000
  render(Chip, chipProps(snapshot({})))
  render(Chip, chipProps(runningSnap('do the thing')))
  advance(2000)
  flushFrames(40, 16)

  const el = faceEl(render(Face))
  el.props.onPointerDown({ button: 0, pointerId: 1, clientX: 100, clientY: 100, currentTarget: null })
  render(Face)
  const liftedShadow = shadowCount(render(Face))

  el.props.onPointerMove({ pointerId: 1, clientX: 160, clientY: 140 })
  const movedBox = render(Face).tree.props.style
  el.props.onPointerUp({ pointerId: 1 })
  const airborneShadow = shadowCount(render(Face))

  flushFrames(200, 16)
  const rest = render(Face)
  const restBox = rest.tree.props.style

  const local = []
  if (!movedBox || !restBox) local.push('no positioned wrapper')
  else if (movedBox.left !== restBox.left || movedBox.top !== restBox.top) {
    local.push(`the face drifted after landing: ${movedBox.left},${movedBox.top} -> ${restBox.left},${restBox.top}`)
  }
  if (movedBox && restBox && movedBox.left === '100px') local.push('the drag did not move the face')
  if (liftedShadow === 0) local.push('expected a contact shadow while held')
  if (shadowCount(rest) !== 0) local.push('the contact shadow should be gone once landed')
  return local
})

/* ================= 12b. the drop bounces, and the blink closes ================= */
console.log('\n--- drop bounce and eyelid ---')

/** Height above the resting spot, read out of the face's own transform. */
const liftOf = (view) => {
  const el = faceEl(view)
  const m = el ? String(el.props.style.transform || '').match(/translate\([-\d.]+px,\s*([-\d.]+)px\)/) : null
  return m ? -Number(m[1]) : NaN
}

check('a dropped face leaves the ground again before it settles', () => {
  // The bounce is BOUNCE^2 * DRAG_LIFT of apex. At the original 0.42 that was 4.6px, which
  // is real but easy to miss; at 0.55 it is 7.9px. This asserts the SHAPE of the envelope
  // rather than a constant: the face must touch down and then leave the ground AGAIN, and
  // must come to rest. A regression to a dead stop fails on the airborne-phase count.
  clock += 12000
  render(Chip, chipProps(snapshot({})))
  render(Chip, chipProps(runningSnap('do the thing')))
  advance(2000)
  flushFrames(40, 16)

  const el = faceEl(render(Face))
  el.props.onPointerDown({ button: 0, pointerId: 1, clientX: 100, clientY: 100, currentTarget: null })
  render(Face)
  el.props.onPointerMove({ pointerId: 1, clientX: 140, clientY: 120 })
  el.props.onPointerUp({ pointerId: 1 })

  const track = []
  for (let i = 0; i < 240; i += 1) { flushFrames(1, 16); track.push(liftOf(render(Face))) }
  if (track.some((v) => !Number.isFinite(v))) return ['could not read the face height']
  if (!(track[0] > 1)) return ['setup: the face was not airborne at the drop']

  let airPhases = 1
  let wasAir = true
  let firstBounceApex = 0
  for (const lift of track) {
    const air = lift > 0.2
    if (air && !wasAir) airPhases += 1
    // Only the phase that begins at the FIRST landing. An earlier version reassigned this on
    // every bounce, so it ended up measuring the fourth micro-bounce and reported 1.4px for a
    // rebound that actually reaches 24.5px.
    if (air && airPhases === 2) firstBounceApex = Math.max(firstBounceApex, lift)
    wasAir = air
  }
  const rest = track[track.length - 1]
  const local = []
  if (airPhases < 2) local.push(`the face never left the ground after landing (${airPhases} airborne phase)`)
  else if (firstBounceApex < 2.5) local.push(`the rebound apex is only ${firstBounceApex.toFixed(1)}px`)
  if (Math.abs(rest) > 0.3) local.push(`the face never came to rest (ended ${rest.toFixed(1)}px off the ground)`)
  if (local.length === 0) console.log(`        (${airPhases} airborne phases, rebound apex ${firstBounceApex.toFixed(1)}px, settled at 0)`)
  return local
})

check('a closed eye is a lid, not a deleted eye', () => {
  // Closing used to remove the sclera, pupil, glints and lash line and leave ONE 1.45-wide
  // arc exactly where the eye had been. Two thin dashes instead of eyes reads as a corpse -
  // and `sleepy` and `yawning` hold that shape for their whole duration, so it was never
  // just a 140ms glimpse. The lid must now carry MASS (a filled crescent) and a lash.
  //
  // Swept rather than pinned to `sleepy`, because an idle gesture (peek sets arcOpacity 0.85)
  // legitimately overrides the mood - pinning the value tests the fixture, not the character.
  const snap = snapshot({ nodes: [userNode('hi'), assistantNode('Hello there, ready when you are')] })
  clock += 12000
  render(Chip, chipProps(snapshot({})))
  render(Face)
  render(Chip, chipProps(snap))
  advance(200000)
  let view = render(Face)
  let shut = null
  for (let i = 0; i < 60 && !shut; i += 1) {
    const lid = byKey(view, 'L-arc')
    if (lid && Number(lid.props.opacity) >= 0.95) shut = view
    else { advance(250); view = render(Face) }
  }
  if (!shut) return ['setup: the lid never fully shut across the sweep']
  const lid = byKey(shut, 'L-arc')
  const lash = byKey(shut, 'L-lash')
  if (!lash) return ['the closed eye has no lash']
  const local = []
  if (String(lid.props.fill) === 'none' || lid.props.fill === undefined) {
    local.push('the closed lid is a hairline stroke, so it has no mass')
  }
  if (String(lid.props.d).indexOf('Z') < 0) local.push('the closed lid is not a closed shape')
  const open = byKey(shut, 'L-open')
  if (Number(open.props.opacity) > 0.05) local.push('the eyeball still shows through the shut lid')
  if (local.length === 0) console.log(`        (lid is a filled crescent with a lash, eyeball hidden)`)
  return local
})

check('the blink is a snap, not a crossfade', () => {
  // THE spooky-eyes bug, and it is arithmetic: the stylesheet eases opacity over 400ms
  // while BLINK_MS is 140. The eye could therefore only reach about half-closed before it
  // started opening again, so the open eye and the lid were each ~50% visible at the same
  // time - a ghosted double image. `dshcp-blink` must (a) be applied while blinking and
  // (b) actually switch the transition off.
  if (source.indexOf('.dshcp-blink{transition:none') < 0) {
    return ['no .dshcp-blink rule, so the 400ms fade still smears a 140ms blink']
  }
  clock += 12000
  render(Chip, chipProps(snapshot({})))
  render(Chip, chipProps(runningSnap('do the thing')))
  advance(1100)
  let view = render(Face)
  let blinkSamples = 0
  for (let i = 0; i < 300; i += 1) {
    if (eyeClosed(view)) {
      blinkSamples += 1
      const open = byKey(view, 'L-open')
      const lid = byKey(view, 'L-arc')
      if (String(open.props.className || '').indexOf('dshcp-blink') < 0) return ['the open eye keeps its transition during a blink']
      if (String(lid.props.className || '').indexOf('dshcp-blink') < 0) return ['the lid keeps its transition during a blink']
    }
    advance(40)
    view = render(Face)
  }
  if (blinkSamples === 0) return ['setup: the face never blinked across the sweep']
  console.log(`        (${blinkSamples} blink samples, transition disabled in all)`)
  return []
})

check('decorative paint outside the face box cannot steal a click', () => {
  // The glow disc has r 60 on a 100-unit viewBox and the aura reaches past the silhouette, so
  // both paint well OUTSIDE the face's own box. Painted SVG is hit-testable by default
  // (visiblePainted) and SVG overflow is visible here, so an invisible halo roughly 12px wide
  // was swallowing clicks meant for whatever sits behind the companion. The glow had done this
  // since the beginning; the aura widened it.
  const view = holdFace(runningSnap('do the thing'), 60000)
  const local = []
  // Matched on type as well as key: the `<radialGradient>` in defs is ALSO keyed 'glow', and
  // `byKey` returns the first match - so a key-only lookup here inspected the gradient and
  // reported a failure against the wrong element.
  const glow = findElems(view.tree, (n) => n.type === 'circle' && n.props && n.props.key === 'glow', [])[0]
  if (!glow) local.push('setup: no glow disc to inspect')
  else if (glow.props.pointerEvents !== 'none') local.push('the r-60 glow disc is hit-testable outside the face')
  for (const key of ['rim', 'rimWide']) {
    const node = byKey(view, key)
    if (!node) local.push('setup: no ' + key + ' to inspect')
    else if (node.props.pointerEvents !== 'none') local.push('the ' + key + ' aura is hit-testable outside the face')
  }
  return local
})

check('the face drags along BOTH axes independently', () => {
  // Reported from a real session as "I can move it only up-down". The handler is symmetric, so
  // the only way one axis pins is `clampPos` collapsing that axis to a constant - which happens
  // if `vw - size - 6 <= 6` (a viewport narrower than the face plus the margins) or if the
  // coordinate is non-finite, in which case `left: NaNpx` is dropped by the CSS parser while
  // `top` still applies. This drives each axis on its own and asserts the other one holds.
  const local = []
  const seatAt = (x, y) => {
    clock += 12000
    render(Chip, chipProps(snapshot({})))
    render(Chip, chipProps(runningSnap('do the thing')))
    advance(2000)
    flushFrames(40, 16)
    const el = faceEl(render(Face))
    const start = render(Face).tree.props.style
    return { el, x: Number(String(start.left).replace('px', '')), y: Number(String(start.top).replace('px', '')) }
  }
  // Drags TOWARD the middle of the screen: an earlier check leaves the face near the right
  // edge, and a rightward drag from there is correctly clamped to 0 - which my first version
  // of this check misread as a pinned axis.
  const toward = (seat, dx, dy) => {
    const ax = dx === 0 ? 0 : (seat.x > (windowObj.innerWidth || 1280) / 2 ? -Math.abs(dx) : Math.abs(dx))
    const ay = dy === 0 ? 0 : (seat.y > (windowObj.innerHeight || 800) / 2 ? -Math.abs(dy) : Math.abs(dy))
    return { ax: ax, ay: ay }
  }

  const dragBy = (dx, dy) => {
    const seat = seatAt()
    const dir = toward(seat, dx, dy)
    seat.el.props.onPointerDown({ button: 0, pointerId: 1, clientX: 400, clientY: 400, currentTarget: null })
    render(Face)
    seat.el.props.onPointerMove({ pointerId: 1, clientX: 400 + dir.ax, clientY: 400 + dir.ay })
    const box = render(Face).tree.props.style
    seat.el.props.onPointerUp({ pointerId: 1 })
    return {
      wantX: dir.ax,
      wantY: dir.ay,
      dx: Number(String(box.left).replace('px', '')) - seat.x,
      dy: Number(String(box.top).replace('px', '')) - seat.y,
    }
  }

  const right = dragBy(90, 0)
  if (!(Number.isFinite(right.dx) && Number.isFinite(right.dy))) return [`a horizontal drag produced ${right.dx},${right.dy}`]
  if (Math.abs(right.dx - right.wantX) > 1) local.push(`a ${right.wantX}px horizontal drag moved x by ${right.dx}`)
  if (Math.abs(right.dy) > 1) local.push(`a horizontal drag leaked ${right.dy}px into y`)

  const up = dragBy(0, 90)
  if (!(Number.isFinite(up.dx) && Number.isFinite(up.dy))) return [`a vertical drag produced ${up.dx},${up.dy}`]
  if (Math.abs(up.dy - up.wantY) > 1) local.push(`a ${up.wantY}px vertical drag moved y by ${up.dy}`)
  if (Math.abs(up.dx) > 1) local.push(`a vertical drag leaked ${up.dx}px into x`)

  // And the collapsing case: a viewport too narrow to hold the face plus its margins must not
  // pin x for the whole session. window.innerWidth is restored afterwards.
  const realWidth = windowObj.innerWidth
  windowObj.innerWidth = 100
  const narrow = dragBy(40, 0)
  windowObj.innerWidth = realWidth
  if (Math.abs(narrow.dx - narrow.wantX) > 1) local.push(`on a 100px viewport a ${narrow.wantX}px drag moved x by ${narrow.dx} (pinned)`)

  if (local.length === 0) console.log(`        (x ${right.dx}px, y ${up.dy}px, narrow-viewport x ${narrow.dx}px)`)
  return local
})

/* ================= 13. chip and seat ================= */
console.log('\n--- chip and seat ---')

check('the chip names the mood and tints itself', () => {
  render(Chip, chipProps(snapshot({})))
  render(Chip, chipProps(runningSnap('do the thing')))
  advance(500)
  const chip = byClass(render(Chip, chipProps(runningSnap('do the thing'))), 'dshcp-chip')
  if (!chip) return ['no chip rendered']
  const local = []
  if (textOf(chip).indexOf('thinking') < 0) local.push('the chip does not name the mood: ' + textOf(chip))
  // The chip used to be tinted with `--dsw-alias-*` tokens. It now shares the face's own
  // per-mood accent, so chip and face can never disagree about what colour this mood is.
  if (!/^#[0-9a-f]{6}$/.test(String(chip.props.style.color))) local.push('the chip is not tinted with a literal accent: ' + chip.props.style.color)
  return local
})

check('the chip grows a richness marker at level 2+', () => {
  render(Chip, chipProps(snapshot({})))
  render(Chip, chipProps(runningSnap('do the thing')))
  advance(30000)
  const chip = byClass(render(Chip, chipProps(runningSnap('do the thing'))), 'dshcp-chip')
  const text = textOf(chip)
  return text.indexOf('**') >= 0 ? [] : ['expected a richness marker, got: ' + text]
})

check('clicking the chip shrinks the face and persists the seat', () => {
  render(Chip, chipProps(snapshot({})))
  render(Chip, chipProps(runningSnap('do the thing')))
  advance(500)
  const chip = byClass(render(Chip, chipProps(runningSnap('do the thing'))), 'dshcp-chip')
  chip.props.onClick({ stopPropagation() {} })
  const mini = render(Face)
  const width = faceEl(mini).props.style.width
  const local = []
  if (width !== '60px') local.push('expected the mini size after a chip click, got ' + width)
  let saved = null
  for (const [k, v] of storage) if (k.indexOf('companion-face') >= 0) saved = v
  if (!saved) local.push('the seat was not persisted')
  else if (JSON.parse(saved).mini !== true) local.push('the persisted seat does not record mini')
  return local
})

/* ================= design sheet (dev tool, inert unless SHEET_DIR is set) ==========
 * Draws the face. The checks above can prove a mood and a class; only a picture can show
 * whether the thing is any good. `SHEET_DIR=<dir> node verify.mjs` writes a contact sheet.
 */
if (process.env.SHEET_DIR) {
  const { writeSheet } = await import('./tools/sheet.mjs')

  // One mood per colour family, plus the states a reviewer most needs to see: the extremes
  // of the line system, an accessory, the sign, and a held state with drift.
  const SHEET_CASES = [
    ['idle', snapshot({}), 1500],
    ['thinking', runningSnap('think it through'), 1500],
    ['searching', runningSnap('find it', { runningCalls: [call('grep')] }), 1500],
    ['writing', runningSnap('write it', { runningCalls: [call('edit')] }), 1500],
    ['running a command', runningSnap('run it', { runningCalls: [call('pwsh')] }), 1500],
    ['delegating', delegatingSnap, 1500],
    ['answering', runningSnap('say it', { partial: streaming('text', 'here is what I found') }), 1200],
    ['delighted (praise)', snapshot({ nodes: [userNode('go'), assistantNode('ok'), userNode('perfect, thank you')] }), 1500],
    ['confused (correction)', snapshot({ nodes: [userNode('go'), assistantNode('ok'), userNode('no, that is wrong')] }), 1500],
    ['agitated (tool error)', snapshot({ nodes: [userNode('go'), assistantNode('x'), kindNode('tool-result', { isError: true, call: { name: 'edit' } })], running: true }), 9500],
    ['needs you (approval)', snapshot({ nodes: [userNode('go')], pending: [{ kind: 'approval', payload: { toolName: 'pwsh' } }] }), 1500],
    ['sleepy', snapshot({ nodes: [userNode('hi'), assistantNode('Hello there')] }), 200000],
  ]

  const tiles = []
  for (const [name, snap, hold] of SHEET_CASES) {
    const view = holdFace(snap, hold)
    tiles.push({ name: name + ' - ' + faceLabel(view).replace('Companion face: ', ''), view })
  }
  const outDir = process.env.SHEET_DIR
  const result = await writeSheet(tiles, join(outDir, process.env.SHEET_NAME || 'face.png'), {
    columns: 4, tile: 190, background: '#0e1117',
  })
  console.log(`\ndesign sheet: ${result.width}x${result.height}, ${Math.round(result.bytes / 1024)} KB -> ${outDir}`)
  console.log('  (static frame: CSS animations are ignored by the rasterizer, so particle fields')
  console.log('   render at their resting opacity and look stronger here than they do live)')
}

/* ================= 13. the face answers the human's decisions ================= */
console.log('\n--- reacting to what the user DOES, not just what they say ---')

/**
 * Until this section existed the companion only ever reacted to typed text, so the two
 * moments that most deserve an answer - granting an approval and answering a question -
 * went unnoticed: it asked with an alert face, the human said yes, and the face went
 * straight back to work.
 *
 * An approval outcome is not a node of its own. The shipped tool runtime turns a refusal
 * into a DENY reason string, so "granted" has to be read as "nothing refused it and the
 * tool produced a result". Both directions are exercised here.
 */
const APPROVAL_ASK = snapshot({
  nodes: [userNode('go')],
  running: true,
  pending: [{ kind: 'approval', payload: { toolName: 'pwsh' } }],
})

/**
 * Drive the ask, then the answer, and return the face afterwards.
 *
 * Two pieces of isolation, both of which produced a misleading failure first:
 *  - an earlier section's alarm (or reaction) must be expired, or the face is still wearing
 *    it when the next prompt is raised and the setup assertion fails with the WRONG mood;
 *  - the chip test above SHRINKS the companion, and mini mode hides the balloon completely,
 *    so every balloon assertion read "" while the mood assertions passed.
 */
/** Expire leftover alarms/reactions and leave mini mode, so a check starts from a known face. */
function isolateFace() {
  clock += 12000                                   // expire any alarm or reaction still running
  render(Chip, chipProps(snapshot({})))
  render(Face)
  if (faceEl(render(Face)).props.style.width === '60px') {
    byClass(render(Chip, chipProps(snapshot({}))), 'dshcp-chip').props.onClick({ stopPropagation() {} })
  }
  render(Chip, chipProps(snapshot({})))
  return render(Face)
}

function answerApproval(answerNodes, answerPending) {
  isolateFace()
  render(Chip, chipProps(APPROVAL_ASK))
  advance(400)
  const asked = faceLabel(render(Face))
  if (asked.indexOf('needs you') < 0) return { error: 'setup: the approval did not raise the prompt, got ' + asked }
  render(Chip, chipProps(snapshot({ nodes: answerNodes, running: true, pending: answerPending })))
  advance(600)
  const view = render(Face)
  return { label: faceLabel(view), bubble: bubbleText(view), view }
}

const TOOL_OK = (name) => kindNode('tool-result', { call: { name: name }, content: [{ type: 'text', text: 'exit code 0' }] })
const TOOL_DENIED = (name, reason) => kindNode('tool-result', { call: { name: name }, isError: true, content: [{ type: 'text', text: reason }] })

check('granting an approval makes the face happy', () => {
  const out = answerApproval([userNode('go'), TOOL_OK('pwsh')])
  if (out.error) return [out.error]
  const local = []
  if (out.label.indexOf('delighted') < 0) local.push('expected a happy face after Allow, got ' + out.label)
  if (out.bubble.indexOf('Thank you') < 0) local.push('the face did not acknowledge the grant: ' + JSON.stringify(out.bubble))
  return local
})

check('refusing an approval is not treated as a fault', () => {
  const out = answerApproval([userNode('go'), TOOL_DENIED('pwsh', 'the user rejected tool "pwsh"')])
  if (out.error) return [out.error]
  const local = []
  if (out.label.indexOf('disappointed') < 0) local.push('expected a resigned face after Reject, got ' + out.label)
  if (out.label.indexOf('agitated') >= 0) local.push('a refusal was treated as a tool failure')
  if (out.bubble.indexOf('No problem') < 0) local.push('the face did not accept the refusal: ' + JSON.stringify(out.bubble))
  return local
})

check('a cancelled approval is distinguished from a refusal', () => {
  const out = answerApproval([userNode('go'), TOOL_DENIED('pwsh', 'approval for tool "pwsh" was cancelled')])
  if (out.error) return [out.error]
  return out.label.indexOf('surprised') >= 0 ? [] : ['expected surprise on a cancel, got ' + out.label]
})

check('an unavailable approval channel stays an error', () => {
  // Fail-closed because no answerer exists. That is NOT the user saying no, so it keeps the
  // fault reaction rather than being softened into a refusal.
  const out = answerApproval([userNode('go'), TOOL_DENIED('pwsh', 'requires approval (not yet supported)')])
  if (out.error) return [out.error]
  return out.label.indexOf('agitated') >= 0 ? [] : ['expected agitation when no approval channel exists, got ' + out.label]
})

check('a later tool result does not re-acknowledge an old answer', () => {
  // The ask is consumed, so the turn carrying on must not keep celebrating. A NEW prompt is
  // a different matter - that earns a fresh acknowledgement, and does.
  const first = answerApproval([userNode('go'), TOOL_OK('pwsh')])
  if (first.error) return [first.error]
  if (first.label.indexOf('delighted') < 0) return ['setup: the grant was not acknowledged']
  advance(6000)
  render(Chip, chipProps(snapshot({ nodes: [userNode('go'), TOOL_OK('pwsh'), TOOL_OK('edit')], running: true })))
  advance(300)
  const view = render(Face)
  const local = []
  if (faceLabel(view).indexOf('delighted') >= 0) local.push('an answer already given was celebrated a second time')
  if (bubbleText(view).indexOf('Thank you') >= 0) local.push('the old acknowledgement came back: ' + bubbleText(view))
  return local
})

check('answering a question is acknowledged too', () => {
  isolateFace()
  render(Chip, chipProps(snapshot({ nodes: [userNode('which file?')], running: true, pending: [{ kind: 'question', payload: {} }] })))
  advance(400)
  if (faceLabel(render(Face)).indexOf('curious') < 0) return ['setup: the question did not raise the prompt']
  render(Chip, chipProps(snapshot({ nodes: [userNode('which file?'), userNode('the second one')], running: true })))
  advance(600)
  const view = render(Face)
  const label = faceLabel(view)
  const bubble = bubbleText(view)
  const local = []
  if (label.indexOf('happy') < 0) local.push('expected a pleased face once the question was answered, got ' + label)
  if (bubble.indexOf('Thanks') < 0) local.push('no acknowledgement for answering: ' + JSON.stringify(bubble))
  return local
})

check('a granted approval outranks the tool error that follows it', () => {
  // Real sequence: the human allows a command and the command fails. Both land in the same
  // publish, so the acknowledgement they earned must survive its window instead of being
  // stomped by agitation one frame later.
  const out = answerApproval([
    userNode('go'),
    TOOL_OK('pwsh'),
    kindNode('tool-result', { isError: true, call: { name: 'edit' }, content: [{ type: 'text', text: 'no such file' }] }),
  ])
  if (out.error) return [out.error]
  return out.label.indexOf('delighted') >= 0 ? [] : ['the grant acknowledgement was lost to a later error, got ' + out.label]
})

check('the edge fades outward instead of ending in a band', () => {
  // A flat-opacity stroke wider than the face reads as a BORDER: it has an outer boundary of
  // its own, so the silhouette wears two hard edges where it should have one. "Fades toward
  // the outside" is four measurable things, and each is asserted rather than eyeballed:
  //   1. every edge layer is blurred (no hard outer boundary exists at all);
  //   2. the blur deepens outward, so the falloff is progressive and not a step;
  //   3. the outer layer is WIDER and FAINTER than the inner one (a band would be equal);
  //   4. the layers are drawn behind the head, so only the outward half is ever seen.
  const view = holdFace(runningSnap('do the thing'), 1200)
  const tight = byKey(view, 'rim')
  const wide = byKey(view, 'rimWide')
  if (!tight || !wide) return ['the edge is not a two-layer fade (keys rim / rimWide)']
  const local = []

  for (const [name, node] of [['inner', tight], ['outer', wide]]) {
    if (String(node.props.filter || '').indexOf('url(#dshcpAura') < 0) {
      local.push('the ' + name + ' edge layer is not blurred, so it ends in a hard boundary')
    }
    if (String(node.props.fill) !== 'none') local.push('the ' + name + ' edge layer is filled, not an edge')
  }

  const sigmaOf = (id) => {
    const filter = findElems(view.tree, (n) => n.type === 'filter' && n.props && n.props.id === id, [])[0]
    if (!filter) return NaN
    const blur = findElems(filter, (n) => n.type === 'feGaussianBlur', [])[0]
    return blur ? Number(blur.props.stdDeviation) : NaN
  }
  const sigmaTight = sigmaOf('dshcpAuraTight')
  const sigmaWide = sigmaOf('dshcpAuraWide')
  if (!(sigmaTight > 0)) local.push('the inner blur has no stdDeviation')
  if (!(sigmaWide > sigmaTight)) local.push(`the outer blur (${sigmaWide}) is not deeper than the inner one (${sigmaTight})`)

  const inner = Number(tight.props.opacity)
  const outer = Number(wide.props.opacity)
  if (!(outer < inner)) local.push(`the outer layer (${outer}) is not fainter than the inner one (${inner})`)
  if (!(Number(wide.props.strokeWidth) > Number(tight.props.strokeWidth))) {
    local.push('the outer layer is not wider than the inner one, so the falloff is a step')
  }

  // Behind the head: the opaque skin hides the inward half, which is what makes this a fade
  // out of the silhouette rather than a halo floating around it.
  const kids = []
  const walk = (node) => {
    if (Array.isArray(node)) { for (const c of node) walk(c); return }
    if (!node || typeof node !== 'object') return
    kids.push(node)
    walk(node.children)
  }
  walk(view.tree)
  const headAt = kids.findIndex((n) => n.props && n.props.key === 'head')
  const tightAt = kids.findIndex((n) => n.props && n.props.key === 'rim')
  if (headAt < 0 || tightAt < 0) local.push('could not order the edge against the head')
  else if (tightAt > headAt) local.push('the edge is drawn over the head, so its inward half is visible')

  if (local.length === 0) {
    console.log(`        (contour ${byKey(view, 'head').props.strokeWidth}, aura sigma ${sigmaTight} -> ${sigmaWide}, opacity ${inner} -> ${outer})`)
  }
  return local
})

/* ================= 14. the options switches ================= */
console.log('\n--- options (Settings > Plugins > Companion) ---')

/**
 * Options are driven through the PANEL, not by poking the store: the checkbox is the thing the
 * user actually touches, so that is what is under test.
 */
const optionView = () => render(Options)
const optionBoxes = () => findElems(optionView().tree, (n) => n.type === 'input' && n.props && n.props.type === 'checkbox', [])
const optionLabels = () => findElems(optionView().tree, (n) => typeof n.props.className === 'string' && n.props.className === 'dshcp-opt-label', []).map((n) => String(n.children[0]))
const setOptionByLabel = (label, on) => {
  const at = optionLabels().indexOf(label)
  if (at < 0) return false
  const box = optionBoxes()[at]
  if (!box) return false
  box.props.onChange({ target: { checked: on } })
  return true
}
const resetOptions = () => {
  const button = findElems(optionView().tree, (n) => n.type === 'button' && n.props && n.props.className === 'dshcp-opts-reset', [])[0]
  if (button) button.props.onClick()
}

check('the options page is registered where the shell expects it', () => {
  if (!Options) return ['no options component was registered']
  const spec = Options.spec || {}
  const local = []
  if (spec.name !== 'settings.plugins.tab') local.push('registered into ' + spec.name + ' instead of settings.plugins.tab')
  if (spec.label !== 'Companion') local.push('the tab label is ' + JSON.stringify(spec.label))
  if (!(Number(spec.order) >= 0)) local.push('no tab order, so it may land above the shipped tabs')
  return local
})

check('every switch defaults to ON, so upgrading changes nothing', () => {
  // The point of the defaults: installing this version must not alter what the face does until
  // somebody opens the page and turns something off.
  const boxes = optionBoxes()
  if (boxes.length < 10) return ['only ' + boxes.length + ' switches rendered']
  const off = boxes.filter((b) => b.props.checked !== true).length
  if (off > 0) return [`${off} of ${boxes.length} switches do not default to on`]
  console.log(`        (${boxes.length} switches, all on by default)`)
  return []
})

check('the panel groups its switches and labels every one', () => {
  const view = optionView()
  const groups = findElems(view.tree, (n) => typeof n.props.className === 'string' && n.props.className === 'dshcp-opts-head', []).map((n) => String(n.children[0]))
  const labels = optionLabels()
  const local = []
  if (groups.length < 3) local.push('expected grouped headings, got ' + groups.length)
  if (labels.length !== optionBoxes().length) local.push(`labels (${labels.length}) do not match switches (${optionBoxes().length})`)
  if (labels.indexOf('Blinking') < 0) local.push('the blinking switch is missing')
  if (groups.length >= 3) console.log(`        (${labels.length} switches in ${groups.length} groups: ${groups.join(' / ')})`)
  return local
})

check('turning a switch off actually disables its feature', () => {
  const local = []
  if (!setOptionByLabel('Blinking', false)) return ['could not find the blinking switch']
  clock += 12000
  render(Chip, chipProps(snapshot({})))
  render(Chip, chipProps(runningSnap('do the thing')))
  advance(1100)
  let view = render(Face)
  let closed = 0
  for (let i = 0; i < 200; i += 1) { if (eyeClosed(view)) closed += 1; advance(40); view = render(Face) }
  if (closed > 0) local.push(`blinking off but the eyes still shut ${closed} times`)

  setOptionByLabel('Particle effects', false)
  setOptionByLabel('Background objects', false)
  setOptionByLabel('Street sign', false)
  const bare = holdFace(runningSnap('think it through'), 60000)
  if (particlesOf(bare).length > 0) local.push('particles still render with effects off')
  if (driftLayer(bare)) local.push('drift objects still render with them off')
  if (findElems(bare.tree, (n) => typeof n.props.className === 'string' && n.props.className === 'dshcp-sign', []).length > 0) local.push('the sign still renders')

  setOptionByLabel('Fading edge', false)
  setOptionByLabel('Speech balloon', false)
  setOptionByLabel('Idle sway', false)
  const plain = holdFace(runningSnap('do the thing'), 1200)
  if (byKey(plain, 'rim') || byKey(plain, 'rimWide')) local.push('the aura still renders')
  if (findElems(plain.tree, (n) => n.props && n.props.id === 'dshcpAuraTight', []).length > 0) local.push('the aura filter is still declared')
  if (bubbleText(plain) !== '') local.push('the balloon still renders: ' + bubbleText(plain))
  if (String(byClass(plain, 'dshcp-bob').props.className).indexOf('dshcp-still') < 0) local.push('the sway still runs')

  // Monochrome is a SEMANTIC claim, so it is tested as one: with colour off, two different moods
  // must produce the same contour. Asserting a literal hex would only pin the palette.
  setOptionByLabel('Mood colours', false)
  const one = String(byKey(holdFace(runningSnap('find it', { runningCalls: [call('grep')] }), 1200), 'head').props.stroke)
  const two = String(byKey(holdFace(snapshot({ nodes: [userNode('go'), assistantNode('ok')] }), 1200), 'head').props.stroke)
  if (one !== two) local.push(`colour off still varies the contour by mood: ${one} vs ${two}`)
  if (one === '') local.push('the contour lost its stroke entirely')

  if (local.length === 0) console.log(`        (blink, effects, drift, sign, aura, balloon, sway and colour all gated)`)
  resetOptions()
  return local
})

check('hiding the chip does not blind the face', () => {
  // The chip is the ONLY session-scoped seat, so it is the bridge that publishes the
  // conversation into the shared store. Returning null before its effects run would leave the
  // face permanently idle - a plausible-looking implementation that quietly breaks everything.
  if (!setOptionByLabel('Header chip', false)) return ['could not find the chip switch']
  clock += 12000
  render(Chip, chipProps(snapshot({})))
  render(Face)
  render(Chip, chipProps(runningSnap('do the thing')))
  advance(1500)
  const hidden = render(Chip, chipProps(runningSnap('do the thing')))
  const label = faceLabel(render(Face))
  const local = []
  // `render` always returns a view object, so the component's own null is `view.tree`.
  if (hidden.tree !== null) local.push('the chip still renders with the switch off')
  if (label.indexOf('thinking') < 0 && label.indexOf('searching') < 0) {
    local.push('the face stopped receiving conversation state once the chip was hidden: ' + label)
  }
  resetOptions()
  return local
})

check('switches persist, and a seat from an older build still loads', () => {
  // Sparse merge, not a snapshot: a version that ADDS an option must hand it its default rather
  // than inherit `undefined` from a seat written before that option existed.
  if (!setOptionByLabel('Blinking', false)) return ['could not find the blinking switch']
  const local = []
  // A seat as an older build would have written it: one known key, one key that no longer exists.
  storage.set('dsh.companion-face.options.v1', JSON.stringify({ blink: false, somethingRemoved: true }))
  const labels = optionLabels()
  const boxes = optionBoxes()
  const at = labels.indexOf('Blinking')
  if (at < 0) return ['the blinking switch vanished after a reload']
  if (boxes[at].props.checked !== false) local.push('the saved value was not restored')
  const stillOn = optionBoxes().filter((b) => b.props.checked === true).length
  if (stillOn !== optionBoxes().length - 1) {
    local.push(`an unknown key changed ${optionBoxes().length - 1 - stillOn} unrelated switch(es)`)
  }
  if (local.length === 0) console.log(`        (saved value restored, unknown key ignored, the rest defaulted on)`)
  storage.set('dsh.companion-face.options.v1', JSON.stringify({}))
  return local
})

check('the drag switch really stops it being draggable', () => {
  if (!setOptionByLabel('Move it around', false)) return ['could not find the drag switch']
  clock += 12000
  render(Chip, chipProps(snapshot({})))
  render(Chip, chipProps(runningSnap('do the thing')))
  advance(2000)
  flushFrames(40, 16)
  const seat = faceEl(render(Face))
  const before = render(Face).tree.props.style
  seat.props.onPointerDown({ button: 0, pointerId: 1, clientX: 400, clientY: 400, currentTarget: null })
  render(Face)
  seat.props.onPointerMove({ pointerId: 1, clientX: 500, clientY: 470 })
  const after = render(Face).tree.props.style
  seat.props.onPointerUp({ pointerId: 1 })
  const local = []
  if (before.left !== after.left || before.top !== after.top) {
    local.push(`the face moved with dragging off: ${before.left},${before.top} -> ${after.left},${after.top}`)
  }
  if (String(faceEl(render(Face)).props.className).indexOf('dshcp-face--fixed') < 0) {
    local.push('the face still shows a grab cursor with dragging off')
  }
  resetOptions()
  return local
})

/* ================= idle sayings ================= */
console.log('\n--- idle sayings ---')

/**
 * The pool is scraped rather than exported, because it is DATA: the checks on it are about
 * size, uniqueness and fit, and about which line a given clock selects. The closing bracket
 * is matched at its exact indentation so the scrape cannot run past the array into the rest
 * of the module.
 */
const WISDOM_POOL = (() => {
  const block = source.match(/const WISDOM_LINES = \[([\s\S]*?)\n\t\t\]/)
  if (!block) return []
  return block[1].split('\n').map((line) => {
    const t = line.trim()
    if (t === '') return null
    const q = t.match(/^'(.*)',?$/)
    if (!q) return '__UNPARSED__'
    return q[1]
  }).filter((x) => x !== null)
})()
const WISDOM_SET = new Set(WISDOM_POOL)
const isSaying = (text) => WISDOM_SET.has(text)

/**
 * Drive the face to a given idle duration with a state published ONCE.
 *
 * The chip stamps `facts.at` only when the snapshot SIGNATURE changes, so a published state
 * stays live in the store while the idle clock runs on. That is the only way to have a real
 * signal AND a long idle at the same instant, which is what the priority check needs.
 *
 * The leading publish carries a counter so its signature is unique on every call: without it
 * a repeated `snapshot({})` would leave the previous `at` in place and the idle duration would
 * be measured from whenever that shape was last seen.
 */
let idleSeq = 0
function idleWith(snap, idleMs) {
  clock += 300000
  idleSeq += 1
  render(Chip, chipProps(snapshot({ nodes: [userNode('reset-' + idleSeq)] })))
  render(Face)
  render(Chip, chipProps(snap))
  advance(idleMs)
  return render(Face)
}
const quietAt = (ms) => idleWith(snapshot({}), ms)

check('the saying pool is large, unique and short enough to fit the balloon', () => {
  const local = []
  const unparsed = WISDOM_POOL.filter((l) => l === '__UNPARSED__').length
  const lines = WISDOM_POOL.filter((l) => l !== '__UNPARSED__')
  if (unparsed > 0) local.push(unparsed + ' pool entr(ies) are not plain single-quoted strings')
  if (lines.length < 100) local.push('only ' + lines.length + ' sayings')
  const dupes = lines.length - new Set(lines).size
  if (dupes > 0) local.push(dupes + ' duplicate line(s)')
  if (lines.some((l) => l.trim() === '')) local.push('a blank line is in the pool')
  const longest = Math.max(...lines.map((l) => l.length))
  if (longest > 110) local.push('the longest line is ' + longest + ' chars, past the three-line limit')
  if (local.length === 0) {
    console.log(`        (${lines.length} original sayings, longest ${longest} chars, a new one every 75s)`)
  }
  return local
})

check('it stays silent until the idle threshold, then speaks', () => {
  if (!setOptionByLabel('Idle gestures', false)) return ['could not find the gestures switch']
  const early = bubbleText(quietAt(60000))
  const late = bubbleText(quietAt(76000))
  const local = []
  if (early !== '') local.push('the balloon spoke at 60s idle: ' + JSON.stringify(early))
  if (!isSaying(late)) local.push('no saying at 76s idle, the balloon was ' + JSON.stringify(late))
  if (local.length === 0) console.log(`        (silent at 60s, "${late}" at 76s)`)
  return local
})

check('a saying is shown for a moment and then withdrawn', () => {
  // The window is 6.5s inside a 75s cycle, so the companion is quiet about 91% of the time.
  // A companion that narrates continuously is not a companion.
  clock += 300000
  idleSeq += 1
  render(Chip, chipProps(snapshot({ nodes: [userNode('reset-' + idleSeq)] })))
  render(Chip, chipProps(snapshot({})))
  advance(76000)
  const shown = bubbleText(render(Face))
  advance(8000)
  const gone = bubbleText(render(Face))
  const local = []
  if (!isSaying(shown)) local.push('expected a saying mid-window, got ' + JSON.stringify(shown))
  if (gone !== '') local.push('the saying overstayed its window: ' + JSON.stringify(gone))
  return local
})

check('the pool advances instead of showing one line forever', () => {
  const seen = []
  for (let i = 0; i < 12; i += 1) seen.push(bubbleText(quietAt(76000 + i * 75000)))
  const unique = [...new Set(seen.filter(isSaying))]
  const local = []
  if (unique.length < 10) {
    local.push(`12 samples produced ${unique.length} distinct sayings: ${seen.map((s) => JSON.stringify(s)).join(', ')}`)
  }
  if (local.length === 0) console.log(`        (12 consecutive samples, 12th was "${seen[11]}")`)
  return local
})

check('a saying never displaces a signal the face is actually carrying', () => {
  // Paired comparison at the SAME idle duration. First prove the idle clock really is past the
  // threshold on its own, then repeat with a live conversation state and require the signal to
  // win. Without the first half the check would pass on a saying that never appears at all.
  //
  // Only PERSISTENT states appear here. A finished reply is an EVENT, not a state: 76 seconds
  // after it the companion genuinely is idle again and is entitled to philosophise, so it is
  // not an acceptable case - the first draft of this check wrongly included one and failed.
  // The exact wording is not pinned except where the state owns the sentence; the property
  // under test is who wins the balloon, not what the winner says.
  const cases = [
    ['a running tool', runningSnap('do the thing', { runningCalls: [call('grep')] }), 'Searching'],
    ['an open approval', snapshot({ nodes: [userNode('go')], pending: [{ kind: 'approval', payload: { toolName: 'pwsh' } }] }), 'Approve'],
    ['an open question', snapshot({ nodes: [userNode('go')], pending: [{ kind: 'question', payload: {} }] }), 'ask you'],
    ['a failed tool', snapshot({ nodes: [userNode('go'), assistantNode('boom')], lastAgentError: 'the tool blew up' }), ''],
    ['a streamed answer', runningSnap('say', { partial: streaming('text', 'here we go') }), ''],
  ]
  const control = bubbleText(quietAt(76000))
  const local = []
  if (!isSaying(control)) return ['the control case showed no saying, so the comparison proves nothing: ' + JSON.stringify(control)]
  for (const [name, snap, expect] of cases) {
    const text = bubbleText(idleWith(snap, 76000))
    if (isSaying(text)) local.push(`${name} was overwritten by a saying: ${JSON.stringify(text)}`)
    if (text === '') local.push(`${name} showed no balloon at all`)
    if (expect !== '' && text.indexOf(expect) < 0) local.push(`${name} showed ${JSON.stringify(text)}, expected "${expect}"`)
  }
  if (local.length === 0) console.log(`        (control said "${control}"; all 5 live states kept their own line)`)
  return local
})

check('a long wait rotates the pool without silencing everything else', () => {
  // Sampled continuously rather than at a chosen instant, because the scheduler's timing is not
  // the contract - precedence is. Three distinct properties: the pool advances across a wait,
  // the companion still says things that are not proverbs, and every one of those is a string
  // the plugin actually declares. The last one is what stops a mangled or half-built saying
  // from passing as an ordinary caption.
  resetOptions()
  clock += 300000
  idleSeq += 1
  render(Chip, chipProps(snapshot({ nodes: [userNode('reset-' + idleSeq)] })))
  render(Chip, chipProps(snapshot({})))
  advance(2000)
  const seen = []
  for (let i = 0; i < 120; i += 1) { advance(2000); seen.push(bubbleText(render(Face))) }
  const sayings = [...new Set(seen.filter(isSaying))]
  const other = [...new Set(seen.filter((t) => t !== '' && !isSaying(t)))]
  const local = []
  if (sayings.length < 3) local.push(`240s of idle produced only ${sayings.length} saying(s)`)
  if (other.length === 0) local.push('nothing but proverbs was said across a 240s wait')
  const undeclared = other.filter((t) => source.indexOf("'" + t + "'") < 0 && source.indexOf('"' + t + '"') < 0)
  if (undeclared.length > 0) local.push('balloon text that the plugin never declares: ' + undeclared.map((u) => JSON.stringify(u)).join(', '))
  if (local.length === 0) console.log(`        (${sayings.length} sayings and ${other.map((o) => JSON.stringify(o)).join(', ')} in the same wait)`)
  return local
})

check('the saying switch turns it off', () => {
  if (!setOptionByLabel('Idle gestures', false)) return ['could not find the gestures switch']
  const on = bubbleText(quietAt(76000))
  if (!isSaying(on)) return ['no saying to suppress: ' + JSON.stringify(on)]
  if (!setOptionByLabel('Idle sayings', false)) return ['could not find the sayings switch']
  const off = bubbleText(quietAt(76000))
  const local = []
  if (isSaying(off)) local.push('a saying appeared with the switch off: ' + JSON.stringify(off))
  if (off !== '') local.push('turning sayings off altered something else: ' + JSON.stringify(off))
  // And back on again, because the switch must be reversible without a reload.
  setOptionByLabel('Idle sayings', true)
  if (!isSaying(bubbleText(quietAt(76000)))) local.push('the saying did not return when switched back on')
  resetOptions()
  return local
})

check('a saying wraps instead of being clipped to an ellipsis', () => {
  // Every other caption is one short line inside `white-space:nowrap` with an ellipsis. A
  // proverb run through that reads "A watched process never fini..." - worse than no proverb.
  if (!setOptionByLabel('Idle gestures', false)) return ['could not find the gestures switch']
  const saying = quietAt(76000)
  const caption = idleWith(runningSnap('do the thing', { runningCalls: [call('grep')] }), 2000)
  const local = []
  if (String(byClass(saying, 'dshcp-bubble').props.className).indexOf('dshcp-bubble--saying') < 0) {
    local.push('the saying balloon is not marked as one')
  }
  if (String(byClass(caption, 'dshcp-bubble').props.className).indexOf('dshcp-bubble--saying') >= 0) {
    local.push('an ordinary caption was marked as a saying')
  }
  if (!/\.dshcp-bubble--saying\{[^}]*white-space:normal/.test(source)) {
    local.push('no CSS rule makes the saying balloon wrap')
  }
  resetOptions()
  return local
})

/* ---------------- summary ---------------- */
console.log('\n' + '='.repeat(60))
console.log(`passed ${passed}, failed ${failed}`)
if (runtimeProblems.length > 0) console.log(`runtime problems: ${runtimeProblems.slice(0, 3).join('; ')}`)
console.log(failed === 0 ? 'ALL CHECKS PASSED' : `${failed} CHECK(S) FAILED`)
process.exit(failed === 0 ? 0 : 1)
