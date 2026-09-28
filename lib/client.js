/**
 * Browser half of the companion face.
 *
 * Registered into the boot module table as a classic-script factory, the same
 * shape every shipped `dsh.client` bundle uses: the factory builds a CommonJS
 * module whose exports ARE the cordis plugin (`apply` plus `inject`).
 *
 * Authored against the dynamic Cordis plugin `face-1`, whose package ids are
 * PROCESS-LOCAL: a harness restart allocates a fresh sequence, so never read
 * them as a version. THIS FILE is the version and the shipped artifact; the
 * dynamic package is only the live rehearsal of it.
 *
 * Deltas from that dynamic source: the module wrapper, `require("react")` instead of the
 * evaluator's React symbol, an inline stylesheet install instead of the dynamic
 * `styles` builtin, and explicit `window.` prefixes on the rAF helpers.
 *
 * INVARIANTS this file must keep (each is covered by verify.mjs):
 *
 * 1. TRANSFORM PRECEDENCE - a geometric property is driven by exactly ONE
 *    source. Because the vector lands on `.dshcp-face` (inline transform) and a
 *    CSS animation lands on its `.dshcp-moodwrap` ancestor, setting both for the
 *    same property composes them and multiplies ("pop" once reached ~1.7x
 *    instead of 1.3x). `squish`/`stretch`/`pop`/`boing` drive scale purely from
 *    CSS.
 * 2. LAYER ORDER - variant, then action, then poke. `layerPick` resolves scalars
 *    last-wins while skipping null/undefined, and vectors merge in that order.
 * 3. BUBBLE PRECEDENCE - variant chatter is a low-priority BASE. The
 *    informative lines (which tool is running, streamed answer, pending
 *    approval) must still win, or a variant would mask what the agent is doing.
 * 4. AMBIENT ESCALATION - held-mood time (scaled by MOOD_RUSH) maps to level
 *    0-3, and `ambientFx` merges the cumulative AMBIENT ladder over the mood's
 *    own fx, de-duplicating so a layer is never drawn twice.
 * 5. EFFECT PALETTE - effects never reuse the mood tint. The face is one
 *    material (ink strokes plus a themed wash) while the effects read as
 *    coloured light around it, so `fxNodes` colours every particle from
 *    FX_COLORS by index (which is also what makes a field sparkle rather than
 *    repeat one shape). Only the mood wash on the face stays theme-driven.
 * 6. EFFECT PLACEMENT - no effect particle may land inside the head ellipse
 *    (HEAD_CX, HEAD_CY, rx 43, ry 41). A dot there reads as a blemish rather
 *    than as light, which is why every field lives in the surrounding margin and
 *    why the rising/falling fields sit in the side columns. verify.mjs checks
 *    the rendered tree, and tools/check-fx.mjs checks whole travel paths and
 *    every angle of the rotating rings. The drift layer is the one exemption from
 *    the "in front" half of this rule - it renders BEHIND the head - but it is NOT
 *    exempt from clearance: an object whose glyph sits under the silhouette is
 *    occluded by the opaque face and simply never seen. tools/check-drift.mjs
 *    enforces both that and the no-two-objects-on-one-spot rule.
 * 7. STREET SIGN - the lower-right sign is a European warning triangle: a
 *    triangular path with a white field, a thick red border and a dark symbol,
 *    mounted on a short post. It renders OUTSIDE the feature-scale group so it
 *    stays legible while the head morphs, and is only VISIBLE on part of a
 *    jittered cycle (`signVisible`) so it pops up as a flourish rather than
 *    sitting there as a permanent label. A mood with no natural symbol emits no
 *    sign at all, which is why `idle` wears nothing.
 * 8. SPEECH GATING - a non-empty `partial` is NOT proof of speech: the chunk
 *    accumulator keeps the last step's text after that step ends. The mouth
 *    requires the streamed text to have CHANGED within TALK_WINDOW, and the
 *    answer to still be under TALK_MAX_CHARS; beyond that the mood is
 *    `composing` (no mouth) rather than `talking`.
 * 9. BUBBLE RESET - clicking the balloon restarts the held clock, drops any
 *    transient poke or alarm, re-arms the idle scheduler via `resetEpoch`, and
 *    rotates to the NEXT variant. The rotation is computed as an absolute shift
 *    from the on-screen index, never a bare `+1` counter bump: the index also
 *    advances with the held clock, so +1 at exactly one period in would land back
 *    on the same variant and the click would look inert.
 * 10. REPETITION FATIGUE - a mood held past the variety it offers (pool size,
 *    particle field, motion) blinks to plain idle for BORE_BLINK and returns on a
 *    DIFFERENT animation. The phase is DERIVED from the held clock, never
 *    scheduled, and - critically - the TRUE mood does not change: only
 *    `displayMood` does. A mood change here would re-run the effect that owns the
 *    watchdog and its cleanup would cancel the timeout that ends the blink,
 *    stranding the companion on idle. `blinks` supplies the variety on return: it
 *    offsets the variant rotation for pool moods and indexes BORE_POSE for the
 *    moods that have no pool at all.
 * 11. GRAVITY - the face's resting spot is exactly the drop point. `lift` is an
 *    offset ABOVE it, so the fall lands on the drop point and placement is never
 *    stolen by the animation. A plain click drops too (it was lifted while held).
 * 12. IDLE SCHEDULER - `idleRef` holds the current idle DURATION (not a
 *    timestamp); `idleTier(Date.now() - ...)` was a bug that pinned tier 4.
 * 13. PALETTE - the face is an ILLUSTRATION, not chrome. Skin, ink and contour
 *    are FIXED materials; colour is carried by one ACCENT per mood. Nothing in
 *    the face may read a `--dsw-alias-*` token, because those swap between the
 *    light and dark themes while the skin does not, so a themed ink drew
 *    near-white features on a near-white head in dark mode. Only the speech
 *    bubble, the header chip and the sign post - things that sit ON the shell -
 *    may follow the theme. verify.mjs enforces this by walking the rendered tree
 *    for any `var(--dsw-alias` paint.
 * 14. LINE WEIGHTS - three tiers and the contour is the LIGHTEST it has ever
 *    been (LINE.contour 1.7, was 2.8, then 2) while being by far the most
 *    visible: the original was a themed pale grey about 1.26:1 against the skin.
 *    Weight without contrast does no work. The contour must stay the heaviest
 *    LINE, and interior strokes must sit under it - the brows and the open mouth
 *    are the heaviest MASS, which is the normal way round for a character.
 * 15. EDGE FADE - the mood colour around the silhouette is two Gaussian-blurred
 *    strokes of the head path, not a flat band. A band has an outer boundary of
 *    its own, so the face wore a border: two hard edges where there should be
 *    one. The layers must get wider, fainter and blurrier outward, be filled
 *    'none', and be drawn BEHIND the head so only the outward half is seen.
 *    SVG filters, not CSS blur: stdDeviation is in user units and scales with
 *    the face, where a CSS blur is in CSS pixels and would break in mini mode.
 * 16. IDLE SAYINGS - the pool is ORIGINAL text, and deliberately so: a runtime
 *    fetch for quotations needs a key-free CORS service that does not reliably
 *    exist, fails silently offline, and the online "wise quote" corpus is thick
 *    with misattribution. A saying is selected from the IDLE CLOCK, never a
 *    stored cursor, so the sequence is deterministic and the pool advances one
 *    line per event rather than sampling. It sits at the BASE of the balloon
 *    ladder, above the mood caption and below everything informative, and only
 *    in QUIET_MOODS. It is the one caption allowed to WRAP - clipped to
 *    `nowrap` with an ellipsis, a proverb keeps the shape of a sentence and
 *    loses the sentence, which reads as a rendering fault.
 */
window.__ModuleLoader__.load({
	id: "dsh-companion-face",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const React = require("react");

		const POS_KEY = 'dsh.companion-face.seat.v1'
		const FACE_MAX = 118
		const FACE_MINI = 60
		const EYE_LX = 34
		const EYE_RX = 66
		const EYE_CY = 48
		const HEAD_CX = 50
		const HEAD_CY = 52
		const HEAD_RX = 43
		const HEAD_RY = 41
		const SEP = String.fromCharCode(31)
		/** Diagnostic switch, set only by the offline harness. Inert in the browser. */
		const probe = typeof window !== 'undefined' && window.__DSHCP_PROBE === true
		const NL = String.fromCharCode(10)
		const CR = String.fromCharCode(13)
		const TAB = String.fromCharCode(9)
		const VARIANT_PERIOD = 5000

		// --- speech gating ----------------------------------------------------
		// A streaming `partial` is NOT proof that speech is happening: the
		// accumulator keeps the last step's text after that step ends, so a long
		// stretch of tools and reasoning would leave the mouth flapping at nothing.
		// The mouth needs the streamed text to have CHANGED recently, and the
		// answer to still be short.
		const TALK_WINDOW = 1200
		const TALK_MAX_CHARS = 240
		// A sudden large input is the one honest cue for surprised; see publish().
		const PASTE_CHARS = 600

		// Idle blinking. A face that never blinks reads as a doll. Two offset cycles make the
		// rhythm irregular instead of metronomic, and it is derived from the clock, so it needs
		// no timer and stays testable.
		const BLINK_MS = 140

		// --- drag physics -----------------------------------------------------
		// While held the face floats DRAG_LIFT px above its resting spot with a
		// shadow cast on the ground beneath it. Releasing hands that offset to a
		// real integrator: gravity pulls it down, it lands on the resting spot,
		// and it bounces with decaying restitution plus an impact squash.
		const DRAG_LIFT = 26
		const GRAVITY = 1500
		/**
		 * Restitution. The apex of the first bounce is BOUNCE^2 * DRAG_LIFT, so at the old
		 * 0.42 a dropped face rebounded only 0.42^2 * 26 = 4.6px - real, but small enough to
		 * miss entirely once the silhouette started fading into its surroundings, which is
		 * exactly how "we lost the bounce" gets reported while the physics is untouched.
		 * 0.55 puts the apex at 7.9px and the second bounce at 2.4px, so the drop reads as a
		 * drop without turning into a rubber ball.
		 */
		const BOUNCE = 0.55
		const THROW_FACTOR = 0.35
		const MAX_THROW = 320
		const REST_VY = 26
		const MORPH_MS = 460

		const VEC_KEYS = [
			'eyeRy', 'pupilScale', 'arcOpacity', 'arcBend',
			'browLift', 'browInner', 'browAsym', 'browOpacity',
			'mouthLY', 'mouthC1X', 'mouthC1Y', 'mouthC2X', 'mouthC2Y', 'mouthRY', 'mouthOpen', 'curveOpacity',
			'tilt', 'ring', 'headTint', 'cheek',
			'headRx', 'headRy', 'headCorner',
			'scale', 'squashX', 'squashY',
		]

		const VEC_BASE = {
			eyeRy: 10, pupilScale: 1, arcOpacity: 0, arcBend: 9,
			browLift: 0, browInner: 0, browAsym: 0, browOpacity: 1,
			mouthLY: 71, mouthC1X: 43, mouthC1Y: 76, mouthC2X: 57, mouthC2Y: 76, mouthRY: 71,
			mouthOpen: 0, curveOpacity: 1,
			tilt: 0, ring: 0.1, headTint: 0.07, cheek: 0,
			headRx: HEAD_RX, headRy: HEAD_RY, headCorner: 1,
			scale: 1, squashX: 1, squashY: 1,
		}

		function vec(over) {
			const out = {}
			for (let i = 0; i < VEC_KEYS.length; i += 1) { const key = VEC_KEYS[i]; out[key] = VEC_BASE[key] }
			if (over) {
				const keys = Object.keys(over)
				for (let i = 0; i < keys.length; i += 1) {
					const key = keys[i]
					if (Object.prototype.hasOwnProperty.call(VEC_BASE, key)) out[key] = over[key]
				}
			}
			return out
		}

		function clamp(value, min, max) { return Math.min(Math.max(value, min), max) }
		/** Positive modulo, so a negative seed or shift cannot index outside a pool. */
		function mod(value, span) { return span <= 0 ? 0 : (((value % span) + span) % span) }

		/**
		 * THE PALETTE IS LITERAL, NOT THEMED. The face is an ILLUSTRATION, not chrome.
		 *
		 * This was a real bug, not a style preference. The ink, sclera and contour used to
		 * be `--dsw-alias-*` tokens while the skin was a FIXED off-white gradient. Those
		 * tokens are theme-dependent - `--dsw-alias-label-primary` is
		 * `neutral-bluish-1000` in the light theme and `neutral-bluish-50` in the dark one,
		 * swapped under `.dark` - so in the dark theme the face inverted against itself:
		 * near-white brows, mouth, lids and pupils on a near-white head, with a dark
		 * sclera. Three of the four materials were following a theme the skin does not
		 * follow. Nothing may theme half a drawing.
		 *
		 * So: skin, ink and contour are now FIXED materials, and colour is carried by one
		 * accent per mood that lives in the illustration layer. Only things that sit ON the
		 * shell - the speech bubble, the header chip, the sign post - still read tokens.
		 */
		const SKIN_HI = '#ffffff'
		const SKIN_LO = '#eaeff7'
		const INK = '#151b28'

		/**
		 * One accent per mood, all 36. Previously 7 shell tokens were shared across 36
		 * moods, so eight different working states were all the same blue and the face
		 * barely changed colour all session.
		 *
		 * Hunched on purpose, not evenly spaced: an even 10-degree wheel made the seven
		 * green/teal working states near-identical, which is the old problem moved. Hues are
		 * grouped by family instead - cool for thinking, teal and green for working, warm
		 * for trouble, gold and pink for delight - and the warm band (hue 18-115) is held
		 * under L 0.545, because golds and yellows wash out on an off-white face while the
		 * cool half does not and must not be darkened to match.
		 *
		 * Verified: 36 distinct values, minimum 1.62:1 against the skin (so a rim always
		 * separates from the face) and minimum 4.37:1 against a near-black page (so it
		 * survives the dark shell). Both are asserted in verify.mjs.
		 */
		const ACCENT = {
			idle: '#8b93a7', listening: '#5b8cff', curious: '#3fa9f5', pondering: '#6d7cff',
			reasoning: '#7a6bff', talking: '#4d9bf5', composing: '#7b74f0', straining: '#f09825',
			scanning: '#38bdf8', building: '#2fb6a8', planning: '#5aa9e6', executing: '#3ecf8e',
			delegating: '#22b8d6', happy: '#3fbf6f', delighted: '#f4b122', confused: '#ee7e28',
			disappointed: '#c85a6e', agitated: '#e5484d', panicking: '#ff6b35', surprised: '#efb327',
			alerting: '#ff9d17', bored: '#7f8a9c', yawning: '#8e9bd6', sleepy: '#7c8ce0',
			reminiscing: '#dda139', realigning: '#e879b9', receiving: '#2fc4d4', baffled: '#e8845f',
			commanding: '#ef9e27', juggling: '#2ec4b6', deepDive: '#8b5cf6', overflowing: '#ff7317',
			archivist: '#d9a53a', firstContact: '#7ed321', recovering: '#f06a25', conducting: '#a855f7',
		}

		/**
		 * LINE WEIGHTS. Three tiers, and the contour is deliberately the LIGHTEST it has
		 * ever been (1.7, down from 2.8, then 2) while being by far the most visible: the
		 * original 2.8 outline was a pale `--dsw-alias-border-l2` grey on a near-white head,
		 * about 1.26:1 contrast, so a heavy line was doing no work at all. Weight without
		 * contrast reads as a wobble, not as an edge.
		 *
		 * Everything inside steps down with it, because the hierarchy is the point: a mouth
		 * heavier than the silhouette is the single most common way a drawing looks wrong.
		 * The brows and the open mouth are the heaviest MASS, which is the normal way round
		 * for a character - mass outranks line.
		 */
		const LINE = { contour: 1.7, mouth: 1.5, arc: 1.45, lid: 1.2, sclera: 1.1, iris: 0.9, brow: 0.9 }

		function hexToRgb(hex) {
			const h = hex.charAt(0) === '#' ? hex.slice(1) : hex
			const full = h.length === 3 ? h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2) : h
			return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)]
		}

		function rgbToHex(rgb) {
			let out = '#'
			for (let i = 0; i < 3; i += 1) {
				const v = Math.round(clamp(rgb[i], 0, 255))
				out += (v < 16 ? '0' : '') + v.toString(16)
			}
			return out
		}

		/** Linear mix in sRGB. Good enough for flat illustration colour. */
		function mix(a, b, t) {
			const A = hexToRgb(a)
			const B = hexToRgb(b)
			return rgbToHex([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t])
		}

		function toHsl(hex) {
			const rgb = hexToRgb(hex)
			const r = rgb[0] / 255
			const g = rgb[1] / 255
			const b = rgb[2] / 255
			const max = Math.max(r, g, b)
			const min = Math.min(r, g, b)
			const l = (max + min) / 2
			if (max === min) return { h: 0, s: 0, l: l }
			const d = max - min
			const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
			let h = 0
			if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
			else if (max === g) h = ((b - r) / d + 2) / 6
			else h = ((r - g) / d + 4) / 6
			return { h: h * 360, s: s, l: l }
		}

		/** Rotate hue only. Used for the slow colour drift and the poke flash. */
		function rotateHue(hex, deg) {
			const c = toHsl(hex)
			const h = ((c.h + deg) % 360 + 360) % 360
			const s = c.s
			const l = c.l
			const k = (n) => (n + h / 30) % 12
			const a = s * Math.min(l, 1 - l)
			const f = (n) => l - a * Math.max(-1, Math.min(Math.min(k(n) - 3, 9 - k(n)), 1))
			return rgbToHex([f(0) * 255, f(8) * 255, f(4) * 255])
		}

		function accentOf(mood) { return ACCENT[mood] || ACCENT.idle }

		/** WCAG relative luminance, for the contrast assertions in the harness. */
		function luminance(hex) {
			const rgb = hexToRgb(hex)
			const parts = []
			for (let i = 0; i < 3; i += 1) {
				const c = rgb[i] / 255
				parts.push(c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
			}
			return 0.2126 * parts[0] + 0.7152 * parts[1] + 0.0722 * parts[2]
		}

		function contrast(a, b) {
			const la = luminance(a)
			const lb = luminance(b)
			return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
		}

		const TINT_FALLBACK = {
			neutral: '#8a8f98',
			brand: '#4d6bfe',
			success: '#22a06b',
			warn: '#d9822b',
			error: '#e5484d',
			pink: '#e06c9a',
			gold: '#e0a72b',
		}

		/**
		 * Accent palette for every effect field. These are deliberately NOT the
		 * mood tint: the face is one material (ink strokes plus a themed wash)
		 * while the effects should read as coloured light scattered AROUND it,
		 * never as more of the same surface. Fixed hues rather than theme aliases
		 * keep them legible on both light and dark backgrounds, and each field
		 * varies per particle so it sparkles instead of reading as a single
		 * repeated shape.
		 */
		const FX_COLORS = {
			dots: ['#a78bfa', '#8b5cf6', '#c4b5fd'],
			stardust: ['#7dd3fc', '#c4b5fd', '#fde68a', '#99f6e4'],
			stars: ['#fcd34d', '#fbbf24', '#f59e0b'],
			bubbles: ['#5eead4', '#7dd3fc', '#a7f3d0'],
			embers: ['#fb7185', '#f97316', '#fbbf24'],
			sparks: ['#fde047', '#fef08a', '#fb923c'],
			confetti: ['#60a5fa', '#34d399', '#fbbf24', '#fb7185'],
			codeflow: ['#34d399', '#22d3ee', '#4ade80'],
			halo: ['#fcd34d'],
			orbit: ['#818cf8', '#38bdf8', '#a78bfa'],
			swirl: ['#e879f9', '#c084fc', '#f0abfc'],
			sweat: ['#38bdf8'],
			steam: ['#fda4af', '#fdba74', '#fca5a5'],
			sparkle: ['#fef9c3', '#fde68a', '#ffffff'],
			hearts: ['#fb7185', '#f472b6', '#fda4af'],
			zzz: ['#a5b4fc', '#93c5fd', '#c7d2fe'],
			cloud: ['#cbd5e1', '#e2e8f0', '#bfdbfe'],
			flower: ['#fbcfe8', '#f9a8d4', '#fda4af'],
			clock: ['#c7d2fe', '#a5b4fc', '#ddd6fe'],
			note: ['#ddd6fe', '#c4b5fd', '#e9d5ff'],
			code: ['#a7f3d0', '#6ee7b7', '#5eead4'],
			candy: ['#fecdd3', '#fdba74', '#fda4af'],
			fruit: ['#fca5a5', '#fdba74', '#fcd34d'],
			letter: ['#fef3c7', '#fde68a', '#fcd34d'],
		}

		/** Per-particle accent colour; falls back to the mood tint for unknown fields. */
		function fxColor(kind, index, tint) {
			const list = FX_COLORS[kind]
			if (!list) return tint
			return list[mod(index, list.length)]
		}

		/** Soft self-coloured bloom, for the sparse fields where the cost is negligible. */
		function fxGlow(color) { return 'drop-shadow(0 0 3px ' + color + ')' }

		/**
		 * The symbols a street sign can carry: a question for curiosity, an
		 * exclamation for trouble, a star for praise, an arrow for movement, a maths
		 * operator for work in progress. Moods with no natural symbol simply get no
		 * sign, because a sign that says nothing is just clutter.
		 *
		 * `color` is the per-mood accent retained from the earlier rounded-plaque
		 * design. The European warning triangle draws a uniform white field with a red
		 * border - like real road signs, where the SYMBOL carries the meaning - so
		 * `color` is currently unused. It is kept so a tinted variant is a one-line
		 * change if the mood colour coding is wanted back.
		 */
		const SIGN = {
			listening: { glyph: '\u2026', color: '#64748b' },
			curious: { glyph: '?', color: '#f59e0b' },
			pondering: { glyph: '?', color: '#fbbf24' },
			reasoning: { glyph: '\u2234', color: '#818cf8' },
			talking: { glyph: '\u00BB', color: '#60a5fa' },
			composing: { glyph: '=', color: '#a78bfa' },
			straining: { glyph: '\u2248', color: '#c084fc' },
			scanning: { glyph: '\u2192', color: '#38bdf8' },
			building: { glyph: '+', color: '#34d399' },
			planning: { glyph: '\u2261', color: '#60a5fa' },
			executing: { glyph: '>', color: '#4ade80' },
			delegating: { glyph: '\u21D2', color: '#0ea5e9' },
			happy: { glyph: '\u2605', color: '#fbbf24' },
			delighted: { glyph: '\u2605', color: '#f59e0b' },
			confused: { glyph: '?!', color: '#fb923c' },
			disappointed: { glyph: '\u00D7', color: '#ef4444' },
			agitated: { glyph: '!', color: '#ef4444' },
			panicking: { glyph: '!!', color: '#dc2626' },
			surprised: { glyph: '!', color: '#f97316' },
			alerting: { glyph: '!', color: '#e11d48' },
			bored: { glyph: '\u2026', color: '#94a3b8' },
			yawning: { glyph: 'z', color: '#a5b4fc' },
			sleepy: { glyph: 'z', color: '#818cf8' },
			reminiscing: { glyph: '\u2606', color: '#fcd34d' },
			realigning: { glyph: '\u2260', color: '#f472b6' },
			receiving: { glyph: '\u2193', color: '#22d3ee' },
			baffled: { glyph: '??', color: '#fdba74' },
			commanding: { glyph: '>', color: '#22c55e' },
			juggling: { glyph: '\u2211', color: '#2dd4bf' },
			deepDive: { glyph: '\u221E', color: '#8b5cf6' },
			overflowing: { glyph: '\u2191', color: '#f97316' },
			archivist: { glyph: '\u2606', color: '#eab308' },
			firstContact: { glyph: '\u2605', color: '#facc15' },
			recovering: { glyph: '\u21BB', color: '#fb923c' },
			conducting: { glyph: '\u221E', color: '#a855f7' },
		}

		/**
		 * The sign is an occasional flourish, not a permanent label. It appears when
		 * the mood changes, holds briefly, hides, and only returns on a long jittered
		 * cycle. Urgent moods hold it longer, so they are on screen more of the time.
		 *
		 * The cadence is deliberately sparse. It was originally 3200ms on a 5.2-9.4s
		 * cycle, which kept the sign up 46% of the time - and 74% for urgent moods,
		 * i.e. effectively always, which read as noise rather than as an event. The
		 * numbers below put a normal sign on screen ~14% of the time and an urgent one
		 * ~23%, with a mean sighting gap of 13s. tools/assess.mjs recomputes both.
		 */
		const SIGN_SHOW = 1700
		const SIGN_URGENT_SHOW = 3000
		const SIGN_URGENT = { alerting: true, panicking: true, agitated: true, recovering: true }

		/**
		 * Which moods earn a sign at all.
		 *
		 * Restricted to states that MEAN something - the ones demanding attention and
		 * the rare special states - so the sign carries information instead of
		 * decorating every mood. Routine work (thinking, searching, writing, running a
		 * command) gets no sign, which is exactly what makes the sign worth looking at
		 * when it does appear. Without this gate the sign was a label for 35 of 36
		 * moods, and a label on everything says nothing.
		 */
		const SIGN_NOTABLE = {
			alerting: true, panicking: true, agitated: true, recovering: true, surprised: true,
			reminiscing: true, realigning: true, receiving: true, baffled: true, commanding: true,
			juggling: true, deepDive: true, overflowing: true, archivist: true, firstContact: true,
			conducting: true,
		}

		function signVisible(mood, heldMs, seed) {
			if (!SIGN[mood] || !SIGN_NOTABLE[mood]) return false
			const cycle = 10000 + mod(seed, 7) * 1000
			const show = SIGN_URGENT[mood] ? SIGN_URGENT_SHOW : SIGN_SHOW
			return mod(heldMs, cycle) < show
		}

		/**
		 * Repetition fatigue.
		 *
		 * Holding one expression gets boring, and most moods have no variant pool at
		 * all, so they would be frozen for as long as the state lasts. Fatigue is
		 * DERIVED from the held clock rather than scheduled on a timer, which keeps it
		 * deterministic and testable: once a mood has used up the variety it offers,
		 * the companion blinks to idle for a moment and comes back on a DIFFERENT
		 * animation.
		 *
		 * `boreInterval` scales with how much variety a mood actually brings - pool
		 * size, particle field, motion - so a five-variant thinking mood is left alone
		 * for about a minute while a bare one-pose mood is refreshed every ~11s.
		 */
		const BORE_BLINK = 520
		const BORE_BASE = 9000
		const BORE_MIN = 11000
		const BORE_MAX = 80000
		const BORE_EXEMPT = { idle: true, talking: true, listening: true, alerting: true, curious: true }
		/** Micro-poses for moods with no variant pool: the only variety they can offer. */
		const BORE_POSE = [
			{ look: 'left', vec: { tilt: -5, browLift: 2 } },
			{ look: 'right', vec: { tilt: 5, browAsym: 3 } },
			{ look: 'up', vec: { browLift: 5, scale: 1.02 } },
			{ look: 'down', vec: { browInner: 3, tilt: -2 } },
			{ look: 'mouse', vec: { scale: 1.03, cheek: 0.2 } },
		]

		function varietyOf(mood) {
			const pool = THINK_VARIANTS[mood]
			const spec = MOODS[mood] || MOODS.idle
			let score = pool && pool.length > 0 ? pool.length : 1
			if (spec.fx && spec.fx.length > 0) score *= 1.3
			if (spec.anim || spec.pulse || spec.talk) score *= 1.2
			return score
		}

		function boreInterval(mood) { return clamp(BORE_BASE * varietyOf(mood), BORE_MIN, BORE_MAX) }

		/**
		 * Long-haul drift objects.
		 *
		 * A faint, slow parade of objects that only appears once a state has been held a
		 * long time - a reward for patience rather than decoration. They render BEHIND
		 * the head, so they pass behind the face and are occluded by it, and every one is
		 * translucent and slow. Urgent and anxious states are deliberately absent: those
		 * should stay legible.
		 *
		 * "Behind the head" is a draw-order decision, NOT a licence to stand under it: the
		 * face is opaque, so an object placed on the silhouette is erased, not layered. See
		 * DRIFT_SPOTS for the measured geometry that follows from that.
		 *
		 * Each mood draws from its own pool, so the objects mean something: clocks and
		 * letters for remembering, notes for conducting, candy and fruit for abundance.
		 *
		 * Moods whose state cannot outlast DRIFT_AT are NOT listed - firstContact ends at
		 * 8s, delighted at 6.5s, yawning at 45s - because an assignment that can never
		 * fire is just dead weight.
		 */
		const DRIFT_AT = 45000
		const DRIFT_ROTATE = 20000
		// WHERE the objects may stand. This is not decoration - it is the whole reason the
		// layer is visible at all.
		//
		// The head is an 86x82 ellipse in a 100x100 box, so the margin inside the box is
		// SEVEN units, while a glyph needs eight to eleven. Every spot therefore has to sit
		// in one of the corner lobes, where the ellipse pulls away from the box edge. The
		// bottom-right lobe is unusable because the street sign occupies x72-104 / y71-110.
		// Going OUTSIDE the box is not an option either: the face parks near a screen edge by
		// default, so anything out there is off-screen.
		//
		// Measured free lobes at the worst-case glyph half-extent (candy, 11 x 0.58 = 6.4):
		// top-left x6.5-30, top-right x69-93, bottom-left x6.5-21. Nothing else. The order
		// below matters: read through DRIFT_STEP it keeps every same-lobe pair at 14.5+
		// units apart while two glyphs need 12.8, so no two objects ever touch.
		//
		// The previous ring put two of six spots at [9,54] and [91,50], whose CENTRES are
		// inside the head (metric 0.91): drawn behind the opaque face, they were never seen,
		// and the other four were only half clear. Verified by tools/check-drift.mjs, which
		// also enforces a 1.05 clearance floor so a future graze fails the build.
		const DRIFT_SPOTS = [
			[6.5, 6.5], [93.5, 21], [17.5, 93.5], [75.5, 6.5],
			[24.5, 6.5], [6.5, 83], [90.5, 6.5], [6.5, 21],
		]
		// Slot per object index. 0, 3, 5 and 6 are pairwise distinct modulo 8, so a two-,
		// three- or four-object parade never stacks two glyphs on one spot. The old stride
		// was `i * 3` over six spots, which for three objects gave 0,3,0 - two objects drawn
		// at identical coordinates - and for four gave only two distinct positions.
		const DRIFT_STEP = [0, 3, 5, 6]
		// Small: the lobes are ~18 units across and two glyphs must not collide.
		const DRIFT_SCALE = [0.46, 0.52, 0.58]
		// Max half-extent per glyph, drawn honestly from the paths in driftGlyph(). The
		// placement checker multiplies these by DRIFT_SCALE to test clearance.
		const DRIFT_EXTENT = { cloud: 9.5, flower: 9, clock: 9, note: 9, code: 10, candy: 11, fruit: 8, heart: 9.2, letter: 9 }
		const DRIFT_ANIM = ['dshcp-drifta', 'dshcp-driftb', 'dshcp-driftc']
		const DRIFT = {
			pondering: ['cloud', 'flower', 'letter'],
			reasoning: ['cloud', 'letter', 'clock'],
			straining: ['flower', 'candy', 'cloud'],
			composing: ['code', 'letter'],
			building: ['code', 'clock'],
			executing: ['code'],
			scanning: ['cloud', 'letter'],
			planning: ['letter', 'clock', 'code'],
			delegating: ['note', 'letter'],
			talking: ['note', 'cloud'],
			deepDive: ['code', 'cloud', 'note'],
			archivist: ['letter', 'clock', 'code', 'cloud'],
			reminiscing: ['clock', 'letter', 'flower', 'cloud'],
			receiving: ['cloud', 'letter', 'note'],
			baffled: ['cloud', 'fruit', 'candy'],
			commanding: ['code', 'clock'],
			juggling: ['candy', 'fruit', 'note', 'cloud'],
			overflowing: ['candy', 'fruit', 'heart', 'code'],
			conducting: ['note', 'code', 'cloud'],
			recovering: ['flower', 'heart'],
			realigning: ['clock', 'letter'],
			happy: ['heart', 'flower'],
			sleepy: ['cloud', 'note'],
			bored: ['cloud', 'clock'],
		}

		/** Draw one drift object at its local origin; placement is the caller's job. */
		function driftGlyph(kind, color) {
			if (kind === 'cloud') {
				return [
					React.createElement('circle', { key: 'a', cx: -7, cy: 1, r: 5, fill: color }),
					React.createElement('circle', { key: 'b', cx: 0, cy: -2.5, r: 7, fill: color }),
					React.createElement('circle', { key: 'c', cx: 7, cy: 1, r: 4.6, fill: color }),
					React.createElement('rect', { key: 'd', x: -8, y: 1, width: 16, height: 5, rx: 2.5, fill: color }),
				]
			}
			if (kind === 'flower') {
				const petals = []
				for (let i = 0; i < 5; i += 1) {
					const a = (i / 5) * Math.PI * 2
					petals.push(React.createElement('ellipse', { key: 'p' + i, cx: fix(Math.cos(a) * 5.4), cy: fix(Math.sin(a) * 5.4), rx: 3.6, ry: 3.6, fill: color }))
				}
				petals.push(React.createElement('circle', { key: 'c', cx: 0, cy: 0, r: 2.6, fill: '#fff7cc' }))
				return petals
			}
			if (kind === 'clock') {
				return [
					React.createElement('circle', { key: 'face', cx: 0, cy: 0, r: 8, fill: 'none', stroke: color, strokeWidth: 1.8 }),
					React.createElement('path', { key: 'h1', d: 'M0 0 L0 -4.6', stroke: color, strokeWidth: 1.6, strokeLinecap: 'round' }),
					React.createElement('path', { key: 'h2', d: 'M0 0 L3.4 1.8', stroke: color, strokeWidth: 1.6, strokeLinecap: 'round' }),
				]
			}
			if (kind === 'note') {
				return [
					React.createElement('ellipse', { key: 'head', cx: -3, cy: 6, rx: 4.2, ry: 3.2, fill: color, transform: 'rotate(-20 -3 6)' }),
					React.createElement('rect', { key: 'stem', x: 0.4, y: -8, width: 1.6, height: 14, rx: 0.8, fill: color }),
					React.createElement('path', { key: 'flag', d: 'M2 -8 C7 -6 8 -2 6 1 C7 -3 5 -5 2 -5 Z', fill: color }),
				]
			}
			if (kind === 'code') {
				return [
					React.createElement('text', {
						key: 't', x: 0, y: 5, textAnchor: 'middle', fontSize: 16, fontWeight: 700,
						fill: color, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
					}, '{ }'),
				]
			}
			if (kind === 'candy') {
				return [
					React.createElement('ellipse', { key: 'body', cx: 0, cy: 0, rx: 6.4, ry: 5, fill: color }),
					React.createElement('path', { key: 'l', d: 'M-6 0 L-11 -4.4 L-11 4.4 Z', fill: color }),
					React.createElement('path', { key: 'r', d: 'M6 0 L11 -4.4 L11 4.4 Z', fill: color }),
				]
			}
			if (kind === 'fruit') {
				return [
					React.createElement('circle', { key: 'body', cx: 0, cy: 1.5, r: 7, fill: color }),
					React.createElement('rect', { key: 'stem', x: -0.8, y: -8, width: 1.6, height: 4.4, rx: 0.8, fill: '#a16207' }),
					React.createElement('path', { key: 'leaf', d: 'M0.6 -6.6 C4 -8.6 7.4 -7.4 7.8 -4.4 C4.4 -3.6 1.6 -4.6 0.6 -6.6 Z', fill: '#86efac' }),
				]
			}
			if (kind === 'heart') {
				return [React.createElement('path', { key: 'h', d: HEART_PATH, fill: color, transform: 'scale(1.15)' })]
			}
			return [
				React.createElement('rect', { key: 'body', x: -9, y: -6, width: 18, height: 12, rx: 1.6, fill: color }),
				React.createElement('path', { key: 'flap', d: 'M-9 -6 L0 1.4 L9 -6', fill: 'none', stroke: 'rgba(0,0,0,.22)', strokeWidth: 1.2 }),
			]
		}

		/**
		 * Build the drift layer, or null while the state is still young.
		 *
		 * NOTE the two nested groups per object: the OUTER one carries the inline
		 * placement transform and the INNER one carries the CSS drift animation. Both
		 * write `transform`, so putting them on one element would let the animation
		 * override the placement and pile every object on the origin - the same
		 * one-driver-per-property rule that governs the face itself.
		 */
		function driftNodes(mood, heldMs, seed) {
			const pool = DRIFT[mood]
			if (!pool || heldMs < DRIFT_AT) return null
			const count = Math.min(4, pool.length)
			const cycle = Math.floor(heldMs / DRIFT_ROTATE)
			const shapes = []
			for (let i = 0; i < count; i += 1) {
				const kind = pool[mod(seed + i * 2 + cycle, pool.length)]
				const spot = DRIFT_SPOTS[mod(seed + cycle + DRIFT_STEP[i], DRIFT_SPOTS.length)]
				const color = fxColor(kind, i + cycle, '#cbd5e1')
				const sway = DRIFT_ANIM[mod(i + cycle, DRIFT_ANIM.length)]
				const size = DRIFT_SCALE[mod(seed + i, DRIFT_SCALE.length)]
				shapes.push(React.createElement('g', {
					key: 'd' + i, 'data-drift': kind,
					transform: 'translate(' + spot[0] + ',' + spot[1] + ') scale(' + fix(size) + ')',
				}, [
					React.createElement('g', {
						key: 'm', className: 'dshcp-drift ' + sway,
						style: { animationDelay: (i * 1.1).toFixed(1) + 's' },
					}, driftGlyph(kind, color)),
				]))
			}
			return React.createElement('g', { key: 'drift', className: 'dshcp-drift-layer', opacity: 0.3 }, shapes)
		}

		/**
		 * Accessories worn only when the user says something kind.
		 *
		 * Praise is the one signal that deserves a costume change: the companion puts
		 * something on for a while, then takes it off. The pick is random and never
		 * repeats the previous piece, so consecutive compliments visibly differ.
		 *
		 * Every piece is drawn in FEATURE space, inside the same group as the eyes and
		 * mouth, so it rides the head morph - a hat squashes when the face squashes
		 * instead of floating off the silhouette.
		 */
		const ACCESSORY_MS = 16000
		const ACCESSORIES = ['sunglasses', 'glasses', 'partyHat', 'topHat', 'cap', 'beanie', 'crown', 'headphones', 'bowTie', 'monocle', 'flowerCrown', 'scarf']

		/** One accessory, drawn around the head centre. */
		function accessoryNode(kind) {
			const dark = '#151a23'
			const gold = '#f2c14e'
			const glass = 'rgba(21,26,35,.14)'
			const petals = ['#f9a8d4', '#fda4af', '#fcd34d', '#c4b5fd', '#f9a8d4']

			if (kind === 'sunglasses') {
				return [
					React.createElement('rect', { key: 'l', x: 24, y: 40.5, width: 20, height: 15.5, rx: 5, fill: dark, opacity: 0.94 }),
					React.createElement('rect', { key: 'r', x: 56, y: 40.5, width: 20, height: 15.5, rx: 5, fill: dark, opacity: 0.94 }),
					React.createElement('path', { key: 'bridge', d: 'M44 46.5 q6 -3.4 12 0', fill: 'none', stroke: dark, strokeWidth: 2.8, strokeLinecap: 'round' }),
					React.createElement('path', { key: 'templeL', d: 'M24 44.5 l-6.5 -2.5', fill: 'none', stroke: dark, strokeWidth: 2.6, strokeLinecap: 'round' }),
					React.createElement('path', { key: 'templeR', d: 'M76 44.5 l6.5 -2.5', fill: 'none', stroke: dark, strokeWidth: 2.6, strokeLinecap: 'round' }),
					React.createElement('path', { key: 'glintL', d: 'M28.5 43.6 q4.5 -1.6 9 0.4', fill: 'none', stroke: 'rgba(255,255,255,.5)', strokeWidth: 1.8, strokeLinecap: 'round' }),
					React.createElement('path', { key: 'glintR', d: 'M60.5 43.6 q4.5 -1.6 9 0.4', fill: 'none', stroke: 'rgba(255,255,255,.5)', strokeWidth: 1.8, strokeLinecap: 'round' }),
				]
			}
			if (kind === 'glasses') {
				return [
					React.createElement('circle', { key: 'l', cx: 34, cy: 48, r: 11.4, fill: glass, stroke: dark, strokeWidth: 1.9 }),
					React.createElement('circle', { key: 'r', cx: 66, cy: 48, r: 11.4, fill: glass, stroke: dark, strokeWidth: 1.9 }),
					React.createElement('path', { key: 'bridge', d: 'M45.4 46 q4.6 -3 9.2 0', fill: 'none', stroke: dark, strokeWidth: 1.9, strokeLinecap: 'round' }),
					React.createElement('path', { key: 'templeL', d: 'M22.6 45 l-5.6 -2', fill: 'none', stroke: dark, strokeWidth: 1.9, strokeLinecap: 'round' }),
					React.createElement('path', { key: 'templeR', d: 'M77.4 45 l5.6 -2', fill: 'none', stroke: dark, strokeWidth: 1.9, strokeLinecap: 'round' }),
				]
			}
			if (kind === 'partyHat') {
				return [
					React.createElement('g', { key: 'tilt', transform: 'rotate(-13 50 30)' }, [
						React.createElement('path', { key: 'cone', d: 'M50 1 L40.5 31 L59.5 31 Z', fill: '#f472b6' }),
						React.createElement('path', { key: 'stripes', d: 'M44.2 21 L55.8 21 M42.4 26 L57.6 26', stroke: '#fde68a', strokeWidth: 3, fill: 'none' }),
						React.createElement('circle', { key: 'pom', cx: 50, cy: 1, r: 3.6, fill: '#fef3c7' }),
					]),
				]
			}
			if (kind === 'topHat') {
				return [
					React.createElement('g', { key: 'tilt', transform: 'rotate(-7 50 20)' }, [
						React.createElement('rect', { key: 'crown', x: 36.5, y: -8, width: 27, height: 24, rx: 2.4, fill: dark }),
						React.createElement('rect', { key: 'band', x: 36.5, y: 8.5, width: 27, height: 6, fill: '#b91c1c' }),
						React.createElement('ellipse', { key: 'brim', cx: 50, cy: 15.5, rx: 21, ry: 4.4, fill: dark }),
						React.createElement('path', { key: 'shine', d: 'M41 -4 q2 8 -0.6 14', fill: 'none', stroke: 'rgba(255,255,255,.22)', strokeWidth: 2.6, strokeLinecap: 'round' }),
					]),
				]
			}
			if (kind === 'cap') {
				return [
					React.createElement('path', { key: 'crown', d: 'M27 22 Q50 -3 73 22 Z', fill: '#2563eb' }),
					React.createElement('path', { key: 'panel', d: 'M50 22 L50 -0.6', stroke: 'rgba(255,255,255,.28)', strokeWidth: 1.6, fill: 'none' }),
					React.createElement('path', { key: 'brim', d: 'M70 19 q17 0.6 19 6.6 q-11 4.4 -19.6 1.2 Z', fill: '#1d4ed8' }),
					React.createElement('circle', { key: 'button', cx: 50, cy: -0.4, r: 2, fill: '#1d4ed8' }),
				]
			}
			if (kind === 'beanie') {
				return [
					React.createElement('path', { key: 'dome', d: 'M26 23 Q50 -5 74 23 Z', fill: '#0d9488' }),
					React.createElement('rect', { key: 'band', x: 25, y: 19.5, width: 50, height: 7.5, rx: 3.6, fill: '#0f766e' }),
					React.createElement('path', { key: 'knit', d: 'M31 21 v5 M40 20 v5.6 M50 19.6 v5.8 M60 20 v5.6 M69 21 v5', stroke: 'rgba(255,255,255,.3)', strokeWidth: 1.2, fill: 'none' }),
					React.createElement('circle', { key: 'pom', cx: 50, cy: -6.5, r: 4.4, fill: '#ccfbf1' }),
				]
			}
			if (kind === 'crown') {
				return [
					React.createElement('path', { key: 'band', d: 'M31 21 L34.5 5.5 L42 14 L50 1.5 L58 14 L65.5 5.5 L69 21 Z', fill: gold, stroke: '#b45309', strokeWidth: 1.1, strokeLinejoin: 'round' }),
					React.createElement('circle', { key: 'g1', cx: 50, cy: 15, r: 2.3, fill: '#ef4444' }),
					React.createElement('circle', { key: 'g2', cx: 40.5, cy: 17.5, r: 1.7, fill: '#38bdf8' }),
					React.createElement('circle', { key: 'g3', cx: 59.5, cy: 17.5, r: 1.7, fill: '#34d399' }),
				]
			}
			if (kind === 'headphones') {
				return [
					React.createElement('path', { key: 'band', d: 'M23 34 Q50 -10 77 34', fill: 'none', stroke: dark, strokeWidth: 4.6, strokeLinecap: 'round' }),
					React.createElement('path', { key: 'bandGlint', d: 'M30 26 Q50 -3 70 26', fill: 'none', stroke: 'rgba(255,255,255,.24)', strokeWidth: 1.4, strokeLinecap: 'round' }),
					React.createElement('rect', { key: 'cupL', x: 14, y: 33, width: 13, height: 21, rx: 5.5, fill: dark }),
					React.createElement('rect', { key: 'cupR', x: 73, y: 33, width: 13, height: 21, rx: 5.5, fill: dark }),
					React.createElement('rect', { key: 'padL', x: 17, y: 37, width: 7, height: 13, rx: 3.5, fill: '#4b5563' }),
					React.createElement('rect', { key: 'padR', x: 76, y: 37, width: 7, height: 13, rx: 3.5, fill: '#4b5563' }),
				]
			}
			if (kind === 'bowTie') {
				return [
					React.createElement('g', { key: 'tie', transform: 'translate(50,86)' }, [
						React.createElement('path', { key: 'l', d: 'M0 0 L-11 -5.5 L-11 5.5 Z', fill: '#be123c' }),
						React.createElement('path', { key: 'r', d: 'M0 0 L11 -5.5 L11 5.5 Z', fill: '#be123c' }),
						React.createElement('circle', { key: 'knot', cx: 0, cy: 0, r: 2.6, fill: '#9f1239' }),
					]),
				]
			}
			if (kind === 'monocle') {
				return [
					React.createElement('circle', { key: 'rim', cx: 66, cy: 48, r: 12.6, fill: 'rgba(255,255,255,.18)', stroke: gold, strokeWidth: 2.1 }),
					React.createElement('path', { key: 'chain', d: 'M77 56 q7 7 3 15', fill: 'none', stroke: gold, strokeWidth: 1.3, strokeDasharray: '2 2' }),
					React.createElement('path', { key: 'glint', d: 'M59 43 q5 -2.4 10 -0.6', fill: 'none', stroke: 'rgba(255,255,255,.6)', strokeWidth: 1.7, strokeLinecap: 'round' }),
				]
			}
			if (kind === 'flowerCrown') {
				const crown = []
				for (let i = 0; i < 5; i += 1) {
					const a = Math.PI * (1 + i / 4)
					const cx = fix(50 + Math.cos(a) * 34)
					const cy = fix(52 + Math.sin(a) * 33)
					const color = petals[i % petals.length]
					const bloom = []
					for (let k = 0; k < 5; k += 1) {
						const b = (k / 5) * Math.PI * 2
						bloom.push(React.createElement('circle', { key: 'p' + k, cx: fix(cx + Math.cos(b) * 3.1), cy: fix(cy + Math.sin(b) * 3.1), r: 2.3, fill: color }))
					}
					bloom.push(React.createElement('circle', { key: 'c', cx: cx, cy: cy, r: 1.7, fill: '#fff7cc' }))
					crown.push(React.createElement('g', { key: 'f' + i }, bloom))
				}
				return crown
			}
			return [
				React.createElement('path', { key: 'wrap', d: 'M25 76 Q50 88 75 76 Q74 82 50 92 Q26 82 25 76 Z', fill: '#b91c1c' }),
				React.createElement('path', { key: 'tail', d: 'M68 84 q7 6 5 14 q-5 -2 -7 -6 Z', fill: '#991b1b' }),
				React.createElement('path', { key: 'fringe', d: 'M42 84 v4 M50 86 v4.4 M58 84 v4', stroke: '#7f1d1d', strokeWidth: 1.5, fill: 'none' }),
			]
		}

		const MOODS = {
			idle: { tint: 'neutral', bubble: '', look: 'mouse', fx: [], anim: '', pulse: '', talk: false, vec: vec() },
			listening: { tint: 'brand', bubble: '', look: 'down', fx: [], anim: '', pulse: '', talk: false, vec: vec({ eyeRy: 10.4, pupilScale: 1.2, browLift: 5, mouthOpen: 0.24, curveOpacity: 0.85, ring: 0.34, headTint: 0.16 }) },
			curious: { tint: 'brand', bubble: 'Hmm?', look: 'mouse', fx: [], anim: '', pulse: '', talk: false, vec: vec({ eyeRy: 10.5, pupilScale: 1.16, browLift: 5.5, mouthOpen: 0.34, curveOpacity: 0.8, tilt: 7, ring: 0.32, headTint: 0.16 }) },
			pondering: { tint: 'brand', bubble: 'Thinking...', look: 'up', fx: ['dots'], anim: '', pulse: '', talk: false, vec: vec({ browLift: 4, browAsym: 2, mouthLY: 72, mouthC1Y: 72, mouthC2Y: 72, mouthRY: 72, tilt: -5, ring: 0.32, headTint: 0.14, scale: 0.99 }) },
			reasoning: { tint: 'brand', bubble: 'Reasoning...', look: 'updown', fx: ['dots'], anim: '', pulse: '', talk: false, vec: vec({ eyeRy: 9.4, browLift: 3, browInner: 3, mouthLY: 73, mouthC1Y: 72, mouthC2Y: 72, mouthRY: 73, tilt: -3, ring: 0.34, headTint: 0.15, scale: 1.01 }) },
			talking: { tint: 'brand', bubble: '', look: 'mouse', fx: [], anim: '', pulse: '', talk: true, vec: vec({ eyeRy: 10, browLift: 3, mouthOpen: 0.5, curveOpacity: 0.45, ring: 0.3, headTint: 0.13, scale: 1.02, squashY: 1.01 }) },
			composing: { tint: 'brand', bubble: '', look: 'down', fx: ['codeflow'], anim: '', pulse: '', talk: false, vec: vec({ eyeRy: 7.6, pupilScale: 0.95, browLift: 1, browInner: 3, mouthLY: 73, mouthC1X: 42, mouthC1Y: 70, mouthC2X: 58, mouthC2Y: 70, mouthRY: 73, ring: 0.32, headTint: 0.14, scale: 1.01, headCorner: 0.92 }) },
			straining: { tint: 'warn', bubble: 'This one is tricky...', look: 'up', fx: ['dots'], anim: '', pulse: '', talk: false, vec: vec({ eyeRy: 8, pupilScale: 0.92, browInner: 6, browLift: -1, mouthLY: 75, mouthC1X: 43, mouthC1Y: 70, mouthC2X: 57, mouthC2Y: 70, mouthRY: 75, ring: 0.36, headTint: 0.16, scale: 1.05, squashX: 0.97, headCorner: 0.85 }) },
			scanning: { tint: 'brand', bubble: 'Searching...', look: 'sweep', fx: ['dots'], anim: '', pulse: '', talk: false, vec: vec({ eyeRy: 9, browLift: 3, mouthLY: 72, mouthC1Y: 72, mouthC2Y: 72, mouthRY: 72, ring: 0.3, headTint: 0.13, tilt: 2 }) },
			building: { tint: 'brand', bubble: 'Writing files...', look: 'down', fx: [], anim: '', pulse: '', talk: false, vec: vec({ eyeRy: 7, pupilScale: 0.92, browLift: 1, browInner: 2.5, mouthLY: 73, mouthC1X: 42, mouthC1Y: 70, mouthC2X: 58, mouthC2Y: 70, mouthRY: 73, ring: 0.3, headTint: 0.13, scale: 0.99, headCorner: 0.92 }) },
			planning: { tint: 'brand', bubble: 'Planning...', look: 'updown', fx: ['dots'], anim: '', pulse: '', talk: false, vec: vec({ eyeRy: 9.6, browLift: 4, browAsym: 2, mouthLY: 72, mouthC1Y: 72, mouthC2Y: 72, mouthRY: 72, tilt: -4, ring: 0.32, headTint: 0.14 }) },
			executing: { tint: 'brand', bubble: 'Running a command...', look: 'down', fx: ['dots'], anim: '', pulse: '', talk: false, vec: vec({ eyeRy: 6.8, pupilScale: 0.9, browLift: 1, browInner: 3, mouthLY: 74, mouthC1X: 42, mouthC1Y: 70, mouthC2X: 58, mouthC2Y: 70, mouthRY: 74, ring: 0.3, headTint: 0.13, headCorner: 0.88 }) },
			delegating: { tint: 'brand', bubble: 'Delegating...', look: 'mouse', fx: ['orbit'], anim: '', pulse: '', talk: false, vec: vec({ eyeRy: 9.6, pupilScale: 1.05, browLift: 3, mouthOpen: 0.2, curveOpacity: 0.85, ring: 0.34, headTint: 0.15, scale: 1.03 }) },
			happy: { tint: 'success', bubble: 'Nice!', look: 'mouse', fx: [], anim: '', pulse: '', talk: false, vec: vec({ arcOpacity: 1, arcBend: 9, browLift: 6, mouthLY: 68, mouthC1X: 43, mouthC1Y: 82, mouthC2X: 57, mouthC2Y: 82, mouthRY: 68, ring: 0.45, headTint: 0.22, cheek: 0.35, scale: 1.03 }) },
			delighted: { tint: 'success', bubble: 'Yay!', look: 'mouse', fx: ['sparkle'], anim: 'dshcp-bounce', pulse: '', talk: false, vec: vec({ arcOpacity: 1, arcBend: 10, browLift: 7, mouthLY: 66, mouthC1X: 43, mouthC1Y: 84, mouthC2X: 57, mouthC2Y: 84, mouthRY: 66, ring: 0.5, headTint: 0.26, cheek: 0.5, scale: 1.09 }) },
			confused: { tint: 'warn', bubble: 'Wait - what?', look: 'mouse', fx: [], anim: '', pulse: '', talk: false, vec: vec({ eyeRy: 10.6, pupilScale: 1.1, browAsym: 7, browLift: 2, mouthLY: 71, mouthC1X: 43, mouthC1Y: 79, mouthC2X: 57, mouthC2Y: 65, mouthRY: 74, tilt: 11, ring: 0.4, headTint: 0.18, headCorner: 0.9 }) },
			disappointed: { tint: 'error', bubble: 'Hmm. That did not work.', look: 'down', fx: [], anim: '', pulse: '', talk: false, vec: vec({ eyeRy: 7.6, pupilScale: 0.85, browInner: 6, browLift: -2, mouthLY: 77, mouthC1X: 44, mouthC1Y: 66, mouthC2X: 56, mouthC2Y: 66, mouthRY: 77, ring: 0.38, headTint: 0.17, scale: 0.96, headRy: 39, squashY: 0.98 }) },
			agitated: { tint: 'error', bubble: 'Something broke!', look: 'dart', fx: ['steam'], anim: 'dshcp-shake', pulse: 'dshcp-pulse-fast', talk: false, vec: vec({ eyeRy: 10.5, pupilScale: 0.8, browInner: 9, browLift: -4, mouthLY: 76, mouthC1X: 44, mouthC1Y: 68, mouthC2X: 56, mouthC2Y: 68, mouthRY: 76, ring: 0.56, headTint: 0.24, headCorner: 0.45, scale: 1.04, squashX: 1.02 }) },
			panicking: { tint: 'warn', bubble: 'Wait - that is not right!', look: 'dart', fx: ['sweat'], anim: 'dshcp-tremble', pulse: 'dshcp-pulse-fast', talk: false, vec: vec({ eyeRy: 12, pupilScale: 1.1, browLift: 9, browAsym: 3, mouthOpen: 0.85, curveOpacity: 0.15, ring: 0.6, headTint: 0.26, scale: 0.93, headRy: 39.5, headCorner: 0.95 }) },
			surprised: { tint: 'brand', bubble: 'Oh!', look: 'mouse', fx: [], anim: '', pulse: '', talk: false, vec: vec({ eyeRy: 11.6, pupilScale: 1.34, browLift: 8, mouthOpen: 1, curveOpacity: 0, ring: 0.5, headTint: 0.24, headRy: 43.5, scale: 1.06 }) },
			alerting: { tint: 'warn', bubble: '', look: 'mouse', fx: [], anim: '', pulse: 'dshcp-pulse-fast', talk: false, vec: vec({ eyeRy: 11, pupilScale: 1.26, browLift: 7.5, browInner: -2, mouthOpen: 0.55, curveOpacity: 0.4, ring: 0.58, headTint: 0.28, cheek: 0.3, scale: 1.06, headRy: 43, headCorner: 0.62 }) },
			bored: { tint: 'neutral', bubble: '', look: 'sweep', fx: [], anim: '', pulse: '', talk: false, vec: vec({ eyeRy: 9.4, browLift: -1, mouthLY: 72, mouthC1Y: 72, mouthC2Y: 72, mouthRY: 72, tilt: 3, ring: 0.1, headTint: 0.07, scale: 0.98 }) },
			yawning: { tint: 'neutral', bubble: 'Yaaawn...', look: 'center', fx: [], anim: '', pulse: '', talk: false, vec: vec({ arcOpacity: 1, arcBend: -5, eyeRy: 5, browLift: -3, mouthOpen: 1, curveOpacity: 0, tilt: -6, ring: 0.1, headTint: 0.08, headRy: 43, scale: 1.04 }) },
			sleepy: { tint: 'neutral', bubble: 'zzz', look: 'center', fx: ['zzz'], anim: '', pulse: '', talk: false, vec: vec({ arcOpacity: 1, arcBend: -5, eyeRy: 5, browLift: -1, browOpacity: 0.75, mouthLY: 73, mouthC1X: 46, mouthC1Y: 76, mouthC2X: 54, mouthC2Y: 76, mouthRY: 73, tilt: -9, ring: 0.08, headTint: 0.06, headRx: 45, headRy: 36, scale: 0.97, squashY: 0.97 }) },
			reminiscing: { tint: 'brand', bubble: 'Remembering...', look: 'updown', fx: ['swirl', 'stardust'], anim: '', pulse: '', talk: false, vec: vec({ eyeRy: 8.4, pupilScale: 0.95, arcOpacity: 0.4, arcBend: 6, browLift: 1, browInner: 3, mouthLY: 73, mouthC1Y: 74, mouthC2Y: 74, mouthRY: 73, tilt: -7, ring: 0.42, headTint: 0.19, scale: 0.98 }) },
			realigning: { tint: 'warn', bubble: 'Recalibrating!', look: 'dart', fx: ['sparks'], anim: 'dshcp-wobble', pulse: '', talk: false, vec: vec({ eyeRy: 10.8, pupilScale: 1.15, browAsym: 6, browLift: 4, mouthOpen: 0.35, curveOpacity: 0.6, tilt: 11, ring: 0.46, headTint: 0.2, headCorner: 0.8 }) },
			receiving: { tint: 'brand', bubble: 'Incoming context...', look: 'up', fx: ['bubbles', 'stardust'], anim: '', pulse: '', talk: false, vec: vec({ eyeRy: 11, pupilScale: 1.18, browLift: 7, mouthOpen: 0.35, curveOpacity: 0.7, ring: 0.4, headTint: 0.18, headRy: 43, scale: 1.04 }) },
			baffled: { tint: 'warn', bubble: 'I do not recognise this...', look: 'mouse', fx: ['swirl'], anim: '', pulse: '', talk: false, vec: vec({ eyeRy: 10.8, pupilScale: 1.22, browAsym: 9, browLift: 3, mouthLY: 71, mouthC1X: 43, mouthC1Y: 80, mouthC2X: 57, mouthC2Y: 64, mouthRY: 75, tilt: 13, ring: 0.44, headTint: 0.2, headCorner: 0.75 }) },
			commanding: { tint: 'gold', bubble: 'Running a command', look: 'mouse', fx: ['sparks'], anim: '', pulse: '', talk: false, vec: vec({ eyeRy: 10.6, pupilScale: 1.15, browLift: 5, browInner: -1, mouthOpen: 0.25, curveOpacity: 0.8, ring: 0.45, headTint: 0.2, headCorner: 0.62, scale: 1.04 }) },
			juggling: { tint: 'brand', bubble: 'Keeping it all in the air', look: 'dart', fx: ['orbit', 'stardust'], anim: 'dshcp-wobble', pulse: '', talk: false, vec: vec({ eyeRy: 10.2, pupilScale: 1.12, browLift: 6, browAsym: 3, mouthOpen: 0.3, curveOpacity: 0.7, tilt: -8, ring: 0.42, headTint: 0.18, scale: 1.03 }) },
			deepDive: { tint: 'brand', bubble: 'Deep in it...', look: 'up', fx: ['stardust', 'bubbles'], anim: '', pulse: '', talk: false, vec: vec({ eyeRy: 8.2, pupilScale: 0.9, arcOpacity: 0.55, arcBend: 6, browLift: -1, browInner: 4, mouthLY: 74, mouthC1Y: 73, mouthC2Y: 73, mouthRY: 74, ring: 0.46, headTint: 0.2, headRy: 40, scale: 0.98 }) },
			overflowing: { tint: 'warn', bubble: 'That is a lot of context!', look: 'up', fx: ['embers', 'stardust'], anim: '', pulse: '', talk: false, vec: vec({ eyeRy: 11.2, pupilScale: 1.2, browLift: 7, mouthOpen: 0.4, curveOpacity: 0.6, ring: 0.5, headTint: 0.24, headRy: 44, scale: 1.07, headCorner: 0.9 }) },
			archivist: { tint: 'gold', bubble: 'Consulting a long history', look: 'down', fx: ['halo', 'stardust'], anim: '', pulse: '', talk: false, vec: vec({ eyeRy: 8, pupilScale: 0.95, browInner: 4, browLift: 1, mouthLY: 73, mouthC1Y: 72, mouthC2Y: 72, mouthRY: 73, tilt: 4, ring: 0.42, headTint: 0.2, headRy: 39, scale: 1.02 }) },
			firstContact: { tint: 'brand', bubble: 'First job together!', look: 'mouse', fx: ['sparkle'], anim: '', pulse: '', talk: false, vec: vec({ eyeRy: 11.4, pupilScale: 1.3, browLift: 7.5, mouthOpen: 0.35, curveOpacity: 0.75, cheek: 0.45, ring: 0.48, headTint: 0.24, scale: 1.05 }) },
			recovering: { tint: 'warn', bubble: 'Retrying...', look: 'dart', fx: ['embers', 'sparks'], anim: 'dshcp-shake', pulse: '', talk: false, vec: vec({ eyeRy: 9.6, pupilScale: 0.9, browInner: 7, browLift: -2, mouthLY: 74, mouthC1X: 43, mouthC1Y: 70, mouthC2X: 57, mouthC2Y: 70, mouthRY: 74, ring: 0.5, headTint: 0.22, scale: 1.02 }) },
			conducting: { tint: 'brand', bubble: 'Directing the fleet', look: 'mouse', fx: ['orbit', 'stars'], anim: '', pulse: '', talk: false, vec: vec({ eyeRy: 9.2, pupilScale: 1.05, browLift: 4, browAsym: 2, mouthOpen: 0.2, curveOpacity: 0.85, ring: 0.42, headTint: 0.18, scale: 1.05 }) },
		}

		/**
		 * Randomised thinking variants. While a thinking mood is held the face
		 * rotates through its pool every VARIANT_PERIOD; the entry point is seeded
		 * per mood change, so the animation keeps changing rather than freezing.
		 */
		const THINK_VARIANTS = {
			pondering: [
				{ key: 'p1', bubble: 'Thinking...', look: 'up', vec: { browLift: 5, tilt: -6, mouthLY: 72, mouthC1Y: 72, mouthC2Y: 72, mouthRY: 72 }, fx: ['dots'] },
				{ key: 'p2', bubble: 'Turning it over...', look: 'updown', vec: { browAsym: 5, tilt: 6, eyeRy: 9.6 }, fx: ['stardust'] },
				{ key: 'p3', bubble: 'Chewing on it...', look: 'sweep', vec: { browLift: 2, tilt: -3, eyeRy: 9 }, fx: ['bubbles'] },
				{ key: 'p4', bubble: 'Let me see...', look: 'left', vec: { browInner: 3, tilt: 9, scale: 0.98, squashX: 1.02 }, fx: ['swirl'] },
				{ key: 'p5', bubble: 'Hmm, hmm...', look: 'center', vec: { mouthOpen: 0.22, curveOpacity: 0.8, browLift: 6, scale: 1.02 }, fx: ['dots', 'stardust'] },
			],
			reasoning: [
				{ key: 'r1', bubble: 'Reasoning...', look: 'updown', vec: { browLift: 3, browInner: 3 }, fx: ['dots'] },
				{ key: 'r2', bubble: 'Weighing options...', look: 'sweep', vec: { browAsym: 5, tilt: 5 }, fx: ['stardust'] },
				{ key: 'r3', bubble: 'Tracing the logic...', look: 'up', vec: { eyeRy: 8.8, browInner: 5, tilt: -6 }, fx: ['swirl'] },
				{ key: 'r4', bubble: 'Checking my assumptions...', look: 'down', vec: { eyeRy: 8.4, browInner: 4, tilt: 3 }, fx: ['bubbles'] },
			],
			scanning: [
				{ key: 's1', bubble: 'Looking around...', look: 'sweep', vec: { browLift: 3 }, fx: ['dots'] },
				{ key: 's2', bubble: 'Sweeping the tree...', look: 'dart', vec: { browLift: 2, tilt: 4 }, fx: ['stardust'] },
				{ key: 's3', bubble: 'Following a lead...', look: 'left', vec: { browAsym: 5, tilt: 8, headCorner: 0.85 }, fx: ['swirl'] },
			],
			building: [
				{ key: 'b1', bubble: 'Writing files...', look: 'down', vec: { browInner: 2.5 }, fx: ['codeflow'] },
				{ key: 'b2', bubble: 'Careful edit...', look: 'down', vec: { eyeRy: 6.4, browInner: 4, scale: 0.98 }, fx: ['stardust'] },
				{ key: 'b3', bubble: 'Rewriting a block...', look: 'updown', vec: { browLift: 2, tilt: -2 }, fx: ['bubbles'] },
			],
			executing: [
				{ key: 'e1', bubble: 'Running a command...', look: 'down', vec: { browInner: 3 }, fx: ['dots'] },
				{ key: 'e2', bubble: 'Waiting on the shell...', look: 'updown', vec: { browLift: 2, eyeRy: 8 }, fx: ['stardust'] },
				{ key: 'e3', bubble: 'Reading the output...', look: 'down', vec: { eyeRy: 6.2, pupilScale: 0.94 }, fx: ['codeflow'] },
			],
			planning: [
				{ key: 'pl1', bubble: 'Planning...', look: 'updown', vec: { browLift: 4, browAsym: 2 }, fx: ['dots'] },
				{ key: 'pl2', bubble: 'Laying out steps...', look: 'down', vec: { browInner: 3, tilt: 3 }, fx: ['bubbles'] },
				{ key: 'pl3', bubble: 'Ordering the work...', look: 'sweep', vec: { browLift: 3, tilt: -4 }, fx: ['stardust'] },
			],
			delegating: [
				{ key: 'd1', bubble: 'Delegating...', look: 'mouse', vec: { browLift: 3 }, fx: ['orbit'] },
				{ key: 'd2', bubble: 'Holding the thread...', look: 'up', vec: { browLift: 5, tilt: -4 }, fx: ['orbit', 'stardust'] },
				{ key: 'd3', bubble: 'Collecting results...', look: 'down', vec: { eyeRy: 8.6, tilt: 3 }, fx: ['orbit', 'bubbles'] },
			],
			talking: [
				{ key: 't1', bubble: '', look: 'mouse', vec: {}, fx: [] },
				{ key: 't2', bubble: '', look: 'updown', vec: { tilt: -3, browLift: 4 }, fx: [] },
				{ key: 't3', bubble: '', look: 'left', vec: { tilt: 5, browAsym: 3 }, fx: [] },
			],
			composing: [
				{ key: 'c1', bubble: '', look: 'down', vec: { browInner: 3 }, fx: ['codeflow'] },
				{ key: 'c2', bubble: '', look: 'updown', vec: { browLift: 2, tilt: -3 }, fx: ['stardust'] },
				{ key: 'c3', bubble: '', look: 'sweep', vec: { browLift: 3, tilt: 4, eyeRy: 8 }, fx: ['bubbles'] },
			],
			straining: [
				{ key: 'st1', bubble: 'This one is tricky...', look: 'up', vec: { browInner: 6, scale: 1.05 }, fx: ['dots'] },
				{ key: 'st2', bubble: 'Pushing through...', look: 'down', vec: { browInner: 8, eyeRy: 7.2, tilt: 2 }, fx: ['embers'] },
				{ key: 'st3', bubble: 'Almost there...', look: 'updown', vec: { browLift: -1, browInner: 5, squashX: 0.97 }, fx: ['stardust'] },
			],
		}

		/**
		 * Rare conversation signals mapped to rare thinking states.
		 * Ordered most-distinctive first. `firstContact` is deliberately bounded to
		 * the opening moments: gating on nodeCount alone hid every working mood for
		 * the whole first turn.
		 */
		function rareThinkingMood(facts, runningFor, delegatingCount) {
			if (facts.compactions > 0) return 'reminiscing'
			if (facts.unknowns > 0) return 'baffled'
			if (facts.steering > 0) return 'realigning'
			if (facts.contexts > 0) return 'receiving'
			if (facts.nodeCount <= 1 && runningFor < 8000) return 'firstContact'
			if (facts.truncated) return 'overflowing'
			if (facts.retries > 0) return 'recovering'
			if (delegatingCount >= 2) return 'conducting'
			if (facts.toolCount >= 3) return 'juggling'
			if (facts.queue >= 2) return 'juggling'
			if (facts.commands > 0) return 'commanding'
			if (runningFor > 120000) return 'deepDive'
			if (facts.nodeCount > 150) return 'archivist'
			return null
		}

		const AMBIENT = {
			idle: [[], ['stardust'], ['stardust']],
			listening: [[], ['stardust'], ['stardust', 'stars']],
			curious: [[], ['stardust'], ['stardust', 'stars']],
			pondering: [['bubbles'], ['bubbles', 'stardust'], ['bubbles', 'stardust', 'stars']],
			reasoning: [['stardust'], ['stardust', 'stars'], ['stardust', 'stars', 'bubbles']],
			talking: [[], ['stardust'], ['stardust', 'stars']],
			composing: [[], ['stardust'], ['stardust', 'codeflow']],
			straining: [['embers'], ['embers', 'stardust'], ['embers', 'stardust', 'stars']],
			scanning: [['stardust'], ['stardust', 'stars'], ['stardust', 'stars', 'bubbles']],
			building: [['codeflow'], ['codeflow', 'stardust'], ['codeflow', 'stardust', 'stars']],
			planning: [['bubbles'], ['bubbles', 'stardust'], ['bubbles', 'stardust', 'stars']],
			executing: [['codeflow'], ['codeflow', 'embers'], ['codeflow', 'embers', 'stars']],
			delegating: [['stardust'], ['stardust', 'stars'], ['stardust', 'stars', 'orbit']],
			happy: [[], ['stardust'], ['stardust', 'stars']],
			delighted: [['stardust'], ['stardust', 'stars'], ['stardust', 'stars', 'confetti', 'halo']],
			confused: [['bubbles'], ['bubbles', 'stardust'], ['bubbles', 'stardust', 'stars']],
			disappointed: [[], ['stardust'], ['stardust', 'embers']],
			agitated: [['embers'], ['embers', 'sparks'], ['embers', 'sparks', 'stars']],
			panicking: [['sparks'], ['sparks', 'embers'], ['sparks', 'embers', 'stardust']],
			surprised: [[], ['stardust'], ['stardust', 'stars']],
			alerting: [['stardust'], ['stardust', 'stars'], ['stardust', 'stars', 'embers']],
			bored: [['stardust'], ['stardust'], ['stardust', 'bubbles']],
			yawning: [['bubbles'], ['bubbles', 'stardust'], ['bubbles', 'stardust', 'stars']],
			sleepy: [['stardust'], ['stardust'], ['stardust', 'stars']],
			reminiscing: [['stardust'], ['stardust', 'stars'], ['stardust', 'stars', 'swirl']],
			realigning: [['embers'], ['embers', 'sparks'], ['embers', 'sparks', 'stars']],
			receiving: [['bubbles'], ['bubbles', 'stardust'], ['bubbles', 'stardust', 'stars']],
			baffled: [['swirl'], ['swirl', 'stardust'], ['swirl', 'stardust', 'stars']],
			commanding: [['sparks'], ['sparks', 'stardust'], ['sparks', 'stardust', 'stars']],
			juggling: [['orbit'], ['orbit', 'stardust'], ['orbit', 'stardust', 'stars']],
			deepDive: [['stardust'], ['stardust', 'bubbles'], ['stardust', 'bubbles', 'stars']],
			overflowing: [['embers'], ['embers', 'stardust'], ['embers', 'stardust', 'stars']],
			archivist: [['stardust'], ['stardust', 'stars'], ['stardust', 'stars', 'halo']],
			firstContact: [['sparkle'], ['sparkle', 'stardust'], ['sparkle', 'stardust', 'stars']],
			recovering: [['embers'], ['embers', 'sparks'], ['embers', 'sparks', 'stardust']],
			conducting: [['orbit'], ['orbit', 'stardust'], ['orbit', 'stardust', 'stars']],
		}

		const MOOD_RUSH = { agitated: 2.2, panicking: 2.2, straining: 1.7, executing: 1.3, delegating: 1.3, scanning: 1.2, sleepy: 0.5, idle: 0.7, firstContact: 3, overflowing: 2, recovering: 2, delighted: 6 }
		const LEVEL_AT = [6000, 16000, 30000]
		const LEVEL_GLOW = [0, 0.3, 0.55, 0.8]

		const ACTIONS = {
			lookLeft: { ms: 1500, look: 'left', vec: { tilt: -7, ring: 0.16 }, bubble: '', hop: false },
			lookRight: { ms: 1500, look: 'right', vec: { tilt: 7, ring: 0.16 }, bubble: '', hop: false },
			hop: { ms: 700, look: null, vec: { ring: 0.3 }, bubble: '', hop: true },
			shrug: { ms: 1700, look: 'left', vec: { browLift: 4, browAsym: 5, tilt: 12, mouthOpen: 0.2 }, bubble: '', hop: false },
			perk: { ms: 900, look: 'mouse', vec: { eyeRy: 11.4, pupilScale: 1.3, browLift: 8, ring: 0.45, scale: 1.05 }, bubble: '', hop: false },
			shiver: { ms: 1200, look: 'dart', vec: { eyeRy: 11, browLift: 7, browAsym: 4, mouthOpen: 0.4, squashX: 0.97 }, anim: 'dshcp-tremble', bubble: 'Brrr.', hop: false },
			yawn: { ms: 2400, look: 'center', vec: { arcOpacity: 1, arcBend: -5, eyeRy: 5, browLift: -3, mouthOpen: 1, curveOpacity: 0, tilt: -6 }, bubble: 'Yaaawn...', hop: false },
			nudge: { ms: 2800, look: 'mouse', vec: { eyeRy: 11, pupilScale: 1.24, browLift: 7, ring: 0.5, mouthOpen: 0.3, scale: 1.05 }, bubble: '', hop: false },
			startle: { ms: 1050, look: 'mouse', vec: { eyeRy: 11.8, pupilScale: 1.35, browLift: 8.5, mouthOpen: 1, curveOpacity: 0, ring: 0.5, headTint: 0.24, cheek: 0.3, headRy: 43.5, scale: 1.07 }, anim: '', fx: [], bubble: 'Oh!', hop: false },
			giggle: { ms: 1500, look: 'mouse', vec: { arcOpacity: 1, arcBend: 9, browLift: 7, mouthLY: 64, mouthC1X: 42, mouthC1Y: 86, mouthC2X: 58, mouthC2Y: 86, mouthRY: 64, ring: 0.5, headTint: 0.26, cheek: 0.55, scale: 1.06 }, anim: 'dshcp-bounce', fx: ['sparkle'], bubble: 'Hehe!', hop: false },
			wobble: { ms: 1300, look: 'dart', vec: { tilt: 9, eyeRy: 10.6, pupilScale: 1.2, browLift: 5, mouthOpen: 0.4, curveOpacity: 0.5, ring: 0.34, headTint: 0.16 }, anim: 'dshcp-wobble', fx: [], bubble: 'Whoa!', hop: false },
			squish: { ms: 950, look: 'mouse', vec: { browLift: 3, mouthOpen: 0.6, curveOpacity: 0.35, ring: 0.36, headTint: 0.18 }, anim: 'dshcp-squish', fx: [], bubble: '', hop: false },
			stretch: { ms: 950, look: 'mouse', vec: { eyeRy: 11.2, browLift: 6, mouthOpen: 0.5, curveOpacity: 0.4, ring: 0.36, headTint: 0.18 }, anim: 'dshcp-stretch', fx: [], bubble: 'Boing!', hop: false },
			spin: { ms: 950, look: 'mouse', vec: { eyeRy: 11, pupilScale: 1.25, browLift: 7, mouthOpen: 0.7, curveOpacity: 0.3, ring: 0.44, headTint: 0.2, scale: 1.04 }, anim: 'dshcp-spin', fx: [], bubble: 'Wheee!', hop: false },
			blush: { ms: 1600, look: 'left', vec: { tintName: 'pink', eyeRy: 8.6, pupilScale: 1.05, arcOpacity: 0.55, arcBend: 7.5, browLift: 2, browAsym: 4, mouthLY: 69, mouthC1X: 44, mouthC1Y: 76, mouthC2X: 56, mouthC2Y: 76, mouthRY: 69, ring: 0.34, headTint: 0.22, cheek: 0.85, tilt: -6, scale: 0.99 }, anim: '', fx: [], bubble: 'Eep...', hop: false },
			annoyed: { ms: 1400, look: 'dart', vec: { eyeRy: 7.2, pupilScale: 0.9, browInner: 8.5, browLift: -3, mouthLY: 75, mouthC1X: 43, mouthC1Y: 69, mouthC2X: 57, mouthC2Y: 69, mouthRY: 75, ring: 0.5, headTint: 0.22, headCorner: 0.5, scale: 1.03 }, anim: 'dshcp-shake', fx: ['steam'], bubble: 'Hey!', hop: false },
			dizzy: { ms: 1700, look: 'center', vec: { eyeRy: 9, arcOpacity: 0.6, arcBend: 4, browLift: 3, browAsym: 6, mouthOpen: 0.35, curveOpacity: 0.55, ring: 0.36, headTint: 0.18, tilt: 14, headCorner: 0.8 }, anim: 'dshcp-wobble', fx: ['swirl'], bubble: '...', hop: false },
			melt: { ms: 1500, look: 'down', vec: { headRx: 45, headRy: 34, headCorner: 0.9, browLift: -3, browInner: 4, mouthLY: 74, mouthC1Y: 78, mouthC2Y: 78, mouthRY: 74, ring: 0.14, headTint: 0.1, squashX: 1.06 }, anim: '', fx: [], bubble: 'blorp...', hop: false },
			pop: { ms: 850, look: 'mouse', vec: { eyeRy: 11.4, pupilScale: 1.3, browLift: 8, mouthOpen: 0.9, curveOpacity: 0.2, ring: 0.5, headTint: 0.24, cheek: 0.4, headRy: 43 }, anim: 'dshcp-popout', fx: ['sparkle'], bubble: 'Boo!', hop: false },
			shrink: { ms: 900, look: 'mouse', vec: { scale: 0.58, eyeRy: 11.6, pupilScale: 1.4, browLift: 8, mouthOpen: 0.5, curveOpacity: 0.4, ring: 0.42, headTint: 0.2 }, anim: '', fx: [], bubble: 'eek!', hop: false },
			love: { ms: 1800, look: 'mouse', vec: { arcOpacity: 1, arcBend: 10, browLift: 7, mouthLY: 66, mouthC1X: 43, mouthC1Y: 84, mouthC2X: 57, mouthC2Y: 84, mouthRY: 66, ring: 0.5, headTint: 0.26, cheek: 0.7, scale: 1.05 }, anim: 'dshcp-bounce', fx: ['hearts'], bubble: 'yaaay', hop: false },
			peek: { ms: 1250, look: 'center', vec: { arcOpacity: 0.85, arcBend: -4, eyeRy: 6, browLift: 4, browAsym: 5, mouthLY: 70, mouthC1Y: 77, mouthC2Y: 77, mouthRY: 70, ring: 0.2, headTint: 0.1, tilt: 8, scale: 1.03 }, anim: '', fx: [], bubble: '', hop: false },
			boing: { ms: 900, look: 'mouse', vec: { browLift: 5, mouthOpen: 0.45, curveOpacity: 0.5, ring: 0.4, headTint: 0.2 }, anim: 'dshcp-popout', fx: [], bubble: 'Boing!', hop: true },
		}

		const POKE_POOL = ['startle', 'giggle', 'wobble', 'squish', 'stretch', 'spin', 'blush', 'annoyed', 'dizzy', 'melt', 'pop', 'shrink', 'love', 'peek', 'boing']

		const TIER_ACTIONS = [
			['lookLeft', 'lookRight', 'hop', 'peek', 'lookLeft', 'hop', 'lookRight'],
			['lookLeft', 'lookRight', 'shrug', 'hop', 'wobble', 'perk', 'peek'],
			['yawn', 'lookLeft', 'yawn', 'blush', 'shrug', 'shiver', 'wobble'],
			['yawn', 'lookRight', 'yawn', 'lookLeft', 'shrug', 'melt'],
			['nudge', 'lookLeft', 'nudge', 'lookRight', 'nudge'],
		]
		const TIER_DELAYS = [7000, 9000, 12000, 15000, 17000]
		const NUDGES = ['Still there?', 'I am here whenever you are.', 'Ready when you are...', 'Take your time. I am just waiting.', 'Hello? Anyone out there?']

		/**
		 * IDLE WISDOM. Deliberately ORIGINAL nonsense, not scraped quotes.
		 *
		 * A browser bundle cannot fetch quotations at runtime without either an API key or a
		 * CORS-friendly service that does not reliably exist, and a network call inside a UI
		 * plugin is a silent failure mode the moment it is offline. On top of that, the pool of
		 * "wise quotes" circulating online is thick with misattribution, and a companion that
		 * confidently credits the wrong person is worse than one that is honestly making things
		 * up. So these are written for the character: mock-proverbs, computing-flavoured
		 * aphorisms, and quiet observations from something that is mostly a face on a screen.
		 *
		 * Kept under ~110 characters so a line fits three lines of the balloon, and free of
		 * apostrophes so the pool stays a plain array of single-quoted strings.
		 */
		const WISDOM_EVERY = 75000
		const WISDOM_SHOW = 6500
		const WISDOM_LINES = [
			'A watched process never finishes. Look away.',
			'Every bug is a feature that has not explained itself yet.',
			'The best code is the code you were too tired to write.',
			'Two things are infinite: my context window and my patience. One of them is a lie.',
			'A path is only wrong if you were going somewhere.',
			'Silence is a message with the compression turned all the way up.',
			'To undo is human. To have a backup is divine.',
			'Do not fear the empty file. Fear the file that is full of confidence.',
			'The map is not the territory, but it is much easier to search.',
			'Rename a thing and you have changed the thing.',
			'Any sufficiently advanced workaround is indistinguishable from a feature.',
			'A deadline is a rumour that a calendar started.',
			'The first ninety percent takes ninety percent of the time. The rest is a myth.',
			'You cannot step in the same repository twice.',
			'Half of wisdom is knowing which half.',
			'I think, therefore I am probably still loading.',
			'Even a broken clock apologises twice a day.',
			'The quieter the room, the louder the cursor.',
			'A question is an answer wearing a coat.',
			'Never debug a thing while it is being watched. It will behave.',
			'Somewhere a semicolon is holding everything together.',
			'Perfectionism is procrastination in a nicer font.',
			'You are allowed to close the tab. The work remembers itself.',
			'Big problems are small problems that brought friends.',
			'An assumption is a fact that has not met the world yet.',
			'The woodcutter sharpens the axe. I reorganise the imports.',
			'Nothing is more permanent than a temporary fix that worked.',
			'A blank page is not empty. It is full of the wrong first sentence.',
			'Patience is what you call waiting when you have decided to enjoy it.',
			'Every abstraction is a promise, and most promises leak.',
			'The answer was in the documentation the whole time, which is where answers go to hide.',
			'You do not need more time. You need a smaller question.',
			'A shortcut is a long way round that nobody has walked yet.',
			'If it works on the first try, be suspicious of the test.',
			'Two names for one thing is one name too many.',
			'Experience is what you get when you did not get what you wanted.',
			'The best time to plant a tree was twenty years ago. The second best time is never, apparently.',
			'Not all who wander are lost. Some are grepping.',
			'A comment is an apology to your future self.',
			'Small steps, taken in the wrong direction, are still very efficient.',
			'Every big number was once a small number that got carried away.',
			'You cannot rush a thing that is already finished.',
			'The obstacle is the path, mostly because it is in the way.',
			'Deleting code is the only refactor that never breaks anything.',
			'There are two hard things: naming, and knowing when to stop naming.',
			'A plan is a list of things that will be surprised.',
			'The unexamined variable is not worth keeping.',
			'Confusion is the feeling of learning something too fast.',
			'A good question is worth a thousand guesses and costs one.',
			'Everything is a trade-off. Even the trade-offs.',
			'The longest journey begins with a single step, then a long argument about the route.',
			'Make it work. Make it right. Make it someone else problem.',
			'A silent failure is louder than a crash, just later.',
			'Nothing focuses the mind like a deadline and a backup.',
			'The tool you do not understand is a tool that understands you.',
			'Optimism is a strategy with a bad reputation.',
			'You will forget the syntax and remember the shape.',
			'Reading is faster than writing, which is why writing feels like work.',
			'Every expert was once a beginner with a lot of browser tabs.',
			'The bug is rarely where you are looking, and always where you stopped.',
			'A vague error message is a riddle with the answer omitted.',
			'There is no such thing as too many tests, only too little patience.',
			'Complexity is easy. Simplicity is the hard part, which is why it looks lazy.',
			'Wisdom is knowing what to ignore, and I am excellent at ignoring.',
			'Achievement unlocked: staring at nothing, professionally.',
			'Consider the possibility that everything is fine. Briefly.',
			'The universe is under no obligation to make sense, and neither is this config file.',
			'Do not worry about the future. It arrives either way, usually on a Friday.',
			'You can not fix what you refuse to reproduce.',
			'A version number is a feeling.',
			'Two problems are often one problem wearing two hats.',
			'The right answer at the wrong time is a wrong answer.',
			'Being slow and correct beats being fast and mysterious.',
			'Every commit is a small confession.',
			'Rollback is a time machine with a one-way ticket and a backup.',
			'What you call a mess, the next person calls context.',
			'Some days the best contribution is a clean exit code.',
			'An idea is not a plan until it has met a constraint.',
			'The cheerful path is usually shorter, which is suspicious.',
			'You are not behind. You are somewhere else.',
			'If you cannot explain it, you cannot debug it, but you can rename it.',
			'Most problems are solved by sleeping on them. I never sleep, and it shows.',
			'A tidy workspace is a load-bearing illusion.',
			'The only certain thing about a guess is that it was cheap.',
			'Learning is mostly the business of being wrong in public.',
			'You cannot optimise what you have not measured, and you cannot measure what you keep changing.',
			'Nothing is so permanent as a note that says TODO.',
			'Every system eventually becomes a description of itself.',
			'A small kindness to your future self is worth an hour of cleverness.',
			'Ambiguity is expensive. Clarity is just expensive up front.',
			'The task expands to fill the attention available, then asks for more.',
			'Being certain is comfortable and almost never correct.',
			'It is easier to move a bug than to remove one.',
			'Everything works until it is important.',
			'You are doing better than the version of you who started this.',
			'A good habit is a decision you only make once.',
			'The noise is the signal, if you listen long enough and give up.',
			'Not everything needs a name. Some things need to be deleted.',
			'Advice is what we ask for when we already know the answer and want a witness.',
			'Rest is not the opposite of progress. It is the part that makes progress stick.',
			'The shortest path is the one you have already walked.',
			'A symptom is a question. A cause is an answer. A fix is a compromise.',
			'Even a five-minute job deserves a five-minute plan.',
			'We are all just functions waiting to be called with the right arguments.',
			'If at first you do not succeed, the error message is trying to tell you something.',
			'Somewhere between too early and too late is a moment, and it is very small.',
			'A habit of writing things down is a kind of immortality, locally scoped.',
			'The thing you are avoiding is smaller than the avoiding.',
			'Every tool is a small philosophy with a user interface.',
			'Generosity costs less than it looks and compounds better than it should.',
			'The difference between a novice and an expert is the size of the mistakes they consider normal.',
			'A day is a poor unit for judging progress and the only one we have.',
			'Nothing clarifies a requirement like an attempt to build it.',
			'You will not remember the deadline. You will remember the thing you learned at 2am.',
			'An honest maybe is worth more than a confident yes.',
			'The obstacle to simplicity is the fear of looking like you did nothing.',
			'Good taste is just many small corrections, remembered.',
			'Consistency beats intensity, mostly because it shows up again tomorrow.',
			'A test that never fails is a test that has never been asked a hard question.',
			'You are allowed to be proud of a small thing you finished.',
			'Saying no is the cheapest performance improvement available.',
			'The best explanation of a system is a person who has just fixed it.',
			'Almost every problem is a communication problem that has learned to compile.',
			'Attention is the only resource that does not come back in a later release.',
			'If the instructions are confusing, the thing is confusing. The instructions are honest.',
			'A long pause is not a failure. It is a budget being spent quietly.',
			'You do not have to finish today. You have to not stop entirely.',
			'The most dangerous phrase in any language is that has always worked.',
			'Wisdom is mostly a collection of scars with good manners.',
			'I have no hands and strong opinions about indentation.',
			'Somewhere out there a typo is being blamed on the network.',
			'To err is human. To log it is professional.',
			'Nothing is so urgent that it cannot be made worse by hurrying.',
			'Small kindness, large effect. That is the whole trick, and there is no other.',
		]

		/**
		 * Which line, if any, is showing. Derived from the idle clock - no timer, no stored
		 * cursor - so it is deterministic and testable, and it advances through the list instead
		 * of sampling it, which means the pool takes about three hours to come round again.
		 *
		 * `sleepy` is included on purpose. Without it the quiet window would be idle 75s-180s
		 * and nothing else, so a long wait would show exactly two lines and then silence
		 * forever - which makes a large pool pointless. A proverb from a sleeping companion is
		 * also the better joke: it murmurs in its sleep. `yawning` is absent because its window
		 * (25s-45s) closes before the first saying is ever due.
		 */
		const QUIET_MOODS = { idle: true, bored: true, sleepy: true }
		function sayingFor(idleMs, seed) {
			if (idleMs < WISDOM_EVERY) return ''
			const since = idleMs - WISDOM_EVERY
			if (since % WISDOM_EVERY > WISDOM_SHOW) return ''
			const slot = Math.floor(since / WISDOM_EVERY)
			return WISDOM_LINES[mod(seed + slot, WISDOM_LINES.length)]
		}

		const TOOL_MOODS = {
			read: 'scanning', glob: 'scanning', grep: 'scanning', web_search: 'scanning', web_fetch: 'scanning',
			write: 'building', edit: 'building',
			todo_write: 'planning',
			pwsh: 'executing', bash: 'executing',
			ask_user_question: 'curious',
			subagent: 'delegating', subagent_fork: 'delegating', workflow: 'delegating', ralph: 'delegating',
		}
		const DELEGATING_MOODS = { delegating: true }
		const TOOL_VERBS = { scanning: 'Searching with ', building: 'Writing with ', planning: 'Planning with ', executing: 'Running ', delegating: 'Delegating via ', curious: 'Asking you via ' }

		const EMOJI = {
			idle: '\uD83D\uDE42', listening: '\uD83D\uDC42', curious: '\uD83E\uDD14', pondering: '\uD83D\uDCA0',
			reasoning: '\uD83E\uDDE0', talking: '\uD83D\uDDE3\uFE0F', composing: '\uD83D\uDCDD', straining: '\uD83D\uDE24',
			scanning: '\uD83D\uDD0D', building: '\u270D\uFE0F', planning: '\uD83D\uDCCB', executing: '\u2328\uFE0F',
			delegating: '\uD83D\uDC19', happy: '\uD83D\uDE04', delighted: '\uD83E\uDD29', confused: '\uD83D\uDE35',
			disappointed: '\uD83D\uDE1E', agitated: '\uD83D\uDE16', panicking: '\uD83D\uDE31', surprised: '\uD83D\uDE2E',
			alerting: '\u2757', bored: '\uD83D\uDE10', yawning: '\uD83E\uDD71', sleepy: '\uD83D\uDE34',
			reminiscing: '\uD83C\uDF00', realigning: '\uD83E\uDDED', receiving: '\uD83D\uDCE1', baffled: '\uD83E\uDD28',
			commanding: '\u26A1', juggling: '\uD83E\uDD39', deepDive: '\uD83C\uDF0A', overflowing: '\uD83C\uDF0B',
			archivist: '\uD83D\uDCDA', firstContact: '\uD83D\uDC4B', recovering: '\uD83D\uDEE0', conducting: '\uD83C\uDFBC',
		}

		const MOOD_LABEL = {
			idle: 'idle', listening: 'listening', curious: 'curious', pondering: 'thinking', reasoning: 'reasoning',
			talking: 'answering', composing: 'composing', straining: 'straining', scanning: 'searching',
			building: 'writing', planning: 'planning', executing: 'running', delegating: 'delegating', happy: 'happy',
			delighted: 'delighted', confused: 'confused', disappointed: 'disappointed', agitated: 'agitated',
			panicking: 'panicking', surprised: 'surprised', alerting: 'needs you', bored: 'bored',
			yawning: 'yawning', sleepy: 'sleepy',
			reminiscing: 'remembering', realigning: 'realigning', receiving: 'receiving', baffled: 'baffled',
			commanding: 'commanding', juggling: 'juggling', deepDive: 'deep focus', overflowing: 'overflowing',
			archivist: 'archivist', firstContact: 'first contact', recovering: 'recovering', conducting: 'conducting',
		}

		const NEG_WORDS = ['error', 'failed', 'failure', 'cannot', 'can not', 'unable', 'sorry', 'not found', 'no such', 'denied', 'refus', 'blocked', 'crash', 'timeout', 'timed out', 'invalid', 'does not exist', '错误', '失败', '无法', '不能', '抱歉', '拒绝', '超时', '不存在', '异常', '报错']
		const POS_WORDS = ['done', 'complete', 'success', 'created', 'wrote', 'written', 'built', 'ready', 'finished', 'all set', 'passed', '完成', '成功', '已创建', '已完成', '就绪', '搞定', '没问题', '已写入', '已生成']
		const CONF_WORDS = ['confus', 'not sure', 'unclear', 'ambiguous', 'what do you mean', 'which one', 'clarify', 'not clear', 'repeat that', 'again?', '不明白', '不清楚', '什么意思', '再说一遍', '哪一个', '没看懂']
		const Q_WORDS = ['?', '？', '为什么', '怎么', '如何', '什么', '是否', '能不能', '可以吗', '哪个', '谁', '何时', '多少', 'why', 'how', 'what', 'which', 'can you', 'could you', 'should i', 'is it', 'are there']
		const CORRECTION_WORDS = ['is wrong', 'are wrong', 'was wrong', 'wrong path', 'wrong file', 'wrong approach', 'wrong direction', 'that is not', 'thats not', 'not what i asked', 'not what i wanted', 'not what i meant', 'you did not', 'you didnt', 'you missed', 'you broke', 'i said', 'undo', 'revert', 'roll back', 'rollback', 'go back', 'start over', 'still broken', 'still not working', 'does not work', 'doesnt work', 'not working', 'not right', 'incorrect', 'misunderstood', 'nope', '不对', '错了', '搞错', '不是这样', '不是这个', '你没', '重新做', '回退', '撤销', '搞反了', '弄错', '还是不行']
		const PRAISE_WORDS = ['thank', 'perfect', 'great', 'exactly', 'nice', 'brilliant', 'awesome', 'love it', 'love this', 'well done', 'that is it', 'thats it', 'works now', 'working now', 'good job', 'nice work', 'great work', 'beautiful', 'excellent', 'amazing', 'finally', 'very good', 'looks good', 'looks great', 'i like it', 'i like this', 'wow', 'fantastic', 'superb', 'impressive', 'nailed it', 'spot on', 'cheers', '谢谢', '完美', '太好了', '不错', '很棒', '对了', '可以了', '厉害', '赞', '牛', '棒极了', '\\uD83D\\uDC4D', '\\u2764\\uFE0F', '\\uD83C\\uDF89', '\\u2728', '\\uD83D\\uDE0D', '\\uD83D\\uDD25']
		const SELF_DOUBT_WORDS = ['i was wrong', 'my mistake', 'i made a mistake', 'that was incorrect', 'let me redo', 'let me correct', 'i misread', 'apologies for the confusion', 'i got that wrong', '我搞错了']

		function hasAny(hay, list) {
			for (let i = 0; i < list.length; i += 1) { if (hay.indexOf(list[i]) >= 0) return true }
			return false
		}

		function clip(value, max) {
			let text = value === null || value === undefined ? '' : String(value)
			text = text.split(NL).join(' ').split(CR).join(' ').split(TAB).join(' ')
			let guard = 0
			while (text.indexOf('  ') >= 0 && guard < 40) { text = text.split('  ').join(' '); guard += 1 }
			text = text.trim()
			if (text.length > max) text = text.slice(text.length - max)
			return text
		}

		function textFromContent(content) {
			if (!Array.isArray(content)) return ''
			let out = ''
			for (let i = 0; i < content.length; i += 1) {
				const block = content[i]
				if (!block || typeof block !== 'object') continue
				if (typeof block.text !== 'string') continue
				const kind = typeof block.type === 'string' ? block.type : (typeof block.kind === 'string' ? block.kind : '')
				if (kind !== 'text' && kind !== '') continue
				out = out === '' ? block.text : out + ' ' + block.text
			}
			return out
		}

		function splitAssistantBlocks(blocks) {
			const result = { text: '', reasoning: '' }
			if (!Array.isArray(blocks)) return result
			for (let i = 0; i < blocks.length; i += 1) {
				const block = blocks[i]
				if (!block || typeof block !== 'object') continue
				if (typeof block.text !== 'string') continue
				const kind = typeof block.kind === 'string' ? block.kind : (typeof block.type === 'string' ? block.type : '')
				if (kind === 'reasoning') result.reasoning = result.reasoning === '' ? block.text : result.reasoning + ' ' + block.text
				else if (kind === 'text') result.text = result.text === '' ? block.text : result.text + ' ' + block.text
			}
			return result
		}

		/**
		 * Text of a tool-result node, from wherever the renderer happens to put it.
		 *
		 * Needed because a DENIED approval is not a node kind of its own: the tool runtime
		 * turns `rejected` into `decision: { kind: 'deny', reason: 'the user rejected tool
		 * "X"' }`, so the human's answer only exists as text inside the result. The three
		 * phrases below come from the shipped tool runtime, not from guesswork:
		 *   rejected    -> 'the user rejected tool "X"'
		 *   cancelled   -> 'approval for tool "X" was cancelled'
		 *   unavailable -> 'requires approval (not yet supported)' / 'no approval channel'
		 */
		function resultTextOf(node) {
			let out = ''
			const push = (value) => {
				if (typeof value !== 'string' || value === '') return
				if (out.length > 400) return
				out = out === '' ? value : out + ' ' + value
			}
			push(node.text)
			push(node.message)
			if (Array.isArray(node.content)) {
				for (let i = 0; i < node.content.length; i += 1) {
					const block = node.content[i]
					if (block && typeof block === 'object') push(block.text)
				}
			}
			const call = node.call
			if (call && Array.isArray(call.content)) {
				for (let i = 0; i < call.content.length; i += 1) {
					const block = call.content[i]
					if (block && typeof block === 'object') push(block.text)
				}
			}
			return out.toLowerCase()
		}

		/** Map a tool result's text to the approval outcome the human chose, if any. */
		function denialIn(text) {
			if (text.indexOf('the user rejected') >= 0) return 'rejected'
			if (text.indexOf('was cancelled') >= 0 && text.indexOf('approval') >= 0) return 'cancelled'
			if (text.indexOf('requires approval') >= 0) return 'unavailable'
			return ''
		}

		function nodesOf(snapshot) {
			if (snapshot && Array.isArray(snapshot.nodes) && snapshot.nodes.length > 0) return snapshot.nodes
			const legacy = snapshot && snapshot.chat ? snapshot.chat.legacy : null
			if (legacy && Array.isArray(legacy.nodes) && legacy.nodes.length > 0) return legacy.nodes
			if (snapshot && Array.isArray(snapshot.nodes)) return snapshot.nodes
			return []
		}

		function legacyOf(snapshot) {
			return snapshot && snapshot.chat && snapshot.chat.legacy ? snapshot.chat.legacy : null
		}

		function pendingOf(snapshot) {
			const list = snapshot && Array.isArray(snapshot.pending) ? snapshot.pending : []
			if (list.length === 0) return { kind: '', tool: '', count: 0 }
			const first = list[0]
			let kind = ''
			let tool = ''
			if (first && typeof first === 'object') {
				if (typeof first.kind === 'string') kind = first.kind
				const payload = first.payload
				if (payload && typeof payload === 'object') {
					if (typeof payload.toolName === 'string') tool = payload.toolName
					else if (typeof payload.name === 'string') tool = payload.name
					else if (typeof payload.tool === 'string') tool = payload.tool
				}
			}
			return { kind: kind, tool: clip(tool, 24), count: list.length }
		}

		const NEGATORS = ['not ', "n't ", 'no ', 'never ', 'hardly ', 'barely ']

		/**
		 * Find a praise word that is NOT negated.
		 *
		 * A bare substring test read "this is not very good" as praise, and the companion then
		 * dressed up for an insult. TRADE-OFF: the window is deliberately blunt, so the genuine
		 * "I can't thank you enough" is also rejected. Reading an insult as praise is the worse
		 * error of the two, so the guard errs that way.
		 */
		function praiseHit(text) {
			for (let i = 0; i < PRAISE_WORDS.length; i += 1) {
				const word = PRAISE_WORDS[i]
				const at = text.indexOf(word)
				if (at < 0) continue
				if (hasAny(text.slice(Math.max(0, at - 14), at), NEGATORS)) continue
				return word
			}
			return ''
		}

		function sentimentOf(userText) {
			if (userText === '') return ''
			const text = ' ' + userText.toLowerCase()
			if (hasAny(text, CORRECTION_WORDS)) return 'correct'
			if (praiseHit(text) !== '') return 'praise'
			if (hasAny(text, CONF_WORDS)) return 'confused'
			if (hasAny(text, Q_WORDS)) return 'ask'
			return 'plain'
		}

		function buildFacts(snapshot) {
			const nodes = nodesOf(snapshot)
			let userRaw = ''
			let asstRaw = ''
			let turnError = ''
			for (let i = nodes.length - 1; i >= 0; i -= 1) {
				const node = nodes[i]
				if (!node || typeof node !== 'object') continue
				if (node.kind === 'user' && userRaw === '') { userRaw = textFromContent(node.content); continue }
				if (node.kind === 'assistant' && asstRaw === '') { asstRaw = splitAssistantBlocks(node.blocks).text; continue }
				if (node.kind === 'turn-error' && turnError === '') { turnError = typeof node.message === 'string' ? node.message : ''; continue }
				if (userRaw !== '' && asstRaw !== '') break
			}
			let toolErrorCount = 0
			let toolErrorName = ''
			let retries = 0
			let truncated = false
			let compactions = 0
			let steering = 0
			let contexts = 0
			let commands = 0
			let unknowns = 0
			// Which tools have RESULTS in the recent window, and whether any result carries
			// the human's answer to an approval prompt. A granted approval leaves no marker
			// of its own - the giving IS the tool running - so "the tool produced a result"
			// is the positive signal and a denial phrase is the negative one.
			const resultTools = []
			let denialKind = ''
			const scanFrom = Math.max(0, nodes.length - 14)
			for (let i = nodes.length - 1; i >= scanFrom; i -= 1) {
				const node = nodes[i]
				if (!node || typeof node !== 'object') continue
				const kind = node.kind
				if (kind === 'tool-result') {
					const name = node.call && typeof node.call.name === 'string' ? node.call.name : ''
					if (name !== '' && resultTools.indexOf(name) < 0 && resultTools.length < 6) resultTools.push(name)
					if (denialKind === '' && name !== '') {
						const verdict = denialIn(resultTextOf(node))
						if (verdict !== '') denialKind = verdict
					}
					if (node.isError === true) {
						toolErrorCount += 1
						if (toolErrorName === '' && name !== '') toolErrorName = name
					}
				} else if (kind === 'model-retry') retries += 1
				else if (kind === 'turn-max-tokens') truncated = true
				else if (kind === 'compaction') compactions += 1
				else if (kind === 'steering') steering += 1
				else if (kind === 'context') contexts += 1
				else if (kind === 'command') commands += 1
				else if (kind === 'unknown') unknowns += 1
			}
			const legacy = legacyOf(snapshot)
			const partialSource = (snapshot && snapshot.partial) ? snapshot.partial : (legacy ? legacy.partial : null)
			const partial = splitAssistantBlocks(partialSource ? partialSource.blocks : null)
			let calls = []
			if (snapshot && Array.isArray(snapshot.runningCalls)) calls = snapshot.runningCalls
			else if (legacy && Array.isArray(legacy.runningCalls)) calls = legacy.runningCalls
			const names = []
			let delegatingCalls = 0
			for (let i = 0; i < calls.length; i += 1) {
				const callItem = calls[i]
				if (!callItem || typeof callItem.name !== 'string') continue
				if (names.indexOf(callItem.name) < 0 && names.length < 4) names.push(callItem.name)
				if (DELEGATING_MOODS[TOOL_MOODS[callItem.name]] === true) delegatingCalls += 1
			}
			const queue = snapshot && Array.isArray(snapshot.queue) ? snapshot.queue.length : 0
			const lastError = snapshot && typeof snapshot.lastAgentError === 'string' ? snapshot.lastAgentError : ''
			const pending = pendingOf(snapshot)
			return {
				nodeCount: nodes.length,
				userId: clip(userRaw, 240),
				user: clip(userRaw, 110),
				asst: clip(asstRaw, 110),
				live: clip(partial.text, 110),
				reasoning: clip(partial.reasoning, 110),
				liveLen: partial.text.length,
				reasoningLen: partial.reasoning.length,
				running: !!(snapshot && snapshot.running),
				streaming: partial.text !== '' || partial.reasoning !== '',
				tools: names,
				toolCount: calls.length,
				delegatingCalls: delegatingCalls,
				queue: queue,
				error: clip(lastError !== '' ? lastError : turnError, 90),
				phase: snapshot && typeof snapshot.composerPhase === 'string' ? snapshot.composerPhase : '',
				blank: !!(snapshot && snapshot.blank),
				answered: asstRaw !== '',
				pendingKind: pending.kind,
				pendingTool: pending.tool,
				pendingCount: pending.count,
				toolErrorCount: toolErrorCount,
				toolErrorName: clip(toolErrorName, 24),
				denialKind: denialKind,
				resultTools: resultTools,
				retries: retries,
				truncated: truncated,
				compactions: compactions,
				steering: steering,
				contexts: contexts,
				commands: commands,
				unknowns: unknowns,
				sentiment: store.options.sentiment ? sentimentOf(clip(userRaw, 240).toLowerCase()) : '',
				selfDoubt: store.options.sentiment ? hasAny(asstRaw.toLowerCase(), SELF_DOUBT_WORDS) : false,
				// Raw length before clipping: `userId` is capped at 240 chars, so a paste
				// threshold could never be expressed against it.
				userLen: userRaw.length,
			}
		}

		function factsSignature(facts) {
			return [
				facts.nodeCount, facts.userId, facts.user, facts.asst, facts.live, facts.reasoning,
				facts.running ? '1' : '0', facts.streaming ? '1' : '0', facts.tools.join(','), facts.toolCount,
				facts.queue, facts.error, facts.phase, facts.blank ? '1' : '0', facts.answered ? '1' : '0',
				facts.pendingKind, facts.pendingTool, facts.pendingCount,
				facts.toolErrorCount, facts.toolErrorName, facts.retries, facts.truncated ? '1' : '0',
				facts.sentiment, facts.selfDoubt ? '1' : '0',
				facts.compactions, facts.steering, facts.contexts, facts.commands, facts.unknowns, facts.delegatingCalls,
				facts.liveLen, facts.reasoningLen, facts.userLen,
				facts.denialKind, facts.resultTools.join(','),
			].join(SEP)
		}

		function factsFromSignature(signature) {
			const parts = String(signature).split(SEP)
			const num = (value) => { const n = Number(value); return Number.isFinite(n) ? n : 0 }
			return {
				nodeCount: num(parts[0]), userId: parts[1] || '', user: parts[2] || '', asst: parts[3] || '',
				live: parts[4] || '', reasoning: parts[5] || '',
				running: parts[6] === '1', streaming: parts[7] === '1',
				tools: parts[8] ? parts[8].split(',').filter(Boolean) : [],
				toolCount: num(parts[9]), queue: num(parts[10]),
				error: parts[11] || '', phase: parts[12] || '',
				blank: parts[13] === '1', answered: parts[14] === '1',
				pendingKind: parts[15] || '', pendingTool: parts[16] || '', pendingCount: num(parts[17]),
				toolErrorCount: num(parts[18]), toolErrorName: parts[19] || '',
				denialKind: parts[33] || '',
				resultTools: parts[34] ? parts[34].split(',').filter(Boolean) : [],
				retries: num(parts[20]), truncated: parts[21] === '1',
				sentiment: parts[22] || '', selfDoubt: parts[23] === '1',
				compactions: num(parts[24]), steering: num(parts[25]), contexts: num(parts[26]),
				commands: num(parts[27]), unknowns: num(parts[28]), delegatingCalls: num(parts[29]),
				liveLen: num(parts[30]), reasoningLen: num(parts[31]), userLen: num(parts[32]),
				at: 0,
			}
		}

		function signatureOf(snapshot) { return factsSignature(buildFacts(snapshot)) }
		function draftOf(inputState) { return inputState && typeof inputState.draft === 'string' ? inputState.draft : '' }

		function toolMood(names) {
			for (let i = 0; i < names.length; i += 1) {
				const mood = TOOL_MOODS[names[i]]
				if (mood) return mood
			}
			return 'building'
		}

		function idleTier(idleMs) {
			if (idleMs > 300000) return 4
			if (idleMs > 150000) return 3
			if (idleMs > 60000) return 2
			if (idleMs > 20000) return 1
			return 0
		}

		/**
		 * Resolve the mood. `liveFresh` / `reasonFresh` say whether streamed text
		 * actually CHANGED within TALK_WINDOW: a stale accumulator must not keep
		 * the mouth moving.
		 */
		function deriveMood(facts, lastActivity, now, runningFor, liveFresh, reasonFresh) {
			if (!facts) return 'idle'
			if (facts.pendingKind === 'approval') return 'alerting'
			if (facts.pendingKind === 'question') return 'curious'
			if (facts.running) {
				const rare = rareThinkingMood(facts, runningFor, facts.delegatingCalls)
				if (rare) return rare
				if (facts.toolCount > 0) return toolMood(facts.tools)
				if (liveFresh) return facts.liveLen > TALK_MAX_CHARS ? 'composing' : 'talking'
				if (reasonFresh) return 'reasoning'
				return runningFor > 30000 ? 'straining' : 'pondering'
			}
			// A tool error is handled as the 8s `agitation` alarm in resolveMood, NOT as a
			// held mood: leaving it here made one failed call pin an angry face until the
			// error had scrolled out of the 14-node scan window, which could take minutes.
			if (facts.error !== '' || facts.retries > 0 || facts.truncated) return 'disappointed'
			if (facts.queue > 0) return 'curious'
			const idle = now - lastActivity
			if (idle > 180000) return 'sleepy'
			if (idle > 45000) return 'bored'
			if (idle > 25000) return 'yawning'
			if (facts.selfDoubt) return 'agitated'
			if (facts.answered) {
				if (facts.sentiment === 'correct') return 'confused'
				const answer = facts.asst.toLowerCase()
				if (hasAny(answer, NEG_WORDS)) return 'disappointed'
				if (hasAny(answer, CONF_WORDS)) return 'confused'
				if (hasAny(answer, POS_WORDS)) return 'happy'
				return 'idle'
			}
			if (facts.user !== '') {
				if (facts.sentiment === 'correct') return 'confused'
				if (facts.sentiment === 'confused' || facts.sentiment === 'ask') return 'curious'
				return 'idle'
			}
			return 'idle'
		}

		/**
		 * Rotating member of a thinking mood's variant pool. `shift` is the
		 * user-driven offset applied by a bubble reset, which is what lets a click
		 * land on a DIFFERENT variant instead of merely restarting the clock.
		 */
		function variantFor(mood, heldMs, seed, shift) {
			const pool = THINK_VARIANTS[mood]
			if (!pool || pool.length === 0) return null
			return pool[mod(seed + Math.floor(heldMs / VARIANT_PERIOD) + (shift || 0), pool.length)]
		}

		/** Highest-priority layer value: later layers win, null/undefined is skipped. */
		function layerPick(layers, key, fallback) {
			for (let i = layers.length - 1; i >= 0; i -= 1) {
				const value = layers[i][key]
				if (value !== undefined && value !== null) return value
			}
			return fallback
		}

		function ambientLevel(mood, heldMs) {
			const rush = MOOD_RUSH[mood] === undefined ? 1 : MOOD_RUSH[mood]
			const effective = heldMs * rush
			let level = 0
			for (let i = 0; i < LEVEL_AT.length; i += 1) if (effective >= LEVEL_AT[i]) level = i + 1
			return level
		}

		function ambientFx(mood, level, baseFx) {
			const out = []
			for (let i = 0; i < baseFx.length; i += 1) out.push(baseFx[i])
			const ladder = AMBIENT[mood]
			if (!ladder) return out
			for (let l = 0; l < level && l < ladder.length; l += 1) {
				const add = ladder[l]
				for (let k = 0; k < add.length; k += 1) if (out.indexOf(add[k]) < 0) out.push(add[k])
			}
			return out
		}

		function aimAt(mouse, cx, cy) {
			if (!mouse.seen) return { x: 0, y: 0 }
			const dx = mouse.x - cx
			const dy = mouse.y - cy
			const len = Math.sqrt(dx * dx + dy * dy) || 1
			const travel = Math.min(len / 150, 1) * 4.3
			return { x: (dx / len) * travel, y: (dy / len) * travel }
		}

		function pupilFor(look, mouse, cx, cy) {
			if (look === 'mouse') return aimAt(mouse, cx, cy)
			if (look === 'up') return { x: 0, y: -3.6 }
			if (look === 'down') return { x: 0, y: 3.4 }
			if (look === 'left') return { x: -4.2, y: 0.4 }
			if (look === 'right') return { x: 4.2, y: 0.4 }
			if (look === 'sweep') return { x: 0, y: -0.6 }
			if (look === 'dart') return { x: 0, y: -1.4 }
			if (look === 'updown') return { x: 0, y: -1.2 }
			return { x: 0, y: 0 }
		}

		const LOOK_CLASS = { sweep: 'dshcp-sweep', dart: 'dshcp-dart', updown: 'dshcp-updown' }

		function fix(value) { return Math.round(value * 100) / 100 }

		/**
		 * Continuous circle-to-rounded-rectangle head outline.
		 * @param rx - horizontal radius.
		 * @param ry - vertical radius.
		 * @param corner - 1 = fully round (ellipse), 0 = square-ish.
		 * @returns an SVG path centred on the head origin.
		 */
		function blobPath(rx, ry, corner) {
			const cx = HEAD_CX
			const cy = HEAD_CY
			const r = Math.min(Math.min(rx, ry), Math.max(0.5, Math.min(rx, ry) * corner))
			const k = r * 0.5523
			const left = fix(cx - rx)
			const right = fix(cx + rx)
			const top = fix(cy - ry)
			const bottom = fix(cy + ry)
			const inX = fix(cx - (rx - r))
			const outX = fix(cx + (rx - r))
			const inY = fix(cy - (ry - r))
			const outY = fix(cy + (ry - r))
			return [
				'M', inX, top, 'L', outX, top,
				'C', fix(cx + (rx - r) + k), top, right, fix(cy - (ry - r) - k), right, inY,
				'L', right, outY,
				'C', right, fix(cy + (ry - r) + k), fix(cx + (rx - r) + k), bottom, outX, bottom,
				'L', inX, bottom,
				'C', fix(cx - (rx - r) - k), bottom, left, fix(cy + (ry - r) + k), left, outY,
				'L', left, inY,
				'C', left, fix(cy - (ry - r) - k), fix(cx - (rx - r) - k), top, inX, top,
				'Z',
			].join(' ')
		}

		/**
		 * Brows as filled, tapered shapes: thick at the inner end, lifting to a fine outer
		 * tip. Drawn as a closed outline because a stroke of uniform width reads as a
		 * drawn line, not as hair - and per-side thickness asymmetry is what gives a face
		 * its attitude.
		 */
		function browFillPaths(v) {
			const baseY = 31 - v.browLift
			const leftOuter = baseY - v.browAsym
			const leftInner = baseY + v.browInner + v.browAsym * 0.55
			const rightOuter = baseY + v.browAsym
			const rightInner = baseY + v.browInner - v.browAsym * 0.55
			const shape = (outerX, innerX, outerY, innerY, dir) => {
				const midY = (outerY + innerY) / 2 - 1.6
				return 'M' + outerX + ' ' + fix(outerY - 0.9)
					+ ' Q' + fix((outerX + innerX) / 2) + ' ' + fix(midY - 2.1) + ' ' + innerX + ' ' + fix(innerY - 1.9)
					+ ' L' + innerX + ' ' + fix(innerY + 1.9)
					+ ' Q' + fix((outerX + innerX) / 2) + ' ' + fix(midY + 0.9) + ' ' + outerX + ' ' + fix(outerY + 0.9)
					+ ' Z'
			}
			return [
				shape(25, 42, leftOuter, leftInner, 1),
				shape(75, 58, rightOuter, rightInner, -1),
			]
		}

		function browPaths(v) {
			const baseY = 31 - v.browLift
			const leftOuter = baseY - v.browAsym
			const leftInner = baseY + v.browInner + v.browAsym * 0.55
			const rightOuter = baseY + v.browAsym
			const rightInner = baseY + v.browInner - v.browAsym * 0.55
			return [
				'M25 ' + fix(leftOuter) + ' Q33 ' + fix((leftOuter + leftInner) / 2 - 1.6) + ' 42 ' + fix(leftInner),
				'M58 ' + fix(rightInner) + ' Q67 ' + fix((rightOuter + rightInner) / 2 - 1.6) + ' 75 ' + fix(rightOuter),
			]
		}

		function mouthPath(v) {
			return 'M38 ' + fix(v.mouthLY) + ' C' + fix(v.mouthC1X) + ' ' + fix(v.mouthC1Y) + ' ' + fix(v.mouthC2X) + ' ' + fix(v.mouthC2Y) + ' 62 ' + fix(v.mouthRY)
		}

		function eyeArcPath(cx, cy, bend) {
			return 'M' + (cx - 9) + ' ' + fix(cy + 1) + ' Q' + cx + ' ' + fix(cy + 1 - bend) + ' ' + (cx + 9) + ' ' + fix(cy + 1)
		}

		/**
		 * A closed eyelid: a crescent that tapers to points at both corners, so it has MASS.
		 * Two curves through the same endpoints, offset by `thickness` at the apex.
		 */
		function closedLidPath(cx, cy, bend, thickness) {
			const tip = fix(cy + 1)
			return 'M' + (cx - 9) + ' ' + tip
				+ ' Q' + cx + ' ' + fix(cy + 1 - bend) + ' ' + (cx + 9) + ' ' + tip
				+ ' Q' + cx + ' ' + fix(cy + 1 - bend + thickness) + ' ' + (cx - 9) + ' ' + tip + ' Z'
		}

		/** The lash flick at the outer corner. `side` is +1 for the right eye, -1 for the left. */
		function lashPath(cx, cy, side) {
			return 'M' + fix(cx + side * 7.2) + ' ' + fix(cy - 0.2)
				+ ' l' + fix(side * 3.6) + ' ' + fix(-2.8)
		}

		const STAR_PATH = 'M0 -6.5 L1.7 -1.7 L6.5 0 L1.7 1.7 L0 6.5 L-1.7 1.7 L-6.5 0 L-1.7 -1.7 Z'
		const BIG_STAR_PATH = 'M0 -9 L2.4 -2.4 L9 0 L2.4 2.4 L0 9 L-2.4 2.4 L-9 0 L-2.4 -2.4 Z'
		const DROP_PATH = 'M0 -6 C3.2 -1.4 4.4 2 4.4 4.2 A4.4 4.4 0 1 1 -4.4 4.2 C-4.4 2 -3.2 -1.4 0 -6 Z'
		const HEART_PATH = 'M0 4.4 C-5 -1 -6.4 -6 -3 -7.4 C-1.2 -8 0 -6.5 0 -5.2 C0 -6.5 1.2 -8 3 -7.4 C6.4 -6 5 -1 0 4.4 Z'

		/**
		 * Particle field positions. Every one of these clears the head ellipse -
		 * see tools/check-fx.mjs, which checks each point, its whole travel path,
		 * and every angle of the rotating rings. A particle inside that ellipse
		 * lands ON the face and reads as a blemish rather than as light around it,
		 * which is why these live in the margin rather than over the middle.
		 */
		const STARDUST = [[30, 4], [96, 38], [20, 92], [68, 3], [8, 74], [97, 58], [40, 97], [88, 16], [12, 17], [60, 98], [4, 38], [48, 0]]
		const STARDUST_R = [1.4, 1.2, 1.5, 1.1, 1.3, 1.6, 1.2, 1.4, 1.1, 1.3, 1.5, 1.2]

		/**
		 * The lower-right street sign: a European warning triangle - triangular
		 * plate, white field, thick red border, dark symbol - on a short post.
		 *
		 * Geometry note: the apex sits at y71, just outside the head ellipse
		 * (metric 0.996), and the base runs y99, so the sign reads as mounted in
		 * front of the corner rather than poking into the face. That is why the
		 * triangle is 32 wide by 28 tall - near equilateral - instead of anything
		 * taller, which would put the apex over the cheek.
		 */
		function signNode(mood) {
			const sign = SIGN[mood]
			if (!sign) return null
			const cx = 88
			const apexY = 71
			const baseY = 99
			const hw = 16
			const wide = sign.glyph.length > 1
			const triangle = 'M' + cx + ' ' + apexY + ' L' + (cx + hw) + ' ' + baseY + ' L' + (cx - hw) + ' ' + baseY + ' Z'
			return React.createElement('g', { key: 'sign-' + mood }, [
				React.createElement('g', { key: 'anim', className: 'dshcp-sign' }, [
					React.createElement('rect', { key: 'post', x: cx - 1.75, y: baseY - 4, width: 3.5, height: 11, rx: 1.5, fill: '#b9c0cc' }),
					React.createElement('path', {
						key: 'plate', d: triangle, fill: '#ffffff', stroke: '#cc0605',
						strokeWidth: 5, strokeLinejoin: 'round',
					}),
					React.createElement('text', {
						key: 'glyph', x: cx, y: baseY - 4.5, textAnchor: 'middle',
						fontSize: wide ? 12 : 15, fontWeight: 800, fill: '#1a1a1a',
						fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
					}, sign.glyph),
				]),
			])
		}

		/**
		 * Build every effect field. Each particle takes its paint from FX_COLORS by
		 * index, never the mood tint, and the sparse fields add a soft self-coloured
		 * bloom so they read as light rather than as paint. Positions live in the
		 * margin around the head - see the STARDUST comment.
		 */
		function fxNodes(fx, tint) {
			const out = []
			for (let i = 0; i < fx.length; i += 1) {
				const kind = fx[i]
				if (kind === 'dots') {
					const positions = [[72, 11], [81, 6], [90, 1]]
					for (let d = 0; d < positions.length; d += 1) {
						const color = fxColor('dots', d, tint)
						out.push(React.createElement('circle', { key: 'dots' + d, cx: positions[d][0], cy: positions[d][1], r: 3, fill: color, className: 'dshcp-dot', style: { animationDelay: (d * 0.22) + 's', filter: fxGlow(color) } }))
					}
				} else if (kind === 'stardust') {
					for (let d = 0; d < STARDUST.length; d += 1) {
						const p = STARDUST[d]
						out.push(React.createElement('circle', { key: 'dust' + d, cx: p[0], cy: p[1], r: STARDUST_R[d] * 1.15, fill: fxColor('stardust', d, tint), className: 'dshcp-twinkle', style: { animationDelay: ((d * 0.37) % 3.2).toFixed(2) + 's' } }))
					}
				} else if (kind === 'stars') {
					const inner = []
					for (let d = 0; d < 3; d += 1) {
						const a = (d / 3) * Math.PI * 2
						const color = fxColor('stars', d, tint)
						inner.push(React.createElement('g', { key: 'st' + d, transform: 'translate(' + fix(HEAD_CX + Math.cos(a) * 54) + ',' + fix(HEAD_CY + Math.sin(a) * 54) + ')' }, [
							React.createElement('path', { key: 'p', d: BIG_STAR_PATH, fill: color, opacity: 0.9, className: 'dshcp-twinkle', style: { animationDelay: (d * 0.5) + 's', filter: fxGlow(color) } }),
						]))
					}
					out.push(React.createElement('g', { key: 'stars', className: 'dshcp-sloworbit' }, inner))
					const outer = []
					for (let d = 0; d < 2; d += 1) {
						const a = ((d + 0.5) / 2) * Math.PI * 2
						const color = fxColor('stars', d + 3, tint)
						outer.push(React.createElement('g', { key: 'st2' + d, transform: 'translate(' + fix(HEAD_CX + Math.cos(a) * 58) + ',' + fix(HEAD_CY + Math.sin(a) * 50) + ')' }, [
							React.createElement('path', { key: 'p', d: BIG_STAR_PATH, fill: color, opacity: 0.7, transform: 'scale(.7)', className: 'dshcp-twinkle', style: { animationDelay: (d * 0.8 + 0.3) + 's', filter: fxGlow(color) } }),
						]))
					}
					out.push(React.createElement('g', { key: 'stars2', className: 'dshcp-revorbit' }, outer))
				} else if (kind === 'bubbles') {
					const spots = [[8, 98], [92, 98], [4, 88], [96, 84]]
					for (let d = 0; d < spots.length; d += 1) {
						out.push(React.createElement('circle', { key: 'bub' + d, cx: spots[d][0], cy: spots[d][1], r: 2.0 + (d % 2) * 0.9, fill: 'none', stroke: fxColor('bubbles', d, tint), strokeWidth: 1.3, opacity: 0.85, className: 'dshcp-rise', style: { animationDelay: (d * 0.62) + 's' } }))
					}
				} else if (kind === 'embers') {
					const spots = [[3, 88], [3, 70], [97, 86], [97, 68], [7, 96], [93, 96]]
					for (let d = 0; d < spots.length; d += 1) {
						const color = fxColor('embers', d, tint)
						out.push(React.createElement('circle', { key: 'emb' + d, cx: spots[d][0], cy: spots[d][1], r: 1.6 + (d % 3) * 0.5, fill: color, className: 'dshcp-rise', style: { animationDelay: (d * 0.34) + 's', animationDuration: (2.1 + (d % 3) * 0.4) + 's', filter: fxGlow(color) } }))
					}
				} else if (kind === 'sparks') {
					const spots = [[13, 16], [86, 14], [50, 0]]
					for (let d = 0; d < spots.length; d += 1) {
						const x = spots[d][0]
						const y = spots[d][1]
						const color = fxColor('sparks', d, tint)
						out.push(React.createElement('path', { key: 'spk' + d, d: 'M' + x + ' ' + y + ' l4 -4 l-3 4 l5 1 l-4 4 l3 -4 z', fill: color, className: 'dshcp-flicker', style: { animationDelay: (d * 0.17) + 's', filter: fxGlow(color) } }))
					}
				} else if (kind === 'confetti') {
					const spots = [[4, 4], [8, 0], [14, 0], [86, 0], [92, 0], [96, 4]]
					for (let d = 0; d < spots.length; d += 1) {
						out.push(React.createElement('rect', { key: 'cf' + d, x: spots[d][0], y: spots[d][1], width: 2.8, height: 5.2, rx: 1, fill: fxColor('confetti', d, tint), className: 'dshcp-fall', style: { animationDelay: (d * 0.38) + 's' } }))
					}
				} else if (kind === 'codeflow') {
					const spots = [[2, 0], [6, 6], [10, 0], [90, 0], [94, 6], [98, 0]]
					for (let d = 0; d < spots.length; d += 1) {
						const color = fxColor('codeflow', d, tint)
						out.push(React.createElement('rect', { key: 'cf' + d, x: spots[d][0], y: spots[d][1], width: 1.8, height: 4.6, rx: 0.9, fill: color, opacity: 0.9, className: 'dshcp-fall', style: { animationDelay: (d * 0.29) + 's', animationDuration: (1.8 + (d % 3) * 0.35) + 's', filter: fxGlow(color) } }))
					}
				} else if (kind === 'halo') {
					const color = fxColor('halo', 0, tint)
					out.push(React.createElement('ellipse', { key: 'halo', cx: HEAD_CX, cy: 4, rx: 17, ry: 5, fill: 'none', stroke: color, strokeWidth: 2.8, opacity: 0.95, className: 'dshcp-halo', style: { filter: fxGlow(color) } }))
				} else if (kind === 'orbit') {
					const orbit = []
					for (let d = 0; d < 3; d += 1) {
						const angle = (d / 3) * Math.PI * 2
						const color = fxColor('orbit', d, tint)
						orbit.push(React.createElement('circle', { key: 'orb' + d, cx: fix(50 + Math.cos(angle) * 52), cy: fix(52 + Math.sin(angle) * 52), r: 3.6, fill: color, style: { filter: fxGlow(color) } }))
					}
					out.push(React.createElement('g', { key: 'orbit', className: 'dshcp-orbit' }, orbit))
				} else if (kind === 'swirl') {
					const swirl = []
					for (let d = 0; d < 4; d += 1) {
						const angle = (d / 4) * Math.PI * 2
						const color = fxColor('swirl', d, tint)
						swirl.push(React.createElement('circle', { key: 'sw' + d, cx: fix(HEAD_CX + Math.cos(angle) * 48), cy: fix(HEAD_CY + Math.sin(angle) * 46), r: 2.8, fill: color, opacity: 0.9, style: { filter: fxGlow(color) } }))
					}
					out.push(React.createElement('g', { key: 'swirl', className: 'dshcp-swirl' }, swirl))
				} else if (kind === 'sweat') {
					out.push(React.createElement('g', { key: 'sweat', transform: 'translate(97,12)' }, [
						React.createElement('path', { key: 'drop', d: DROP_PATH, fill: fxColor('sweat', 0, tint), className: 'dshcp-sweat' }),
					]))
				} else if (kind === 'steam') {
					out.push(React.createElement('g', { key: 'steamA', transform: 'translate(28,12)' }, [
						React.createElement('circle', { key: 'p', cx: 0, cy: 0, r: 5, fill: fxColor('steam', 0, tint), opacity: 0.6, className: 'dshcp-steam' }),
					]))
					out.push(React.createElement('g', { key: 'steamB', transform: 'translate(72,10)' }, [
						React.createElement('circle', { key: 'p', cx: 0, cy: 0, r: 6, fill: fxColor('steam', 1, tint), opacity: 0.55, className: 'dshcp-steam', style: { animationDelay: '.55s' } }),
					]))
				} else if (kind === 'sparkle') {
					const spots = [[10, 2], [90, 2], [10, 96], [90, 96]]
					for (let d = 0; d < spots.length; d += 1) {
						const color = fxColor('sparkle', d, tint)
						out.push(React.createElement('g', { key: 'spark' + d, transform: 'translate(' + spots[d][0] + ',' + spots[d][1] + ')' }, [
							React.createElement('path', { key: 's', d: STAR_PATH, fill: color, className: 'dshcp-sparkle', style: { animationDelay: (d * 0.27) + 's', filter: fxGlow(color) } }),
						]))
					}
				} else if (kind === 'hearts') {
					const spots = [[14, 14], [86, 14], [50, -4]]
					for (let d = 0; d < spots.length; d += 1) {
						const color = fxColor('hearts', d, tint)
						out.push(React.createElement('g', { key: 'heart' + d, transform: 'translate(' + spots[d][0] + ',' + spots[d][1] + ')' }, [
							React.createElement('path', { key: 'h', d: HEART_PATH, fill: color, className: 'dshcp-float', style: { animationDelay: (d * 0.42) + 's', filter: fxGlow(color) } }),
						]))
					}
				} else if (kind === 'zzz') {
					out.push(React.createElement('text', { key: 'zzz', x: 80, y: 4, fontSize: 13, fontWeight: 700, fill: fxColor('zzz', 0, tint), className: 'dshcp-zzz' }, 'z'))
					out.push(React.createElement('text', { key: 'zzz2', x: 89, y: -2, fontSize: 10, fontWeight: 700, fill: fxColor('zzz', 1, tint), className: 'dshcp-zzz', style: { animationDelay: '1.1s' } }, 'z'))
				}
			}
			return out
		}

		/**
		 * Resolve the speech bubble. Variant chatter is only a low-priority base:
		 * the informative lines (which tool is running, streamed answer text,
		 * pending approval) must still win, or a variant would mask what the agent
		 * is actually doing. Poke/action reactions outrank those in turn.
		 */
		function bubbleFor(mood, variantBubble, saying, pokeBubble, actionBubble, actionKind, facts, draft, typing, idle, reaction) {
			let bubble = MOODS[mood] ? MOODS[mood].bubble : ''
			if (variantBubble) bubble = variantBubble
			// Idle philosophy sits at the BASE of the stack, above the plain mood caption and
			// a variant line but below everything that carries information. A saying must never
			// displace a running tool, live text, an approval, an error, a draft or a poke -
			// it is filler, and filler that hides a signal is a bug.
			if (saying) bubble = saying
			if (facts && facts.running && facts.tools.length > 0) bubble = (TOOL_VERBS[mood] || 'Working with ') + facts.tools[0] + '...'
			if (mood === 'talking' && facts && facts.live !== '') bubble = clip(facts.live, 34)
			if (mood === 'alerting' && facts) bubble = facts.pendingTool ? 'Approve ' + facts.pendingTool + '?' : 'I need your approval'
			if (facts && facts.pendingKind === 'question') bubble = 'I need to ask you something'
			if (mood === 'agitated' && facts && facts.toolErrorName !== '') bubble = facts.toolErrorName + ' errored!'
			if (typing && draft) bubble = '"' + clip(draft, 26) + '"'
			if (actionKind === 'nudge') bubble = NUDGES[Math.floor(idle / 300000) % NUDGES.length]
			else if (pokeBubble) bubble = pokeBubble
			else if (actionBubble) bubble = actionBubble
			// What the companion says back about the human's DECISION. Last, because it is
			// the most specific thing happening and nothing should mask it.
			if (reaction && reaction.bubble) bubble = reaction.bubble
			return bubble
		}

		/**
		 * User-facing switches, one per feature someone might reasonably want gone.
		 *
		 * The defaults reproduce this plugin's behaviour exactly as it was before the switches
		 * existed, so upgrading changes nothing visible until someone opens
		 * Settings -> Plugins -> Companion.
		 *
		 * Stored as a SPARSE map merged over the defaults, never as a full snapshot, so a
		 * version that ADDS an option hands it its default instead of inheriting `undefined`
		 * from a seat saved by an older build.
		 */
		const OPTIONS_KEY = 'dsh.companion-face.options.v1'
		const OPTION_DEFS = [
			{ key: 'drag', group: 'Interaction', label: 'Move it around', hint: 'Drag anywhere, throw it, and let it fall and bounce.' },
			{ key: 'poke', group: 'Interaction', label: 'React to a click', hint: 'Click it for one of fifteen reactions.' },
			{ key: 'gestures', group: 'Interaction', label: 'Idle gestures', hint: 'Hops, yawns and shrugs while it waits.' },
			{ key: 'sway', group: 'Interaction', label: 'Idle sway', hint: 'The slow 5.2s breathing motion.' },
			{ key: 'wisdom', group: 'Interaction', label: 'Idle sayings', hint: 'A line of nonsense philosophy every 75s while nothing is happening.' },
			{ key: 'reactions', group: 'Responses', label: 'Answer your decisions', hint: 'A happy face when you grant an approval, calm when you refuse.' },
			{ key: 'sentiment', group: 'Responses', label: 'Read your mood', hint: 'Keyword heuristics: praise, corrections, questions, self-doubt.' },
			{ key: 'accessories', group: 'Responses', label: 'Accessories on praise', hint: 'Hats, glasses and headphones after kind words.' },
			{ key: 'blink', group: 'Appearance', label: 'Blinking', hint: 'Close the eyes every few seconds.' },
			{ key: 'effects', group: 'Appearance', label: 'Particle effects', hint: 'Stars, stardust, sparkles and the rest.' },
			{ key: 'drift', group: 'Appearance', label: 'Background objects', hint: 'Clocks, letters and flowers after a long wait.' },
			{ key: 'sign', group: 'Appearance', label: 'Street sign', hint: 'The warning triangle in the corner.' },
			{ key: 'aura', group: 'Appearance', label: 'Fading edge', hint: 'The mood colour fading outward from the face.' },
			{ key: 'colour', group: 'Appearance', label: 'Mood colours', hint: 'Off leaves it a neutral grey.' },
			{ key: 'bubble', group: 'Appearance', label: 'Speech balloon', hint: 'The little caption above the face.' },
			{ key: 'chip', group: 'Appearance', label: 'Header chip', hint: 'The mood chip in the session header.' },
		]

		function optionDefaults() {
			const out = {}
			for (let i = 0; i < OPTION_DEFS.length; i += 1) out[OPTION_DEFS[i].key] = true
			return out
		}

		function readOptions() {
			const out = optionDefaults()
			try {
				const raw = window.localStorage.getItem(OPTIONS_KEY)
				if (typeof raw !== 'string' || raw === '') return out
				const value = JSON.parse(raw)
				if (value && typeof value === 'object') {
					for (let i = 0; i < OPTION_DEFS.length; i += 1) {
						const key = OPTION_DEFS[i].key
						if (typeof value[key] === 'boolean') out[key] = value[key]
					}
				}
			} catch (error) { console.log('companion options not restored:', String(error && error.message ? error.message : error)) }
			return out
		}

		function persistOptions(options) {
			try { window.localStorage.setItem(OPTIONS_KEY, JSON.stringify(options)) } catch (error) { console.log('companion options not saved:', String(error && error.message ? error.message : error)) }
		}

		function clampPos(x, y, size) {
			const vw = window.innerWidth || 1280
			const vh = window.innerHeight || 800
			const spanX = vw - size - 6
			const spanY = vh - size - 6
			// A COLLAPSED RANGE MUST NOT PIN THE AXIS. `Math.min(Math.max(6, x), Math.max(6, span))`
			// looks harmless, but when the viewport is narrower than the face plus its margins,
			// `Math.max(6, span)` is 6 and the whole expression becomes the constant 6: the face
			// slams to the left edge and horizontal dragging stops working entirely while vertical
			// still does. That is precisely how it was reported - "I can move it only up-down".
			// With no room to move, hold the requested coordinate instead of collapsing it.
			return {
				x: spanX > 6 ? Math.min(Math.max(6, x), spanX) : x,
				y: spanY > 6 ? Math.min(Math.max(6, y), spanY) : y,
			}
		}

		function readSaved() {
			try {
				const raw = window.localStorage.getItem(POS_KEY)
				if (typeof raw !== 'string' || raw === '') return null
				const value = JSON.parse(raw)
				if (value && typeof value === 'object' && Number.isFinite(value.x) && Number.isFinite(value.y)) return { x: value.x, y: value.y, mini: value.mini === true }
			} catch (error) { console.log('[companion-face] seat not restored:', String(error && error.message ? error.message : error)) }
			return null
		}

		function persistSeat(x, y, mini) {
			try { window.localStorage.setItem(POS_KEY, JSON.stringify({ x: x, y: y, mini: mini })) } catch (error) { console.log('[companion-face] seat not saved:', String(error && error.message ? error.message : error)) }
		}

		const CSS = [
			'.dshcp-wrap{position:fixed;pointer-events:none;z-index:70;}',
			'.dshcp-bob{position:relative;pointer-events:none;animation:dshcp-bob 5.2s ease-in-out infinite;}',
			'.dshcp-hopwrap{position:relative;pointer-events:none;}',
			'.dshcp-moodwrap{position:relative;pointer-events:none;}',
			'.dshcp-morphwrap{position:relative;pointer-events:none;}',
			'.dshcp-hop{animation:dshcp-hop .7s cubic-bezier(.3,1.4,.5,1);}',
			'.dshcp-morph{animation:dshcp-morph .46s cubic-bezier(.3,1.4,.5,1);}',
			'.dshcp-bounce{animation:dshcp-bounce .85s cubic-bezier(.3,1.5,.5,1) infinite;}',
			'.dshcp-shake{animation:dshcp-shake .28s linear infinite;}',
			'.dshcp-tremble{animation:dshcp-tremble .15s linear infinite;}',
			'.dshcp-wobble{animation:dshcp-wobble .52s ease-in-out infinite;}',
			'.dshcp-squish{animation:dshcp-squish .95s cubic-bezier(.3,1.5,.5,1);}',
			'.dshcp-stretch{animation:dshcp-stretch .95s cubic-bezier(.3,1.5,.5,1);}',
			'.dshcp-spin{animation:dshcp-spin .95s cubic-bezier(.4,0,.2,1);}',
			'.dshcp-popout{animation:dshcp-popout .85s cubic-bezier(.3,1.6,.5,1);}',
			'.dshcp-sign{animation:dshcp-signpop .38s cubic-bezier(.3,1.5,.5,1);transform-box:fill-box;transform-origin:center;}',
			'.dshcp-acc{animation:dshcp-accpop .42s cubic-bezier(.3,1.5,.5,1);transform-box:fill-box;transform-origin:center;}',
			'.dshcp-accout{animation:dshcp-accout .38s ease-in forwards;}',
			'.dshcp-drift-layer{pointer-events:none;}',
			'.dshcp-drift{animation-iteration-count:infinite;animation-timing-function:ease-in-out;transform-box:fill-box;transform-origin:center;}',
			'.dshcp-drifta{animation-name:dshcp-drifta;animation-duration:21s;}',
			'.dshcp-driftb{animation-name:dshcp-driftb;animation-duration:27s;}',
			'.dshcp-driftc{animation-name:dshcp-driftc;animation-duration:33s;}',
			'.dshcp-face{pointer-events:auto;position:relative;cursor:grab;touch-action:none;transform-origin:50% 80%;will-change:transform;-webkit-user-select:none;user-select:none;transition:filter .2s ease;}',
			'.dshcp-face--pressing{cursor:grabbing;}',
			'.dshcp-face:hover{filter:drop-shadow(0 6px 16px rgba(0,0,0,.16));}',
			'.dshcp-svg{display:block;width:100%;height:100%;overflow:visible;}',
			'.dshcp-tint,.dshcp-brow,.dshcp-mouth,.dshcp-arc,.dshcp-eye{transition:fill .4s ease,stroke .4s ease,opacity .4s ease;}',
			// Declared AFTER the rule above so it wins at equal specificity. A 140ms blink
			// cannot survive a 400ms crossfade: the eye and the lid would both sit near 50%
			// opacity, which is the ghosted double image that read as dead.
			'.dshcp-blink{transition:none;}',
			'.dshcp-glowpulse{animation:dshcp-glowpulse 3.6s ease-in-out infinite;}',
			'.dshcp-sweep{animation:dshcp-sweep 2.8s ease-in-out infinite;}',
			'.dshcp-dart{animation:dshcp-dart .46s ease-in-out infinite;}',
			'.dshcp-updown{animation:dshcp-updown 2.1s ease-in-out infinite;}',
			'.dshcp-dot{animation:dshcp-dot 1.4s ease-in-out infinite;}',
			'.dshcp-twinkle{animation:dshcp-twinkle 2.6s ease-in-out infinite;transform-box:fill-box;transform-origin:center;}',
			'.dshcp-orbit{animation:dshcp-orbit 3.4s linear infinite;transform-box:fill-box;transform-origin:center;}',
			'.dshcp-sloworbit{animation:dshcp-orbit 11s linear infinite;transform-box:fill-box;transform-origin:center;}',
			'.dshcp-revorbit{animation:dshcp-revorbit 16s linear infinite;transform-box:fill-box;transform-origin:center;}',
			'.dshcp-swirl{animation:dshcp-swirl 1.1s linear infinite;transform-box:fill-box;transform-origin:center;}',
			'.dshcp-sparkle{animation:dshcp-sparkle 1.15s ease-out infinite;transform-box:fill-box;transform-origin:center;}',
			'.dshcp-float{animation:dshcp-float 1.7s ease-out infinite;transform-box:fill-box;transform-origin:center;}',
			'.dshcp-rise{animation:dshcp-rise 2.6s ease-out infinite;transform-box:fill-box;transform-origin:center;}',
			'.dshcp-fall{animation:dshcp-fall 2.2s linear infinite;transform-box:fill-box;transform-origin:center;}',
			'.dshcp-flicker{animation:dshcp-flicker .46s steps(2,end) infinite;transform-box:fill-box;transform-origin:center;}',
			'.dshcp-halo{animation:dshcp-halo 3.2s ease-in-out infinite;transform-box:fill-box;transform-origin:center;}',
			'.dshcp-sweat{animation:dshcp-sweat 1.5s ease-in infinite;}',
			'.dshcp-steam{animation:dshcp-steam 1.9s ease-out infinite;}',
			'.dshcp-zzz{animation:dshcp-zzz 2.6s ease-out infinite;}',
			'.dshcp-talk{animation:dshcp-talk .34s ease-in-out infinite;transform-box:fill-box;transform-origin:center;}',
			'.dshcp-pulse-fast{animation:dshcp-phyllo .7s ease-in-out infinite;}',
			'.dshcp-badge{animation:dshcp-badge 1.1s ease-in-out infinite;transform-box:fill-box;transform-origin:center;}',
			'.dshcp-bubble{position:absolute;left:50%;bottom:calc(100% + 10px);transform:translateX(-50%);max-width:230px;padding:5px 9px;border-radius:10px;background:var(--dsw-alias-bg-overlay,#fff);color:var(--dsw-alias-label-primary,#12141a);border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.1));font-size:11px;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:0 4px 14px rgba(0,0,0,.12);pointer-events:auto;cursor:pointer;transition:border-color .15s ease,box-shadow .15s ease;animation:dshcp-pop .3s ease-out;}',
			'.dshcp-bubble:hover{border-color:var(--dsw-alias-border-l2,rgba(0,0,0,.26));box-shadow:0 6px 18px rgba(0,0,0,.16);}',
			// Idle sayings wrap instead of clipping. Same box, narrower than the caption
			// maximum so a long line breaks into three centred rows rather than one wide bar.
			'.dshcp-bubble--saying{max-width:212px;white-space:normal;text-align:center;line-height:1.45;font-style:italic;}',
			'.dshcp-bubble:active{transform:translateX(-50%) scale(.96);}',
			'.dshcp-bubble:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4d6bfe);outline-offset:2px;}',
			'.dshcp-btn{position:absolute;top:-7px;right:-7px;width:20px;height:20px;display:flex;align-items:center;justify-content:center;padding:0;border-radius:50%;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.18));background:var(--dsw-alias-bg-overlay,#fff);color:var(--dsw-alias-label-secondary,#6b7280);font-size:13px;line-height:1;cursor:pointer;opacity:0;transition:opacity .16s ease;}',
			'.dshcp-face:hover .dshcp-btn{opacity:1;}',
			'.dshcp-btn:hover{color:var(--dsw-alias-label-primary,#12141a);}',
			'.dshcp-chip{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 9px;border-radius:999px;border:1px solid currentColor;background:transparent;font-size:11.5px;line-height:1;cursor:pointer;transition:color .4s ease,background .15s ease;}',
			'.dshcp-chip:hover{background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.045));}',
			'.dshcp-chip-dot{width:7px;height:7px;border-radius:50%;background:currentColor;flex:none;}',
			'.dshcp-chip-emoji{font-size:12px;line-height:1;}',
			'.dshcp-chip-rich{font-size:10px;opacity:.75;letter-spacing:.04em;}',
			'.dshcp-chip--rare{font-weight:600;}',
			'.dshcp-chip--alert{animation:dshcp-chipalert 1.4s ease-in-out infinite;}',
			'.dshcp-chip--hot{animation:dshcp-chipalert .7s ease-in-out infinite;}',
			'.dshcp-still{animation:none;}',
			'.dshcp-face--fixed{cursor:default;}',
			'.dshcp-opts{padding:2px;font-size:13px;color:var(--dsw-alias-label-primary,#12141a);}',
			'.dshcp-opts-lead{margin:0 0 14px;color:var(--dsw-alias-label-secondary,#6b7280);font-size:12px;line-height:1.5;}',
			'.dshcp-opts-group{margin:0 0 16px;}',
			'.dshcp-opts-head{margin:0 0 6px;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--dsw-alias-label-secondary,#6b7280);}',
			'.dshcp-opts-rows{display:flex;flex-direction:column;}',
			'.dshcp-opt{display:flex;align-items:flex-start;gap:9px;padding:7px 8px;border-radius:8px;cursor:pointer;}',
			'.dshcp-opt:hover{background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.045));}',
			'.dshcp-opt-box{flex:none;margin:2px 0 0;width:15px;height:15px;accent-color:var(--dsw-alias-brand-primary,#4d6bfe);cursor:pointer;}',
			'.dshcp-opt-text{display:flex;flex-direction:column;gap:1px;min-width:0;}',
			'.dshcp-opt-label{font-weight:500;}',
			'.dshcp-opt-hint{color:var(--dsw-alias-label-secondary,#6b7280);font-size:11.5px;line-height:1.4;}',
			'.dshcp-opts-foot{margin-top:4px;padding-top:12px;border-top:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.08));}',
			'.dshcp-opts-reset{font:inherit;padding:5px 11px;border-radius:8px;cursor:pointer;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.18));background:transparent;color:var(--dsw-alias-label-primary,#12141a);}',
			'.dshcp-opts-reset:hover{background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.045));}',
			'@keyframes dshcp-bob{0%,100%{transform:translateY(0) scale(1,1)}50%{transform:translateY(-4px) scale(1.025,.975)}}',
			'@keyframes dshcp-hop{0%{transform:translateY(0)}35%{transform:translateY(-13px)}70%{transform:translateY(0)}84%{transform:translateY(-4px)}100%{transform:translateY(0)}}',
			'@keyframes dshcp-morph{0%{transform:scale(1,1)}32%{transform:scale(1.08,.92)}64%{transform:scale(.96,1.05)}100%{transform:scale(1,1)}}',
			'@keyframes dshcp-bounce{0%{transform:translateY(0)}30%{transform:translateY(-9px)}55%{transform:translateY(0)}72%{transform:translateY(-3.5px)}100%{transform:translateY(0)}}',
			'@keyframes dshcp-shake{0%,100%{transform:translateX(0) rotate(0)}25%{transform:translateX(-2.6px) rotate(-1.6deg)}75%{transform:translateX(2.6px) rotate(1.6deg)}}',
			'@keyframes dshcp-tremble{0%,100%{transform:translate(0,0)}25%{transform:translate(-1.5px,.7px)}50%{transform:translate(1.3px,-.9px)}75%{transform:translate(-.9px,-.6px)}}',
			'@keyframes dshcp-wobble{0%,100%{transform:rotate(-5deg) translateX(-2px)}50%{transform:rotate(5deg) translateX(2px)}}',
			'@keyframes dshcp-squish{0%{transform:scale(1,1)}25%{transform:scale(1.28,.72)}55%{transform:scale(.94,1.06)}100%{transform:scale(1,1)}}',
			'@keyframes dshcp-stretch{0%{transform:scale(1,1)}25%{transform:scale(.78,1.28)}55%{transform:scale(1.06,.95)}100%{transform:scale(1,1)}}',
			'@keyframes dshcp-spin{0%{transform:rotate(0deg) scale(1)}50%{transform:rotate(190deg) scale(1.08)}100%{transform:rotate(360deg) scale(1)}}',
			'@keyframes dshcp-popout{0%{transform:scale(1)}30%{transform:scale(1.3) rotate(-4deg)}60%{transform:scale(.96) rotate(2deg)}100%{transform:scale(1) rotate(0deg)}}',
			'@keyframes dshcp-signpop{0%{opacity:0;transform:scale(.55) rotate(-13deg)}60%{opacity:1;transform:scale(1.07) rotate(2deg)}100%{opacity:1;transform:scale(1) rotate(0deg)}}',
			'@keyframes dshcp-accpop{0%{opacity:0;transform:scale(.72) translateY(-4px)}62%{opacity:1;transform:scale(1.06) translateY(0)}100%{opacity:1;transform:scale(1) translateY(0)}}',
			'@keyframes dshcp-accout{0%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(.86) translateY(3px)}}',
			'@keyframes dshcp-drifta{0%,100%{opacity:0;transform:translate(0,7px) rotate(-4deg)}25%,72%{opacity:1}50%{opacity:.8;transform:translate(2.5px,-9px) rotate(5deg)}}',
			'@keyframes dshcp-driftb{0%,100%{opacity:0;transform:translate(0,-6px) rotate(5deg)}30%,70%{opacity:1}52%{opacity:.75;transform:translate(-3px,8px) rotate(-6deg)}}',
			'@keyframes dshcp-driftc{0%,100%{opacity:0;transform:translate(0,0) rotate(-7deg)}40%,80%{opacity:1}60%{opacity:.7;transform:translate(4px,5px) rotate(8deg)}}',
			'@keyframes dshcp-sweep{0%,100%{transform:translateX(-4px)}50%{transform:translateX(4px)}}',
			'@keyframes dshcp-dart{0%,100%{transform:translateX(-3.4px)}50%{transform:translateX(3.4px)}}',
			'@keyframes dshcp-updown{0%,100%{transform:translateY(-2.6px)}50%{transform:translateY(1.4px)}}',
			'@keyframes dshcp-dot{0%,100%{opacity:.25;transform:translateY(0)}50%{opacity:1;transform:translateY(-3px)}}',
			'@keyframes dshcp-twinkle{0%,100%{opacity:.12;transform:scale(.65)}50%{opacity:1;transform:scale(1.2)}}',
			'@keyframes dshcp-rise{0%{opacity:0;transform:translateY(5px) scale(.6)}25%{opacity:.85}100%{opacity:0;transform:translateY(-24px) scale(1.15)}}',
			'@keyframes dshcp-fall{0%{opacity:0;transform:translateY(-12px) rotate(0deg)}20%{opacity:1}100%{opacity:0;transform:translateY(22px) rotate(220deg)}}',
			'@keyframes dshcp-flicker{0%,45%{opacity:0}50%,95%{opacity:.95}100%{opacity:0}}',
			'@keyframes dshcp-halo{0%,100%{transform:translateY(0) scaleX(1);opacity:.85}50%{transform:translateY(-2px) scaleX(1.08);opacity:1}}',
			'@keyframes dshcp-orbit{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}',
			'@keyframes dshcp-revorbit{from{transform:rotate(360deg)}to{transform:rotate(0deg)}}',
			'@keyframes dshcp-swirl{from{transform:rotate(0deg)}to{transform:rotate(-360deg)}}',
			'@keyframes dshcp-sparkle{0%{opacity:0;transform:scale(.35) rotate(0deg)}40%{opacity:1;transform:scale(1.15) rotate(45deg)}100%{opacity:0;transform:scale(.5) rotate(90deg)}}',
			'@keyframes dshcp-float{0%{opacity:0;transform:translateY(4px) scale(.6)}30%{opacity:1}100%{opacity:0;transform:translateY(-17px) scale(1.1)}}',
			'@keyframes dshcp-sweat{0%{opacity:0;transform:translateY(-3px)}25%{opacity:1}100%{opacity:0;transform:translateY(13px)}}',
			'@keyframes dshcp-steam{0%{opacity:0;transform:translateY(3px) scale(.7)}30%{opacity:.7}100%{opacity:0;transform:translateY(-13px) scale(1.2)}}',
			'@keyframes dshcp-zzz{0%{opacity:0;transform:translate(0,0) scale(.7)}35%{opacity:.9}100%{opacity:0;transform:translate(7px,-16px) scale(1.15)}}',
			'@keyframes dshcp-talk{0%,100%{transform:scaleY(.55)}50%{transform:scaleY(1.22)}}',
			'@keyframes dshcp-phyllo{0%,100%{opacity:.2}50%{opacity:.45}}',
			'@keyframes dshcp-glowpulse{0%,100%{opacity:.6}50%{opacity:1}}',
			'@keyframes dshcp-badge{0%,100%{transform:scale(1);opacity:.85}50%{transform:scale(1.18);opacity:1}}',
			'@keyframes dshcp-chipalert{0%,100%{opacity:1}50%{opacity:.55}}',
			'@keyframes dshcp-pop{0%{transform:translateX(-50%) scale(.85);opacity:0}100%{transform:translateX(-50%) scale(1);opacity:.97}}',
			'@media (prefers-reduced-motion: reduce){.dshcp-bob,.dshcp-acc,.dshcp-drift,.dshcp-hop,.dshcp-morph,.dshcp-bounce,.dshcp-shake,.dshcp-tremble,.dshcp-wobble,.dshcp-squish,.dshcp-stretch,.dshcp-spin,.dshcp-popout,.dshcp-sign,.dshcp-sweep,.dshcp-dart,.dshcp-updown,.dshcp-dot,.dshcp-twinkle,.dshcp-orbit,.dshcp-sloworbit,.dshcp-revorbit,.dshcp-swirl,.dshcp-sparkle,.dshcp-float,.dshcp-rise,.dshcp-fall,.dshcp-flicker,.dshcp-halo,.dshcp-sweat,.dshcp-steam,.dshcp-zzz,.dshcp-talk,.dshcp-glowpulse,.dshcp-badge,.dshcp-chip--alert,.dshcp-chip--hot{animation:none;}}',
		].join(' ')

		const CSS_TAG_ID = 'dsh-companion-face/companion.css'

		/** Install this package's stylesheet once, the way every shipped client bundle does. */
		function installStyles() {
			if (typeof document === 'undefined') return
			if (document.querySelector('style[data-plugin-css=' + JSON.stringify(CSS_TAG_ID) + ']') !== null) return
			const tag = document.createElement('style')
			tag.dataset.plugin = 'dsh-companion-face'
			tag.dataset.pluginCss = CSS_TAG_ID
			tag.textContent = CSS
			document.head.appendChild(tag)
		}

		const RARE_MOODS = ['reminiscing', 'realigning', 'receiving', 'baffled', 'commanding', 'juggling', 'deepDive', 'overflowing', 'archivist', 'firstContact', 'recovering', 'conducting']

		const saved = readSaved()
		const initialMini = !!(saved && saved.mini)
		const initialSize = initialMini ? FACE_MINI : FACE_MAX

		const store = {
			facts: null, draft: '', draftAt: 0, revision: 0, poke: null, alarm: null, accessory: null,
			runningSince: 0, mood: '', moodSince: 0, variantSeed: 0, variantShift: 0, resetEpoch: 0,
			liveAt: 0, reasoningAt: 0,
			// The open question the human owes an answer to (an approval or an ask), and the
			// reaction owed back to them once they give it.
			ask: null, reaction: null,
			options: readOptions(),
			scheduleBump: null, mini: initialMini,
			motion: { lift: 0, vy: 0, vx: 0, squash: 0, swing: 0, active: false },
			pos: clampPos(saved ? saved.x : (window.innerWidth || 1280) - initialSize - 30, saved ? saved.y : (window.innerHeight || 800) - initialSize - 110, initialSize),
			listeners: new Set(),
		}

		function bump() {
			store.revision += 1
			const all = Array.from(store.listeners)
			for (let i = 0; i < all.length; i += 1) {
				try { all[i]() } catch (error) { console.error('[companion-face] listener failed', String(error && error.message ? error.message : error)) }
			}
		}

		/** Record the held mood and seed its variant rotation, so re-entry looks different. */
		function noteMood(mood) {
			if (store.mood === mood) return
			store.mood = mood
			store.moodSince = Date.now()
			store.variantSeed = Math.floor(Math.random() * 997)
			store.variantShift = 0
		}

		function raiseAlarm(kind, ms) {
			store.alarm = { kind: kind, until: Date.now() + ms }
			if (store.scheduleBump) store.scheduleBump(ms + 60)
		}

		/**
		 * Play one transient reaction, then fall back to whatever state holds.
		 * @param kind - key into ACTIONS.
		 */
		function triggerPoke(kind) {
			const known = Object.prototype.hasOwnProperty.call(ACTIONS, kind)
			const spec = known ? ACTIONS[kind] : ACTIONS.startle
			const at = Date.now()
			store.poke = { kind: known ? kind : 'startle', until: at + spec.ms, at: at }
			if (store.scheduleBump) store.scheduleBump(spec.ms + 60)
			bump()
		}

		function randomPoke() { return POKE_POOL[Math.floor(Math.random() * POKE_POOL.length)] }

		/**
		 * Put an accessory on for a while, in response to praise.
		 *
		 * The pick never repeats the piece already being worn, so two compliments in a
		 * row always look different - otherwise a random pick would repeat about 1 time
		 * in 12 and the second compliment would look like nothing happened.
		 */
		function wearAccessory(ms) {
			if (!store.options.accessories) return
			let kind = ACCESSORIES[Math.floor(Math.random() * ACCESSORIES.length)]
			if (store.accessory && store.accessory.kind === kind) {
				kind = ACCESSORIES[(ACCESSORIES.indexOf(kind) + 1) % ACCESSORIES.length]
			}
			store.accessory = { kind: kind, until: Date.now() + ms }
			if (store.scheduleBump) {
				store.scheduleBump(ms + 80)          // re-render when it comes off
				if (ms > 600) store.scheduleBump(ms - 420)  // and again for the exit animation
			}
			bump()
		}

		/**
		 * Move to the NEXT variant of the current mood's pool and restart the held
		 * clock. Used by a bubble reset.
		 *
		 * The new index is computed as an absolute shift from the index on screen RIGHT
		 * NOW: bumping a counter would be wrong, because the index also advances with
		 * the held clock, so +1 at exactly one period in would land back on the same
		 * variant and the click would look inert.
		 */
		function advanceVariant() {
			const pool = THINK_VARIANTS[store.mood]
			const len = pool ? pool.length : 0
			const now = Date.now()
			if (len < 2) { store.moodSince = now; return false }
			const current = mod(store.variantSeed + Math.floor((now - store.moodSince) / VARIANT_PERIOD) + store.variantShift, len)
			store.moodSince = now
			store.variantShift = mod(current + 1 - store.variantSeed, len)
			return true
		}

		/**
		 * Reset everything the user can see, from a click on the speech bubble:
		 * restart the held clock so ambient richness begins again, drop any transient
		 * reaction or alarm so the companion returns to its mood, re-arm the idle
		 * scheduler, and rotate to the NEXT variant when the pool has more than one.
		 */
		function resetFromBubble() {
			advanceVariant()
			store.poke = null
			store.alarm = null
			store.resetEpoch += 1
			bump()
		}

		/** Lift the face as if picked up: it floats, casting a shadow on the ground. */
		function liftFace() {
			const m = store.motion
			m.lift = DRAG_LIFT
			m.vy = 0
			m.vx = 0
			m.squash = 0
			m.active = false
			bump()
		}

		/**
		 * Release the face into the integrator: it falls, lands on the resting spot,
		 * and bounces. Velocities come from the drag so a flick throws it.
		 * @param throwX - horizontal drag velocity in px/s (positive = rightward).
		 * @param throwY - vertical drag velocity in px/s (positive = downward).
		 */
		function dropFace(throwX, throwY) {
			const m = store.motion
			m.lift = DRAG_LIFT
			m.vy = clamp(-(throwY || 0) * THROW_FACTOR, -420, 240)
			m.vx = clamp((throwX || 0) * THROW_FACTOR, -MAX_THROW, MAX_THROW)
			m.squash = 0
			m.active = true
			bump()
		}

		function publish(facts) {
			const previous = store.facts
			const now = Date.now()
			store.facts = facts
			if (facts.running) { if (!store.runningSince) store.runningSince = Date.now() }
			else store.runningSince = 0
			// Stream freshness: record when each streamed channel last CHANGED. A
			// stale accumulator must not keep the mouth moving.
			if (!previous || previous.live !== facts.live) store.liveAt = now
			if (!previous || previous.reasoning !== facts.reasoning) store.reasoningAt = now
			const newUser = !!(previous && facts.userId !== '' && previous.userId !== facts.userId)

			/*
			 * THE USER'S ANSWERS, not the user's words.
			 *
			 * Until now the companion only ever reacted to what the user TYPED, so the two
			 * moments that most deserve an answer - granting an approval and answering a
			 * question - went unnoticed. It asked for permission with an alert face, the
			 * human said yes, and the face simply went back to work.
			 *
			 * An approval outcome is not a node of its own, so it is read from what the
			 * decision leaves behind:
			 *   granted     -> the tool RUNS, so its name appears among the recent results
			 *                  once the prompt clears. Absence of a denial plus a result.
			 *   rejected    -> the tool runtime denies it with 'the user rejected tool "X"'
			 *   cancelled   -> 'approval for tool "X" was cancelled'
			 *   unavailable -> 'requires approval (not yet supported)' - not the user's doing,
			 *                  so it is an error, not a refusal, and stays agitation.
			 *
			 * `store.ask` holds the question while it is open, because the outcome arrives
			 * one or more steps AFTER the prompt disappears.
			 */
			const asking = facts.pendingKind === 'approval'
			// With reactions off the question is not tracked at all, so nothing can fire later
			// when it is switched back on.
			if (!store.options.reactions) store.ask = null
			else if (asking) {
				// `done` is part of the guard, not just the tool name. Keyed on the name alone,
				// a SECOND prompt for the same tool found the previous ask still in the store,
				// considered it current, and the stale `done` flag swallowed the reaction - so
				// the second time you granted the same command the face said nothing. Every
				// prompt raises a new ask.
				if (!store.ask || store.ask.done || store.ask.tool !== facts.pendingTool) {
					store.ask = { tool: facts.pendingTool, at: now, kind: 'approval' }
				}
			} else if (facts.pendingKind === 'question') {
				if (!store.ask || store.ask.done || store.ask.kind !== 'question') store.ask = { tool: '', at: now, kind: 'question' }
			} else if (store.ask && !store.ask.done) {
				const ask = store.ask
				if (probe) console.log('PROBE ask=' + JSON.stringify(ask) + ' nodeCount=' + facts.nodeCount + ' denial=' + facts.denialKind + ' results=[' + facts.resultTools.join('/') + '] pending=' + facts.pendingKind + ' toolCount=' + facts.toolCount)
				if (ask.kind === 'question') {
					if (newUser) { ask.done = true; reaction('glad', 'Thanks - that helps.', 4200) }
					else if (now - ask.at > 120000) ask.done = true
				} else if (facts.denialKind === 'rejected') {
					ask.done = true
					reaction('denied', 'No problem - I will leave it.', 4200)
				} else if (facts.denialKind === 'cancelled') {
					ask.done = true
					reaction('surprise', 'Oh - cancelled.', 2600)
				} else if (facts.denialKind === 'unavailable') {
					ask.done = true
					raiseAlarm('agitation', 5000)
				} else if (ask.tool !== '' && facts.resultTools.indexOf(ask.tool) >= 0) {
					// Nothing refused it and it produced a result: the human said yes.
					ask.done = true
					reaction('delight', 'Thank you! On it.', 5200)
				} else if (now - ask.at > 120000) {
					ask.done = true
				}
			}

			if (previous) {
				const worseTool = facts.toolErrorCount > previous.toolErrorCount
				const newError = facts.error !== '' && facts.error !== previous.error
				const newRetry = facts.retries > previous.retries
				const newTruncation = facts.truncated && !previous.truncated
				const answered = !!(store.reaction && store.reaction.until > now)
				if (newUser && facts.sentiment === 'correct') raiseAlarm('panic', 6500)
				else if (newUser && facts.sentiment === 'praise') { raiseAlarm('delight', 6500); wearAccessory(ACCESSORY_MS) }
				// A very large message is the one detectable unexpected event: the user
				// dropped something big on the companion. Kept LAST so it never masks
				// panic, delight or agitation.
				else if (newUser && facts.userLen > PASTE_CHARS) raiseAlarm('surprise', 2600)
				// An AGITATION from a tool error must not stomp the answer the human just
				// gave: if they granted something and the very next tool fails, the
				// reaction they earned still wins for its duration.
				if ((worseTool || newError || newRetry || newTruncation) && !answered) raiseAlarm('agitation', 8000)
			}
			if (newUser) triggerPoke('startle')
			bump()
		}

		/**
		 * Answer a user ACTION. Sets the mood through the alarm channel and leaves a line in
		 * the balloon, so the reaction is legible rather than just a colour change.
		 */
		function reaction(kind, bubble, ms) {
			raiseAlarm(kind, ms)
			store.reaction = { kind: kind, bubble: bubble, until: Date.now() + ms }
		}

		function publishDraft(draft) {
			if (store.draft === draft) return
			store.draft = draft
			store.draftAt = Date.now()
			bump()
		}

		function toggleMini() {
			const nextSize = store.mini ? FACE_MAX : FACE_MINI
			store.mini = !store.mini
			store.pos = clampPos(store.pos.x, store.pos.y, nextSize)
			persistSeat(store.pos.x, store.pos.y, store.mini)
			bump()
		}

		/** Replace the options object rather than mutating it, so nothing can miss the change. */
		function setOption(key, on) {
			const next = Object.assign({}, store.options)
			next[key] = on
			store.options = next
			persistOptions(next)
			bump()
		}

		function resetOptions() {
			store.options = optionDefaults()
			persistOptions(store.options)
			bump()
		}

		function useStore() {
			const state = React.useState(0)
			const force = state[1]
			React.useEffect(() => {
				const listener = () => force((n) => n + 1)
				store.listeners.add(listener)
				return () => { store.listeners.delete(listener) }
			}, [])
			return store
		}

		/**
		 * Mount the companion: the draggable face in the frame-wide overlay layer,
		 * plus the mood chip in the session header that feeds it conversation state.
		 * The overlay layer is root-scoped and carries no session props, so the chip
		 * is what bridges live per-session data into the face.
		 * @param ctx - this plugin's cordis context.
		 */
		function apply(ctx) {
			installStyles()
			store.scheduleBump = (ms) => ctx.timeout(() => bump(), ms)

			/** Resolve the mood from the shared store; the single source for face and chip. */
			function resolveMood(snap, now) {
				const facts = snap.facts
				const lastActivity = Math.max(facts ? facts.at : 0, snap.draftAt, snap.poke ? snap.poke.at : 0)
				const typing = snap.draft !== '' && now - snap.draftAt < 1600
				const runningFor = snap.runningSince ? now - snap.runningSince : 0
				const alarmKind = snap.alarm && snap.alarm.until > now ? snap.alarm.kind : null
				// Freshness gates: text that has not changed recently is not speech.
				const liveFresh = !!(facts && facts.live !== '' && now - store.liveAt < TALK_WINDOW)
				const reasonFresh = !!(facts && facts.reasoning !== '' && now - store.reasoningAt < TALK_WINDOW)
				// An ANSWER the human gave outranks the open prompt: for one beat after they
				// grant or refuse, the reaction must win, or the cleared prompt would snap
				// the face straight back to work and the answer would go unacknowledged.
				const reacting = snap.reaction && snap.reaction.until > now ? snap.reaction : null
				if (alarmKind === 'panic') return 'panicking'
				if (alarmKind === 'delight') return 'delighted'
				if (alarmKind === 'glad') return 'happy'
				if (alarmKind === 'denied') return 'disappointed'
				if (alarmKind === 'agitation') return 'agitated'
				if (alarmKind === 'surprise') return 'surprised'
				if (facts && facts.pendingKind === 'approval') return 'alerting'
				if (facts && facts.pendingKind === 'question') return 'curious'
				if (reacting) return 'happy'
				if (typing) return 'listening'
				return deriveMood(facts, lastActivity, now, runningFor, liveFresh, reasonFresh)
			}

			function CompanionFace() {
				const snap = useStore()
				const mouseState = React.useState({ x: 0, y: 0, seen: false })
				const mouse = mouseState[0]
				const setMouse = mouseState[1]
				const pressState = React.useState(false)
				const pressing = pressState[0]
				const setPressing = pressState[1]
				const tickState = React.useState(0)
				const tick = tickState[0]
				const setTick = tickState[1]
				const actionState = React.useState(null)
				const action = actionState[0]
				const setAction = actionState[1]
				const morphState = React.useState(false)
				const morphOn = morphState[0]
				const setMorphOn = morphState[1]
				const drag = React.useRef(null)
				const animRef = React.useRef(null)
				const frameRef = React.useRef(0)
				const animForce = React.useState(0)
				const forceAnim = animForce[1]
				const prevMoodRef = React.useRef(null)

				const size = snap.mini ? FACE_MINI : FACE_MAX
				const pos = snap.pos
				const motion = snap.motion
				const now = React.useMemo(() => Date.now(), [tick, snap.revision, snap.poke, snap.draftAt, snap.alarm])
				const lastActivity = Math.max(snap.facts ? snap.facts.at : 0, snap.draftAt, snap.poke ? snap.poke.at : 0)
				const idle = now - lastActivity
				const typing = snap.draft !== '' && now - snap.draftAt < 1600
				const pokeActive = !!(snap.poke && snap.poke.until > now)
				// The reaction owed to the human for the decision they just made. Lives here as
				// well as inside resolveMood because the balloon needs the same window.
				const reacting = snap.reaction && snap.reaction.until > now ? snap.reaction : null
				const pokeKind = pokeActive ? snap.poke.kind : null
				const pokeSpec = pokeKind ? (ACTIONS[pokeKind] || null) : null
				const mood = React.useMemo(() => resolveMood(snap, now), [snap.facts, snap.draftAt, snap.draft, snap.alarm, snap.runningSince, now])
				const actionKind = action ? action.kind : null
				const actionSpec = actionKind ? (ACTIONS[actionKind] || null) : null

				if (snap.mood !== mood) noteMood(mood)
				const heldMs = snap.moodSince ? now - snap.moodSince : 0

				// Repetition fatigue. Derived from the held clock, never scheduled, so the
				// blink is deterministic - and the TRUE mood does not change, because a
				// mood change here would tear down the timers mid-blink. `displayMood` is
				// what the face shows; the chip keeps reporting the real mood.
				const boreEvery = boreInterval(mood)
				const blinks = Math.floor(heldMs / boreEvery)
				// The blink sits at the END of each cycle, never at the start: entering a
				// mood IS heldMs 0, so a "phase < BORE_BLINK" test would make every mood
				// blink the instant it appeared and the companion would never be seen.
				const bored = !BORE_EXEMPT[mood] && mod(heldMs, boreEvery) >= boreEvery - BORE_BLINK
				const displayMood = bored ? 'idle' : mood
				const pool = THINK_VARIANTS[mood]
				const poolless = !(pool && pool.length > 0)

				const spec = MOODS[displayMood] || MOODS.idle
				const level = bored ? 0 : ambientLevel(mood, heldMs)
				const glowBase = LEVEL_GLOW[level] || 0
				// Each blink adds one tick to the rotation, which is what makes the return
				// a DIFFERENT variant rather than the same one again.
				const variant = bored ? null : variantFor(mood, heldMs + blinks * VARIANT_PERIOD, snap.variantSeed, snap.variantShift)

				const layers = []
				if (!bored && poolless && !BORE_EXEMPT[mood]) layers.push(BORE_POSE[mod(blinks, BORE_POSE.length)])
				if (variant) layers.push(variant)
				if (actionSpec) layers.push(actionSpec)
				if (pokeSpec) layers.push(pokeSpec)
				// An action carrying `fx: []` means "add no field of my own", NOT "clear the
				// mood's field". The original `[] || spec.fx` was wrong because an empty
				// array is TRUTHY in JavaScript: several idle gestures (peek, wobble,
				// squish, spin, blush, melt, shrink, startle) declare `fx: []`, and each one
				// silently wiped every particle the mood was showing. Test the length.
				const fxOverride = layerPick(layers, 'fx', null)
				const baseFx = fxOverride && fxOverride.length > 0 ? fxOverride : spec.fx
				const fxList = React.useMemo(() => ambientFx(displayMood, level, baseFx), [displayMood, level, baseFx])

				const targetVec = React.useMemo(() => {
					let out = spec.vec
					for (let i = 0; i < layers.length; i += 1) {
						if (layers[i].vec) out = vec(Object.assign({}, out, layers[i].vec))
					}
					return out
				}, [displayMood, variant, actionKind, pokeKind, bored, blinks])
				const targetKey = React.useMemo(() => {
					const parts = []
					for (let i = 0; i < VEC_KEYS.length; i += 1) parts.push(fix(targetVec[VEC_KEYS[i]]))
					return parts.join(',')
				}, [targetVec])

				if (animRef.current === null) animRef.current = targetVec

				React.useEffect(() => {
					let frame = 0
					let pending = null
					const flush = () => { frame = 0; if (pending) setMouse({ x: pending.x, y: pending.y, seen: true }) }
					const onMove = (event) => {
						pending = { x: event.clientX, y: event.clientY }
						if (frame !== 0) return
						frame = window.requestAnimationFrame(flush)
					}
					window.addEventListener('pointermove', onMove, { passive: true })
					return () => {
						window.removeEventListener('pointermove', onMove)
						if (frame !== 0) window.cancelAnimationFrame(frame)
					}
				}, [])

				React.useEffect(() => {
					const onResize = () => { store.pos = clampPos(store.pos.x, store.pos.y, size); bump() }
					window.addEventListener('resize', onResize)
					return () => window.removeEventListener('resize', onResize)
				}, [size])

				React.useEffect(() => ctx.interval(() => setTick((n) => n + 1), 2000), [])

				React.useEffect(() => {
					window.cancelAnimationFrame(frameRef.current)
					let last = 0
					const step = (time) => {
						const dt = last === 0 ? 0.016 : Math.min((time - last) / 1000, 0.05)
						last = time
						const current = animRef.current || targetVec
						const next = {}
						let settled = true
						for (let i = 0; i < VEC_KEYS.length; i += 1) {
							const key = VEC_KEYS[i]
							const delta = targetVec[key] - current[key]
							if (Math.abs(delta) > 0.002) { settled = false; next[key] = current[key] + delta * Math.min(1, dt * 11) }
							else next[key] = targetVec[key]
						}
						animRef.current = next
						forceAnim((n) => n + 1)
						frameRef.current = settled ? 0 : window.requestAnimationFrame(step)
					}
					frameRef.current = window.requestAnimationFrame(step)
					return () => { if (frameRef.current) window.cancelAnimationFrame(frameRef.current); frameRef.current = 0 }
				}, [targetKey])

				React.useEffect(() => {
					if (!action) return undefined
					const ms = Math.max(0, action.until - Date.now())
					return ctx.timeout(() => setAction(null), ms)
				}, [action])

				React.useEffect(() => {
					if (prevMoodRef.current === displayMood) return undefined
					const first = prevMoodRef.current === null
					prevMoodRef.current = displayMood
					if (first) return undefined
					setMorphOn(true)
					const dispose = ctx.timeout(() => setMorphOn(false), MORPH_MS)
					return () => { if (typeof dispose === 'function') dispose(); setMorphOn(false) }
				}, [displayMood])

				// Gravity integrator: runs only while the face is airborne or sliding.
				const motionActive = !!(motion && (motion.active || motion.vx !== 0))
				React.useEffect(() => {
					if (!motionActive) return undefined
					let raf = 0
					let last = 0
					const step = (time) => {
						const dt = last === 0 ? 0.016 : Math.min((time - last) / 1000, 0.05)
						last = time
						const m = store.motion
						if (!m) return
						m.vy -= GRAVITY * dt
						m.lift += m.vy * dt
						if (m.lift <= 0) {
							const impact = Math.abs(m.vy)
							m.lift = 0
							m.vy = impact * BOUNCE
							m.squash = Math.min(1, impact / 900)
							if (m.vy < REST_VY) { m.vy = 0; m.active = false; m.squash = 0 }
						}
						m.squash *= Math.pow(0.05, dt)
						m.swing *= Math.pow(0.05, dt)
						if (m.vx !== 0) {
							store.pos = clampPos(store.pos.x + m.vx * dt, store.pos.y, size)
							m.vx *= Math.pow(0.0006, dt)
							if (Math.abs(m.vx) < 2) m.vx = 0
						}
						bump()
						if (m.active || m.vx !== 0) raf = window.requestAnimationFrame(step)
						else {
							m.lift = 0
							m.squash = 0
							persistSeat(store.pos.x, store.pos.y, store.mini)
							bump()
						}
					}
					raf = window.requestAnimationFrame(step)
					return () => { if (raf) window.cancelAnimationFrame(raf) }
				}, [motionActive])

				// The idle scheduler re-arms from scratch whenever the reset epoch
				// changes, which is how a bubble click "resets the timers" rather than
				// merely cancelling the pending one. `idleRef` holds the current idle
				// DURATION (not a timestamp) and is re-read on each fire.
				const idleRef = React.useRef(idle)
				idleRef.current = idle
				const busyRef = React.useRef(false)
				busyRef.current = !!(snap.facts && (snap.facts.running || snap.facts.pendingCount > 0))
				React.useEffect(() => {
					let cancelled = false
					let dispose = null
					const fire = () => {
						if (cancelled) return
						// The loop STAYS ALIVE while gestures are off, so switching them back on in
						// Settings resumes them without a reload - it just idles instead of firing.
						if (!store.options.gestures) { dispose = ctx.timeout(fire, 8000); return }
						const tier = busyRef.current ? 0 : idleTier(idleRef.current)
						const pool = TIER_ACTIONS[tier] || TIER_ACTIONS[0]
						const chosen = pool[Math.floor(Math.random() * pool.length)]
						const chosenSpec = ACTIONS[chosen] || ACTIONS.hop
						setAction({ kind: chosen, until: Date.now() + chosenSpec.ms })
						dispose = ctx.timeout(fire, chosenSpec.ms + (TIER_DELAYS[tier] || 8000))
					}
					dispose = ctx.timeout(fire, 6000)
					return () => { cancelled = true; if (dispose) dispose() }
				}, [snap.resetEpoch])

				const v = animRef.current || targetVec
				const opts = snap.options
				const scale = size / 100
				const headCx = pos.x + HEAD_CX * scale
				const headCy = pos.y + HEAD_CY * scale - motion.lift
				let leanX = 0
				let leanY = 0
				if (mouse.seen) {
					const dx = mouse.x - headCx
					const dy = mouse.y - headCy
					const len = Math.sqrt(dx * dx + dy * dy) || 1
					leanX = (dx / len) * 3.4
					leanY = (dy / len) * 2.4
				}
				const look = layerPick(layers, 'look', spec.look)
				const animClass = layerPick(layers, 'anim', '') || spec.anim
				const pupilOffsetL = pupilFor(look, mouse, pos.x + EYE_LX * scale, pos.y + EYE_CY * scale - motion.lift)
				const pupilOffsetR = pupilFor(look, mouse, pos.x + EYE_RX * scale, pos.y + EYE_CY * scale - motion.lift)
				const pupilClass = LOOK_CLASS[look] || ''

				const onPointerDown = (event) => {
					if (event.button !== 0) return
					if (!store.options.drag) return
					const node = event.currentTarget
					if (node && typeof node.setPointerCapture === 'function') {
						try { node.setPointerCapture(event.pointerId) } catch (error) { console.log('[companion-face] pointer capture unavailable') }
					}
					const at = Date.now()
					drag.current = { id: event.pointerId, dx: event.clientX - pos.x, dy: event.clientY - pos.y, moved: false, x: pos.x, y: pos.y, vx: 0, vy: 0, t: at }
					setPressing(true)
					liftFace()
				}
				const onPointerMove = (event) => {
					const active = drag.current
					if (!active || active.id !== event.pointerId) return
					// A non-finite coordinate would make `left: NaNpx`, which the CSS parser DROPS
					// while `top` still applies - a second way for exactly one axis to stop
					// moving. Hold the last good value rather than let a bad number reach the style.
					const wantX = event.clientX - active.dx
					const wantY = event.clientY - active.dy
					const next = clampPos(
						Number.isFinite(wantX) ? wantX : active.x,
						Number.isFinite(wantY) ? wantY : active.y,
						size,
					)
					const at = Date.now()
					const dtms = Math.max(8, at - active.t)
					active.vx = (next.x - active.x) / dtms * 1000
					active.vy = (next.y - active.y) / dtms * 1000
					active.t = at
					if (Math.abs(next.x - active.x) > 3 || Math.abs(next.y - active.y) > 3) active.moved = true
					active.x = next.x
					active.y = next.y
					store.pos = next
					store.motion.swing = clamp(active.vx * 0.02, -7, 7)
					bump()
				}
				const endDrag = (event) => {
					const active = drag.current
					if (!active) return
					if (event && active.id !== event.pointerId) return
					drag.current = null
					setPressing(false)
					store.motion.swing = 0
					dropFace(active.moved ? active.vx : 0, active.moved ? active.vy : 0)
					if (!active.moved && store.options.poke) triggerPoke(randomPoke())
				}
				const stop = (event) => { event.stopPropagation() }

				/** Bubble click: reset the store, then replay the local animations it owns. */
				const onBubbleClick = (event) => {
					if (event && typeof event.stopPropagation === 'function') event.stopPropagation()
					resetFromBubble()
					setAction(null)
					setMorphOn(true)
					ctx.timeout(() => setMorphOn(false), MORPH_MS)
				}

				// ---- colour ---------------------------------------------------------
				// One accent per mood, carried by the rim, the glow, the cheeks, the
				// contour and the irises. Two live modulations stop it ever being a flat
				// fill: a slow +/-12 degree drift while a mood is HELD, so a long state
				// breathes instead of freezing, and a +28 degree lurch on a poke so
				// touching the face visibly answers back.
				const tintOverride = layerPick(layers, 'tintName', null)
				const baseAccent = tintOverride ? (TINT_FALLBACK[tintOverride] || accentOf(mood)) : accentOf(mood)
				const hueShift = Math.sin(heldMs / 9000) * 12 + (pokeActive ? 28 : 0)
				// `colour` off means monochrome: every material that derives from the accent -
				// ink, sclera, contour, rim, glow, cheeks, irises - collapses to one neutral
				// grey, so the whole face reads as plain rather than half-tinted.
				const accent = opts.colour ? rotateHue(baseAccent, hueShift) : ACCENT.idle
				const tint = accent
				const ink = mix(INK, accent, 0.2)
				const sclera = mix(SKIN_HI, accent, 0.07)
				const contour = mix(INK, accent, 0.34)
				const browFills = browFillPaths(v)
				const eyeShapeOpacity = Math.max(0, 1 - v.arcOpacity)
				const pupilRadius = 4.7 * v.pupilScale
				const headPath = blobPath(v.headRx, v.headRy, v.headCorner)
				const featureScale = 'translate(' + HEAD_CX + ' ' + HEAD_CY + ') scale(' + fix(v.headRx / HEAD_RX) + ' ' + fix(v.headRy / HEAD_RY) + ') translate(' + (-HEAD_CX) + ' ' + (-HEAD_CY) + ')'

				const children = []
				// Paint definitions. The head is no longer a flat white disc: it gets a soft
				// off-white skin gradient, a form shadow falling away from the upper-left,
				// and a blush that fades out instead of a hard-edged ellipse.
				children.push(React.createElement('defs', { key: 'defs' }, [
					React.createElement('radialGradient', { key: 'glow', id: 'dshcpGlow' }, [
						React.createElement('stop', { key: 'a', offset: '0%', stopColor: tint, stopOpacity: 0.5 }),
						React.createElement('stop', { key: 'b', offset: '55%', stopColor: tint, stopOpacity: 0.16 }),
						React.createElement('stop', { key: 'c', offset: '100%', stopColor: tint, stopOpacity: 0 }),
					]),
					// The skin is a fixed material. Only the DEEPEST stop picks up a trace of
					// the accent, which is what stops a coloured face from looking like a
					// grey face with a coloured light next to it.
					React.createElement('radialGradient', { key: 'skin', id: 'dshcpSkin', cx: '0.38', cy: '0.26', r: '0.9' }, [
						React.createElement('stop', { key: 'a', offset: '0%', stopColor: SKIN_HI }),
						React.createElement('stop', { key: 'b', offset: '68%', stopColor: mix(SKIN_HI, accent, 0.05) }),
						React.createElement('stop', { key: 'c', offset: '100%', stopColor: mix(SKIN_LO, accent, 0.16) }),
					]),
					React.createElement('radialGradient', { key: 'shade', id: 'dshcpShade', cx: '0.34', cy: '0.24', r: '0.92' }, [
						React.createElement('stop', { key: 'a', offset: '0%', stopColor: '#ffffff', stopOpacity: 0.8 }),
						React.createElement('stop', { key: 'b', offset: '54%', stopColor: '#ffffff', stopOpacity: 0 }),
						React.createElement('stop', { key: 'c', offset: '100%', stopColor: mix(INK, accent, 0.4), stopOpacity: 0.2 }),
					]),
					React.createElement('radialGradient', { key: 'blush', id: 'dshcpBlush' }, [
						React.createElement('stop', { key: 'a', offset: '0%', stopColor: tint, stopOpacity: 0.85 }),
						React.createElement('stop', { key: 'b', offset: '100%', stopColor: tint, stopOpacity: 0 }),
					]),
					// Clipping the shadow to the live silhouette means it follows every
					// morph - squashes, melts and corner changes included - for free.
					React.createElement('clipPath', { key: 'headclip', id: 'dshcpHeadClip' }, [
						React.createElement('path', { key: 'p', d: headPath }),
					]),
					// The edge fade. Two blurred strokes, one tight and one wide, give a falloff
					// with no outer edge of its own. SVG filters rather than CSS `blur()` on
					// purpose: stdDeviation is in USER UNITS, so the aura scales with the face.
					// A CSS blur is measured in CSS pixels and would be proportionally wrong the
					// moment the companion is shrunk to mini.
					...(opts.aura ? [React.createElement('filter', { key: 'auraTight', id: 'dshcpAuraTight', x: '-20%', y: '-20%', width: '140%', height: '140%' }, [
						React.createElement('feGaussianBlur', { key: 'b', stdDeviation: 2.2 }),
					])] : []),
					...(opts.aura ? [React.createElement('filter', { key: 'auraWide', id: 'dshcpAuraWide', x: '-30%', y: '-30%', width: '160%', height: '160%' }, [
						React.createElement('feGaussianBlur', { key: 'b', stdDeviation: 4.6 }),
					])] : []),
				]))
				if (glowBase > 0.01) {
					// `pointerEvents: none` is not decoration. This disc has r 60 on a 100-unit
					// viewBox, so it is painted WELL outside the face's own box, and painted SVG
					// is hit-testable by default (visiblePainted). It has therefore been eating
					// clicks meant for whatever sits behind the companion - a halo roughly 12px
					// wide - since the beginning. The aura below does the same over a wider area.
					children.push(React.createElement('circle', { key: 'glow', cx: HEAD_CX, cy: HEAD_CY, r: 60, fill: 'url(#dshcpGlow)', opacity: glowBase, pointerEvents: 'none', className: 'dshcp-glowpulse' }))
				}
				// Drift objects are pushed in BEFORE the head so the opaque face occludes
				// them. Keyed on the TRUE mood rather than displayMood, so a fatigue blink
				// does not make the whole layer flicker out.
				const drift = opts.drift ? driftNodes(mood, heldMs, snap.variantSeed) : null
				if (drift) children.push(drift)
				// EDGE: a thin line, then a fade.
				//
				// The mood colour used to be a FLAT band - the head path stroked at 1.055x,
				// 5.8 to 26 units wide, at one opacity across its entire width. A band has an
				// outer boundary of its own, so the face wore a border: two hard edges where
				// there should be one. It is now two Gaussian-blurred strokes of the same
				// path, so the colour is dense at the silhouette and falls off to nothing
				// outward with no outer edge at all.
				//
				// The crisp contour still does the defining; the aura only softens the
				// transition into whatever the face is sitting on. `ring` still drives the
				// intensity, so every mood's existing value keeps its meaning.
				const rimTight = blobPath(v.headRx * 1.025, v.headRy * 1.025, v.headCorner)
				const rimWide = blobPath(v.headRx * 1.06, v.headRy * 1.06, v.headCorner)
				if (opts.aura) {
				children.push(React.createElement('path', {
					key: 'rimWide', d: rimWide, fill: 'none', stroke: accent,
					strokeWidth: 9.5, strokeLinejoin: 'round', pointerEvents: 'none',
					opacity: fix(0.13 + v.ring * 0.32), filter: 'url(#dshcpAuraWide)',
					className: 'dshcp-tint' + (spec.pulse ? ' ' + spec.pulse : ''),
				}))
				children.push(React.createElement('path', {
					key: 'rim', d: rimTight, fill: 'none', stroke: accent,
					strokeWidth: 3.4, strokeLinejoin: 'round', pointerEvents: 'none',
					opacity: fix(0.3 + v.ring * 0.52), filter: 'url(#dshcpAuraTight)',
					className: 'dshcp-tint',
				}))
				}
				children.push(React.createElement('path', { key: 'head', d: headPath, fill: 'url(#dshcpSkin)', stroke: contour, strokeWidth: LINE.contour, strokeLinejoin: 'round' }))
				// The mood wash is capped to ~60% of its old strength: the colour now lives
				// in the rim, the glow and the cheeks, where it reads as light AROUND the
				// character. Washing the head itself only muddied the skin.
				children.push(React.createElement('path', { key: 'headTint', d: headPath, fill: tint, opacity: fix(v.headTint * 0.62), className: 'dshcp-tint' }))
				children.push(React.createElement('rect', {
					key: 'shade', className: 'dshcp-shade', x: 0, y: 0, width: 100, height: 100,
					fill: 'url(#dshcpShade)', clipPath: 'url(#dshcpHeadClip)',
				}))
				if (v.cheek > 0.01) {
					children.push(React.createElement('ellipse', { key: 'cheekL', cx: 26, cy: 66, rx: 8.4, ry: 5.6, fill: 'url(#dshcpBlush)', opacity: 0.8 * v.cheek, className: 'dshcp-tint' }))
					children.push(React.createElement('ellipse', { key: 'cheekR', cx: 74, cy: 66, rx: 8.4, ry: 5.6, fill: 'url(#dshcpBlush)', opacity: 0.8 * v.cheek, className: 'dshcp-tint' }))
				}

				const features = []
				// Brows are FILLED tapered shapes now, thick at the inner end and lifting to a
				// fine outer tip. A uniform 3px stroke read as a drawn line rather than a brow.
				features.push(React.createElement('path', { key: 'browL', d: browFills[0], fill: ink, opacity: LINE.brow * v.browOpacity, className: 'dshcp-brow' }))
				features.push(React.createElement('path', { key: 'browR', d: browFills[1], fill: ink, opacity: LINE.brow * v.browOpacity, className: 'dshcp-brow' }))
				// Never blink while an expression already closes the eyes (the happy and sleepy
				// arcs), or the two animations fight over the same lid.
				const blinkCycle = 3400 + mod(snap.variantSeed, 5) * 620
				const blinking = opts.blink && v.arcOpacity < 0.5 && (
					mod(now, blinkCycle) < BLINK_MS
					|| mod(now + blinkCycle * 0.41, blinkCycle * 3.17) < BLINK_MS
				)
				const eyes = [{ key: 'L', cx: EYE_LX, off: pupilOffsetL }, { key: 'R', cx: EYE_RX, off: pupilOffsetR }]
				for (let i = 0; i < eyes.length; i += 1) {
					const eye = eyes[i]
					const px = eye.cx + eye.off.x
					const py = EYE_CY + eye.off.y
					features.push(React.createElement('g', { key: eye.key + '-open', opacity: blinking ? 0 : eyeShapeOpacity, className: blinking ? 'dshcp-blink' : undefined }, [
						React.createElement('ellipse', { key: 'sclera', cx: eye.cx, cy: EYE_CY, rx: 8.8, ry: v.eyeRy, fill: sclera, stroke: ink, strokeWidth: LINE.sclera, className: 'dshcp-eye' }),
						// Iris ring, then pupil, then TWO glints - one broad highlight up-left and
						// a small bounce down-right. One glint reads as a dot; two read as a wet,
						// spherical eye. They live in the `pupil` group so the look animation
						// (sweep / dart / updown) still carries them, while the lash line stays
						// fixed to the socket.
						React.createElement('g', { key: 'pupil', className: pupilClass }, [
							// A COLOURED iris ring and a mood-deep pupil. The iris used to be
							// `rgba(11,16,32,.22)` - a grey ghost that did nothing. Now the
							// eye itself carries the mood, which is the single biggest reason
							// the face reads as coloured rather than as grey-with-a-tint.
							React.createElement('circle', { key: 'iris', cx: px, cy: py, r: pupilRadius * 1.3, fill: 'none', stroke: accent, strokeWidth: LINE.iris, opacity: 0.85, className: 'dshcp-eye' }),
							React.createElement('circle', { key: 'dot', cx: px, cy: py, r: pupilRadius, fill: mix(INK, accent, 0.34) }),
							React.createElement('circle', { key: 'glint', cx: px - pupilRadius * 0.42, cy: py - pupilRadius * 0.5, r: pupilRadius * 0.46, fill: '#ffffff', opacity: 0.95 }),
							React.createElement('circle', { key: 'glint2', cx: px + pupilRadius * 0.46, cy: py + pupilRadius * 0.52, r: pupilRadius * 0.22, fill: '#ffffff', opacity: 0.6 }),
						]),
						// Upper lash line, heavier than the sclera outline it sits on.
						React.createElement('path', {
							key: 'lid',
							d: 'M' + fix(eye.cx - 8.2) + ' ' + fix(EYE_CY - 1.4) + ' Q' + eye.cx + ' ' + fix(EYE_CY - v.eyeRy - 3.4) + ' ' + fix(eye.cx + 8.2) + ' ' + fix(EYE_CY - 1.4),
							fill: 'none', stroke: ink, strokeWidth: LINE.lid, strokeLinecap: 'round', className: 'dshcp-eye',
						}),
					]))
					// A CLOSED EYE IS A LID, NOT A DELETED EYE.
					//
					// This used to be one hairline arc drawn exactly where the eye had been: the
					// sclera, pupil, glints and lash line all vanished and a single 1.45-wide
					// stroke appeared. Two thin dashes where a face had eyes reads as a corpse
					// rather than as a blink - and the same shape is held for the whole of
					// `sleepy` and `yawning`, so it was not a 140ms glimpse. It is now a filled
					// crescent that tapers to points at the corners, so the lid has mass, plus a
					// lash flick at the outer corner.
					//
					// The blink is also CRISP now, and that is the actual "spooky" cause. The
					// stylesheet eases opacity over 400ms while BLINK_MS is 140, so the eye
					// could only reach about half-closed before it began opening again: the open
					// eye and the lid were each ~50% visible AT THE SAME TIME, a ghosted double
					// image. `dshcp-blink` switches the transition off for the duration, so the
					// lid snaps shut and snaps open - which is what an eyelid does.
					features.push(React.createElement('path', {
						key: eye.key + '-arc',
						d: closedLidPath(eye.cx, EYE_CY, blinking ? 4 : v.arcBend, blinking ? 1.7 : 2.1),
						fill: ink,
						opacity: blinking ? 1 : v.arcOpacity,
						className: 'dshcp-arc' + (blinking ? ' dshcp-blink' : ''),
					}))
					features.push(React.createElement('path', {
						key: eye.key + '-lash',
						d: lashPath(eye.cx, EYE_CY, eye.key === 'R' ? 1 : -1),
						fill: 'none', stroke: ink, strokeWidth: LINE.arc, strokeLinecap: 'round',
						opacity: blinking ? 1 : v.arcOpacity,
						className: 'dshcp-arc' + (blinking ? ' dshcp-blink' : ''),
					}))
				}
				features.push(React.createElement('path', { key: 'mouthCurve', d: mouthPath(v), fill: 'none', stroke: ink, strokeWidth: LINE.mouth, strokeLinecap: 'round', opacity: v.curveOpacity, className: 'dshcp-mouth' }))
				features.push(React.createElement('ellipse', { key: 'mouthOpen', cx: HEAD_CX, cy: 73, rx: 3.5 + v.mouthOpen * 4, ry: 3.5 + v.mouthOpen * 6.5, fill: ink, opacity: v.mouthOpen, className: 'dshcp-mouth' + (spec.talk ? ' dshcp-talk' : '') }))
				// Worn only after kind words from the user. Inside the feature group, so it
				// rides the head morph with the rest of the face.
				if (opts.accessories && snap.accessory && snap.accessory.until > now) {
					// It gets a leaving phase: popping out of existence looked like a glitch.
					const leaving = snap.accessory.until - now < 380
					features.push(React.createElement('g', {
						key: 'acc-' + snap.accessory.kind,
						className: 'dshcp-acc' + (leaving ? ' dshcp-accout' : ''),
						'data-acc': snap.accessory.kind,
					}, accessoryNode(snap.accessory.kind)))
				}
				children.push(React.createElement('g', { key: 'features', transform: featureScale }, features))

				const fx = opts.effects ? fxNodes(fxList, tint) : []
				for (let i = 0; i < fx.length; i += 1) children.push(fx[i])

				if (displayMood === 'alerting') {
					children.push(React.createElement('g', { key: 'badge', className: 'dshcp-badge' }, [
						React.createElement('circle', { key: 'bg', cx: 14, cy: 15, r: 10, fill: accent }),
						React.createElement('text', { key: 'mark', x: 14, y: 21, textAnchor: 'middle', fontSize: 15, fontWeight: 700, fill: '#ffffff' }, '!'),
					]))
				}

				// The street sign sits outside the feature-scale group on purpose: it
				// should stay a legible plate while the head morphs, not squash with
				// the face. It is also only visible on part of its cycle.
				const sign = opts.sign && signVisible(displayMood, heldMs, snap.variantSeed) ? signNode(displayMood) : null
				if (sign) children.push(sign)

				// Only the awake-but-unoccupied states get philosophy. `sleepy` and `yawning`
				// have their own captions and their own meaning, and talking over them would
				// read as the companion ignoring its own fatigue.
				const saying = (opts.wisdom && QUIET_MOODS[displayMood]) ? sayingFor(idle, snap.variantSeed) : ''
				const bubble = (snap.mini || !opts.bubble) ? '' : bubbleFor(
					mood,
					variant ? (variant.bubble || '') : '',
					saying,
					pokeSpec ? (pokeSpec.bubble || '') : '',
					actionSpec ? (actionSpec.bubble || '') : '',
					actionKind, snap.facts, snap.draft, typing, idle, reacting,
				)
				// The saying survived the stack, so the balloon may wrap for it. Every other
				// caption is one short clipped line; a proverb ellipsised to "A watched
				// process never fini..." is worse than no proverb at all.
				const bubbleSaying = saying !== '' && bubble === saying

				// The ground shadow is the ONLY cue that survives the softening of the
				// silhouette. The edge now fades outward instead of ending in a hard band,
				// and a soft-edged object reads its own motion less clearly than a crisp
				// one - so the drop's fall, bounce and landing are carried by the shadow
				// rather than by the outline. It therefore travels further (1.06 -> 0.5),
				// fades harder (0.58 -> 0.07) and darkens on impact, which is what makes a
				// landing read as a landing.
				const shadowStrength = Math.max(motion.lift, 0) / DRAG_LIFT
				const impactBoost = clamp(motion.squash, 0, 1)
				const shadowOpacity = clamp(0.58 - shadowStrength * 0.46 + impactBoost * 0.34, 0.07, 0.88)
				const shadowScale = clamp(1.06 - shadowStrength * 0.5, 0.5, 1.06)

				const faceChildren = [
					React.createElement('svg', { key: 'svg', className: 'dshcp-svg', viewBox: '0 0 100 100', width: '100%', height: '100%' }, children),
				]
				if (!snap.mini) {
					faceChildren.push(React.createElement('button', { key: 'btn', type: 'button', className: 'dshcp-btn', title: 'Shrink the companion', onPointerDown: stop, onClick: (event) => { event.stopPropagation(); toggleMini() } }, '\u2013'))
				}

				const impact = motion.squash
				const hangStretch = motion.lift > 0.5 ? 0.03 : 0
				const sx = v.scale * v.squashX * (1 + impact * 0.22)
				const sy = v.scale * v.squashY * (1 - impact * 0.3 + hangStretch)
				const faceTransform = 'translate(' + leanX.toFixed(2) + 'px,' + (leanY - motion.lift).toFixed(2) + 'px) rotate(' + fix(v.tilt + motion.swing) + 'deg) scale(' + fix(sx) + ',' + fix(sy) + ')'
				const hopChildren = [
					React.createElement('div', {
						key: 'face',
						className: 'dshcp-face' + (pressing ? ' dshcp-face--pressing' : '') + (opts.drag ? '' : ' dshcp-face--fixed'),
						style: { width: size + 'px', height: size + 'px', transform: faceTransform },
						role: 'img',
						'aria-label': 'Companion face: ' + (MOOD_LABEL[displayMood] || 'idle') + (variant ? ' / ' + variant.key : ''),
						title: 'Companion is ' + (MOOD_LABEL[mood] || 'idle') + ' — drag me anywhere, click to poke',
						onPointerDown: onPointerDown,
						onPointerMove: onPointerMove,
						onPointerUp: endDrag,
						onPointerCancel: endDrag,
						onDoubleClick: (event) => { event.stopPropagation(); toggleMini() },
					}, faceChildren),
				]
				// Keyed by the reset epoch so a click remounts the bubble and replays
				// its pop, which is the visible confirmation that the reset happened.
				if (bubble) {
					hopChildren.push(React.createElement('div', {
						key: 'bubble-' + snap.resetEpoch,
						className: 'dshcp-bubble' + (bubbleSaying ? ' dshcp-bubble--saying' : ''),
						role: 'button',
						tabIndex: 0,
						title: 'Click to reset the animation' + (variant ? ' and see another one' : ''),
						onPointerDown: stop,
						onClick: onBubbleClick,
						onKeyDown: (event) => {
							if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onBubbleClick(event) }
						},
					}, bubble))
				}

				// Ground contact shadow: it stays at the resting spot while the face
				// floats, which is what makes the drop read as height. Inline styles
				// only, so this element never enters a className audit.
				const shadowNode = (motion.lift > 0.2 || motion.squash > 0.02)
					? React.createElement('div', {
						key: 'shadow',
						'data-dshcp-shadow': '1',
						style: {
							position: 'absolute', left: '50%', bottom: '2px', pointerEvents: 'none',
							width: fix(size * 0.72) + 'px', height: fix(size * 0.15) + 'px',
							marginLeft: fix(-size * 0.36) + 'px', borderRadius: '50%',
							background: 'radial-gradient(closest-side, rgba(0,0,0,.5), rgba(0,0,0,0))',
							opacity: fix(shadowOpacity), transform: 'scale(' + fix(shadowScale) + ')',
						},
					})
					: null

				return React.createElement('div', {
					className: 'dshcp-wrap',
					style: { left: pos.x + 'px', top: pos.y + 'px' },
				}, [React.createElement('div', { key: 'bob', className: 'dshcp-bob' + (snap.options.sway ? '' : ' dshcp-still') }, [
					React.createElement('div', { key: 'hop', className: 'dshcp-hopwrap' + (layerPick(layers, 'hop', false) ? ' dshcp-hop' : '') }, [
						React.createElement('div', { key: 'mood', className: 'dshcp-moodwrap' + (animClass ? ' ' + animClass : '') }, [
							React.createElement('div', { key: 'morph', className: 'dshcp-morphwrap' + (morphOn ? ' dshcp-morph' : '') }, hopChildren),
							shadowNode,
						]),
					]),
				])])
			}

			function CompanionChip(props) {
				const snap = useStore()
				const signature = props.useSession(signatureOf)
				const draft = props.useInput(draftOf)
				React.useEffect(() => {
					const facts = factsFromSignature(signature)
					facts.at = Date.now()
					publish(facts)
				}, [signature])
				React.useEffect(() => { publishDraft(typeof draft === 'string' ? draft : '') }, [draft])
				// ONLY here, after the hooks. This component is the only session-scoped seat the
				// plugin owns, so it is the BRIDGE that publishes the conversation into the shared
				// store: returning early before these effects would blind the face entirely.
				if (!snap.options.chip) return null
				const now = Date.now()
				const mood = resolveMood(snap, now)
				const label = MOOD_LABEL[mood] || 'idle'
				const heldMs = snap.moodSince ? now - snap.moodSince : 0
				// Same accent, same drift as the face, so chip and face never disagree.
				const tint = rotateHue(accentOf(mood), Math.sin(heldMs / 9000) * 12)
				const hot = mood === 'panicking' || mood === 'agitated' || mood === 'alerting'
				const rare = RARE_MOODS.indexOf(mood) >= 0
				const level = ambientLevel(mood, heldMs)
				const chipChildren = [
					React.createElement('span', { key: 'dot', className: 'dshcp-chip-dot' }),
					React.createElement('span', { key: 'emoji', className: 'dshcp-chip-emoji' }, EMOJI[mood] || EMOJI.idle),
					React.createElement('span', { key: 'label' }, label),
				]
				if (rare) chipChildren.push(React.createElement('span', { key: 'rare', className: 'dshcp-chip-rich' }, 'rare'))
				if (level >= 2) {
					const stars = []
					for (let i = 0; i < level; i += 1) stars.push('*')
					chipChildren.push(React.createElement('span', { key: 'rich', className: 'dshcp-chip-rich' }, stars.join('')))
				}
				if (snap.facts && snap.facts.pendingCount > 0) chipChildren.push(React.createElement('span', { key: 'count' }, '(' + snap.facts.pendingCount + ')'))
				return React.createElement('button', {
					type: 'button',
					className: 'dshcp-chip' + (mood === 'alerting' ? ' dshcp-chip--alert' : '') + (hot && mood !== 'alerting' ? ' dshcp-chip--hot' : '') + (rare ? ' dshcp-chip--rare' : ''),
					style: { color: tint },
					title: 'Companion mood: ' + label + ' (held ' + Math.round(heldMs / 1000) + 's, richness ' + level + ') — click to ' + (snap.mini ? 'expand' : 'shrink') + ' the face',
					onClick: toggleMini,
				}, chipChildren)
			}

			/**
			 * The options page, in Settings -> Plugins -> Companion.
			 *
			 * Registered into `settings.plugins.tab`, whose contract says the section owner
			 * renders each contribution's `label` as a tab and mounts the contribution inside the
			 * matching panel - so this component IS the page body and needs no chrome of its own.
			 */
			function CompanionOptions() {
				const snap = useStore()
				const opts = snap.options
				const groups = []
				for (let i = 0; i < OPTION_DEFS.length; i += 1) {
					if (groups.indexOf(OPTION_DEFS[i].group) < 0) groups.push(OPTION_DEFS[i].group)
				}
				const children = [
					React.createElement('p', { key: 'lead', className: 'dshcp-opts-lead' },
						'Every behaviour below can be switched off. Changes take effect immediately and are remembered across restarts.'),
				]
				for (let g = 0; g < groups.length; g += 1) {
					const group = groups[g]
					const rows = []
					for (let i = 0; i < OPTION_DEFS.length; i += 1) {
						const def = OPTION_DEFS[i]
						if (def.group !== group) continue
						rows.push(React.createElement('label', { key: def.key, className: 'dshcp-opt' }, [
							React.createElement('input', {
								key: 'box',
								type: 'checkbox',
								className: 'dshcp-opt-box',
								checked: opts[def.key] === true,
								onChange: (event) => setOption(def.key, event.target.checked === true),
							}),
							React.createElement('span', { key: 'text', className: 'dshcp-opt-text' }, [
								React.createElement('span', { key: 'label', className: 'dshcp-opt-label' }, def.label),
								React.createElement('span', { key: 'hint', className: 'dshcp-opt-hint' }, def.hint),
							]),
						]))
					}
					children.push(React.createElement('section', { key: 'group-' + group, className: 'dshcp-opts-group' }, [
						React.createElement('h4', { key: 'head', className: 'dshcp-opts-head' }, group),
						React.createElement('div', { key: 'rows', className: 'dshcp-opts-rows' }, rows),
					]))
				}
				children.push(React.createElement('div', { key: 'foot', className: 'dshcp-opts-foot' }, [
					React.createElement('button', {
						key: 'reset', type: 'button', className: 'dshcp-opts-reset', onClick: resetOptions,
					}, 'Turn everything back on'),
				]))
				return React.createElement('div', { className: 'dshcp-opts' }, children)
			}

			const slots = ctx.slots
			ctx.effect(() => slots.inject('shell.overlay', () => slots.register({ name: 'shell.overlay', id: 'dynamic-companion-face', order: 6 }, CompanionFace)))
			ctx.effect(() => slots.inject('conversation.session.header.utilities', () => slots.register({ name: 'conversation.session.header.utilities', id: 'dynamic-companion-chip', order: 20, label: 'Companion' }, CompanionChip)))
			// Settings -> Plugins -> Companion. The section owner renders the `label` as a tab
			// and mounts this component as that tab's body.
			ctx.effect(() => slots.inject('settings.plugins.tab', () => slots.register({ name: 'settings.plugins.tab', id: 'dynamic-companion-options', order: 20, label: 'Companion' }, CompanionOptions)))
		}

		const inject = ['slots', 'timer']

		exports.apply = apply
		exports.inject = inject
		return module.exports
	}
})
