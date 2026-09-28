# Changelog

Both the shipped bundle and the dynamic in-session Cordis plugin are the same code, so a
version here describes both planes at once. Hashes are `lib/client.js` sha256.

The dynamic plugin's package id (`face-1/pkg-N`) is **process-local** — a harness restart
allocates a fresh sequence — so it is never a version. The hash is.

## v29 — idle sayings

**136 checks** · the pool is `WISDOM_LINES`, the switch is **Idle sayings**

134 original lines of wise nonsense, offered one every 75 seconds after 75 seconds of nothing, up
for 6.5 seconds — about 9% of a long wait.

They are **written, not scraped**, and that is the design decision rather than a shortcut. A
browser bundle fetching quotations at runtime needs a key-free CORS-friendly service that does not
reliably exist, and would fail silently offline; and most of the "wise quotes" circulating online
are misattributed, which for a companion is worse than being openly inventive. So the pool is
mock-proverbs, computing-flavoured aphorisms and quiet observations from something that is mostly
a face on a screen.

Behaviour, and the reasoning behind each part:

- **Derived from the idle clock, not a stored cursor.** Same wait, same sequence, deterministic and
  testable; the pool advances one line per event instead of sampling, so it takes about two and
  three-quarter hours to come round again.
- **Base of the balloon ladder.** A saying sits above the plain mood caption and a variant line and
  *below* everything that carries information — running tool, live stream, open approval or
  question, error, poke, idle gesture. Filler that hides a signal is a bug. The check is a paired
  comparison at the same idle duration: first prove a saying appears on its own, then repeat with a
  live state and require the state to win.
- **Quiet moods only: idle, bored, sleepy.** `yawning` is excluded because its window (25–45 s)
  closes before the first saying is ever due — the exclusion is unreachable rather than a judgement
  call. `sleepy` is included deliberately: without it a long wait would produce exactly two lines
  and then silence forever, which makes a large pool pointless, and a proverb murmured in its sleep
  is the better joke.
- **A saying wraps.** Every other caption is one clipped line in `white-space:nowrap` with an
  ellipsis, and *"A watched process never fini…"* is worse than no proverb. One modifier class,
  narrower than the caption maximum so a long line breaks into three centred rows.
- **New `Idle sayings` switch**, under Interaction. Sixteen now, still all on by default.

Six new checks: pool size/uniqueness/length, the threshold, the 6.5 s window closing, rotation
across twelve samples, precedence against five live states, and the wrap class. `tools/assess.mjs`
now reports the pool size, duty cycle and cycle time.

### Packaging, ahead of the first public release

Audited against what a reader on GitHub or npm would actually hit. Four real gaps, all closed:

- **No `LICENSE` file existed** while `package.json` claimed MIT. A metadata claim with no file is
  ambiguous to every consumer and defeats licence detection, so the file now exists, held by
  Nikos Georgousis (Hand Water Pump).
- **Both installers could write a DUPLICATE patch row.** The idempotency test matched the quoted
  string `'dsh-companion-face'`, so a hand-edited `name: dsh-companion-face` (YAML treats the
  quotes as optional) was not recognised and the row was appended a second time — loading the
  plugin twice. The obvious fix is worse: matching the bare name also matches the comment banner
  at the top of the patch file, which would append *nothing* and report success. Both installers
  now match the plugin name as a **YAML value at the start of a mapping key**, quoted or bare.
  Exercised end-to-end against three synthetic profiles (row already present, comment only, no
  file at all), and the generated files parsed with `js-yaml`: valid array, exactly one row.
- **`files` in `package.json` omitted the installer and the whole test suite**, so `npm pack` would
  have shipped a package with no way to install it and nothing to verify it. Twelve entries now.
- **The README's image lived outside the package**, in a `dist/` directory that does not exist in a
  clone, so it would have been a broken image on GitHub. The sheet now ships as
  `docs/mood-sheet.png` and both installers copy it.

Also: `tools/sheet.mjs` gained a `node_modules/sharp` candidate beside the package, so a clone with
`npm i sharp` can render without a DSH profile; and `install.sh` is now documented as **reviewed
but never executed** — the development machine has no POSIX shell.

## v28 — switches for every behaviour

**128 checks** · new page: **Settings → Plugins → Companion**

Fifteen on/off switches, grouped as Interaction / Responses / Appearance, plus a "Turn everything
back on" button. All default to ON, so upgrading changes nothing visible until someone opens the
page — that is the point of the defaults.

Contributed through **`settings.plugins.tab`**, the additive seat the shell provides for exactly
this ("the section owner renders each contribution's `label` as a tab and mounts the contribution
inside the matching panel"), so it lands beside the shipped `configurable` and `all` tabs rather
than anywhere near shipped UI. No new host code, no replaced component.

Persistence is a **sparse** map merged over the defaults, deliberately not a full snapshot: a
version that adds a switch must hand it its default rather than inherit `undefined` from a file
written by an older build.

Three gates were not simply "stop drawing it", and each is asserted as the semantic claim rather
than as a literal:

- **Mood colours off is monochrome.** Ink, sclera, contour, aura, glow, cheeks and irises all
  derive from the accent, so they collapse to one neutral grey together. The check drives two
  different moods and requires the *same* contour from both — asserting a hex would only pin the
  palette.
- **The aura filter had to be gated as well.** Hiding the two paths left the `<filter>`
  declarations in `defs`; my own check caught that as dead weight.
- **Hiding the header chip must not blind the face.** The chip is the only session-scoped seat, so
  it is the bridge that publishes the conversation into the shared store. Returning `null` before
  its effects run would leave the face permanently idle — a plausible-looking implementation that
  quietly breaks everything. It returns `null` after them, and the check asserts the face still
  receives conversation state with the chip hidden.

The idle scheduler also stays ALIVE while gestures are off, so switching them back on resumes them
without a reload instead of leaving a dead timer.

## v27 — the face could only be dragged up and down

**121 checks**

Reported as *"I cannot drag it across the screen, I can move it only up-down"*. The drag handler
is symmetric — `clientX` and `clientY` take identical paths — so a single pinned axis meant one
thing: `clampPos` collapsing that axis.

```js
Math.min(Math.max(6, x), Math.max(6, vw - size - 6))
```

That reads as a harmless clamp. But when the viewport is narrower than the face plus its margins,
`Math.max(6, vw - size - 6)` **is** `6`, and the whole expression becomes the constant `6`: the
face slams to the left edge and horizontal movement stops entirely, while `top` keeps working
normally. A collapsed range pins the axis.

Fixed by holding the requested coordinate when there is no room to move, rather than collapsing
the range:

```js
x: spanX > 6 ? Math.min(Math.max(6, x), spanX) : x,
```

Also hardened the other way one axis can die: a non-finite coordinate produces `left: NaNpx`,
which the CSS parser **drops** while `top` still applies. The drag handler now holds the last
good value instead of letting a bad number reach the style.

The new check drives each axis on its own and asserts the *other* one holds — a horizontal drag
must not leak into `y` and vice versa — then repeats it with a 100px viewport to catch the
collapse. Two of my own test bugs surfaced doing this: the first version dragged *toward* the
edge the face was already clamped against (correctly clamped to 0, misread as a pinned axis), and
a duplicate `const local` broke the module.

## v26 — closing the eyes no longer reads as dying, and the drop bounce

**120 checks**

### The eyes

Two defects, and the second is the one you were seeing.

**Shape.** Closing removed the sclera, pupil, glints and lash line and left **one 1.45-wide
arc** exactly where the eye had been. Two thin dashes where a face had eyes reads as a corpse
rather than as a blink — and `sleepy` and `yawning` hold that shape for their entire duration,
so it was never a 140ms glimpse. The lid is now a **filled crescent** that tapers to points at
both corners, so it has mass, plus a **lash flick** at the outer corner.

**Timing — the actual "spooky" cause, and it was arithmetic.** The stylesheet eases opacity
over **400ms** while `BLINK_MS` is **140**. The eye could therefore only reach about
half-closed before it began opening again, so the open eye and the lid were each **~50%
visible at the same time**: a ghosted double image. The new `.dshcp-blink` class switches the
transition off for the duration, so the lid snaps shut and snaps open — which is what an eyelid
does. The mood crossfade (where `arcOpacity` changes) still eases over 400ms.

### The drop bounce was never lost

I diffed the whole bundle against the frozen v20 tree. **Every drag and gravity symbol is
present with identical values** — `DRAG_LIFT 26`, `GRAVITY 1500`, `BOUNCE 0.42`,
`THROW_FACTOR 0.35`, `MAX_THROW 320`, `REST_VY 26` — and the integrator, the landing transform
and the contact shadow are byte-identical. The only line the diff flagged as removed was a CSS
rule that still exists (an earlier edit of mine had merged it onto the `const CSS = [` line).

So I measured the envelope instead of arguing about it, and **my first measurement was wrong**:
it reassigned the apex on every bounce and reported **1.4px** for a rebound that actually
reaches **24.6px**. The real trajectory of a thrown drop:

```
26.0 → 0.0 (land) → 22.5 → 24.6 (rebound apex) → 20.4 → 10.2 → 2.0 → 6.0 (second bounce) → 0
```

Four airborne phases. The physics was fine; the check was not. It now asserts the shape of the
envelope — the face must leave the ground *again* after touching down, and come to rest.

`BOUNCE` is raised 0.42 → **0.55** anyway, because the apex of a drop with no throw is
`BOUNCE² × DRAG_LIFT`: that was **4.6px**, small enough to miss entirely once the silhouette
started fading into its surroundings. It is now **7.9px**.

### A real click-theft bug, found while chasing the bounce

The glow disc is `r 60` on a 100-unit viewBox and the aura reaches past the silhouette, so both
paint **outside** the face's own box. Painted SVG is hit-testable by default and `overflow` is
visible here, so an invisible halo roughly **12px wide** has been swallowing clicks meant for
whatever sits behind the companion. The glow had done this since the beginning; the aura
widened it. Both now carry `pointer-events: none`.

Two self-inflicted check bugs are also recorded here, because both produced *confident wrong
answers*: the apex-reset above, and a lookup that matched the `<radialGradient key="glow">` in
defs instead of the glow circle — so it reported click-theft against a gradient.

## v25 — a thinner edge, and one that fades outward instead of ending

**116 checks**

The mood colour around the silhouette was a **flat band**: the head path stroked at 1.055×,
5.8 to 26 units wide, at a single opacity across its whole width. A band has an outer boundary
of its own, so the face wore a **border** — two hard edges where there should be one. That is
what "make it fade towards the outer area" is asking for.

| | Was | Now |
|---|---|---|
| Contour | 2.0 | **1.7** — and the interior steps down with it (mouth 1.7→1.5, arc 1.7→1.45, lash 1.35→1.2, sclera 1.25→1.1, iris 0.9) |
| Edge | one flat stroke, width 5.8–26, opacity 0.34–0.76 | **two Gaussian-blurred strokes**, σ 2.2 and 4.6, opacity 0.47 → 0.23 |

The falloff is progressive and has no outer edge at all: dense at the silhouette, gone by the
time it has travelled ~6 units outward, and always drawn **behind** the head so the opaque skin
hides the inward half. That is what makes it read as the silhouette dissolving into its
surroundings rather than as a halo floating around it.

**SVG filters, not CSS `blur()`** — deliberately. `stdDeviation` is in user units and therefore
scales with the face; a CSS blur is measured in CSS pixels and would be proportionally wrong the
moment the companion is shrunk to mini.

The new check asserts four separate things rather than eyeballing them: every layer is blurred,
the blur deepens outward, the outer layer is wider *and fainter*, and the layers sit behind the
head. The old check was also tightened from `contour ≤ 2` to `≤ 1.8`, so the thinner outline
cannot quietly regress.

## v24 — the face answers your decisions, not just your words

**115 checks** · new section: *reacting to what the user DOES*

It only ever reacted to typed text. So the two moments that most deserve an answer — granting
an approval and answering a question — went unnoticed: it raised an alert face asking
permission, the human clicked **Allow**, and the face went straight back to work.

An approval outcome is not a node of its own. The shipped tool runtime turns a refusal into a
DENY **reason string**, so the outcome is read from what the decision leaves behind:

| The human did | What the face reads | Reaction |
|---|---|---|
| **Allowed** | the prompt cleared and nothing refused it, and the permitted tool produced a result | **delighted**, "Thank you! On it." |
| **Rejected** | `the user rejected tool "X"` | resigned **disappointed**, "No problem - I will leave it." — *not* the 8s agitation a real tool error earns |
| **Cancelled** | `approval for tool "X" was cancelled` | **surprised** |
| **Unavailable** | `requires approval (not yet supported)` — fail-closed, no answerer | stays **agitated**: that is not the human saying no |
| Answered a question | the prompt cleared and a new user message arrived | **happy**, "Thanks - that helps." |

Exact phrases taken from the shipped tool runtime (`dsh-tools`), not guessed. Two ordering
rules matter and are asserted: the reaction outranks the prompt it just cleared (or the face
would snap back to work and never acknowledge you), and a reaction outranks a tool error that
lands in the same publish — you allowed a command and it failed, and the thank-you you earned
survives its window rather than being stomped one frame later.

**A real bug this exposed.** The open ask was keyed on the tool NAME alone:

```js
if (!store.ask || store.ask.tool !== facts.pendingTool) { store.ask = {...} }
```

A **second** prompt for the same tool found the previous ask still in the store, treated it as
current, and the stale `done` flag swallowed the reaction — so the second time you granted the
same command, the face said nothing. The guard now includes `done`.

Also fixed: two harness helpers were found to be measuring the wrong thing — `headPathOf`
looked the silhouette up by stroke width (so changing the weight made two checks fail with a
message about the outline not morphing), and the reaction checks inherited both a live alarm
and **mini mode** from earlier sections, which hides the balloon and made every balloon
assertion read `""` while the mood assertions passed.

## v23 — the face was theming itself against its own skin

**108 checks** · new: `DESIGN.md` (the full review), `tools/sheet.mjs` (renders it)

The drawing was fine; the *materials* were wrong. Three findings, all measured — full
reasoning in `DESIGN.md`.

| Finding | Measurement | Fix |
|---|---|---|
| **Ink, sclera and contour read `--dsw-alias-*` tokens while the skin was fixed.** The shell defines `--dsw-alias-label-primary` twice — `neutral-bluish-1000` light, `neutral-bluish-50` dark. | In the dark theme the face drew near-white features on a near-white head. Every behavioural check passed anyway. | The face is now self-contained: literal skin, ink and contour, colour from one per-mood accent. Only bubble, chip and sign post may read tokens. New check walks the rendered tree for any `var(--dsw-alias` paint. |
| **The contour was the heaviest line and the faintest.** `#cfd4dc` on skin `#e9eef6`. | **1.26:1** contrast, at weight 2.8 — heavier than the mouth (2.6). | Thinner *and* visible: **2.0 at 7.71:1**. Full weight ladder documented in `DESIGN.md`, asserted by the harness. |
| **A filled circle (r 46) hid behind a blob of half-width 43.** | A band down the sides, nothing at the corners — a second outline disagreeing with the first. | A rim: the accent stroked along a 1.055× copy of the head path. Even band by construction, rides every morph for free. |

Braver colour: **7 shared shell tokens became 36 per-mood accents**, spent on the rim, glow,
cheeks, irises, pupils, contour tint and the deepest skin stop — plus a ±12° hue drift while a
mood is held and a +28° lurch on a poke. The mood wash *on* the head was cut to 62%.

Palette construction is deliberate, not hand-picked: an even 10° wheel made the seven
green/teal working states near-identical, so hues are grouped by family and only the warm band
(18–115°) is held under L 0.545, because golds and yellows wash out on an off-white face and
the cool half does not. Result: **36 distinct, minimum 1.62:1 on the skin, minimum 4.37:1 on a
near-black page.**

Two harness repairs this exposed:

- `headPathOf` found the silhouette by `strokeWidth === 2.8`, so the moment the contour weight
  changed it returned null and **two checks failed with a misleading message** about the
  outline not morphing. It looks the element up by key now.
- `stringMap` reads the palette with a regex over key/value pairs. The first attempt JSON-parsed
  the slice and returned null on a trailing comma — a false failure reported as a parse problem.

Renders: `dist/renders/face-before.png` (v20, via `BUNDLE=`) and `face-after.png`, both produced
by the same tool from two bundles.

## v22 — the drift layer could not be seen

`6d0c5bbfc1bc601612e8702dedcbe51bba6e0ee9503cf7fc1e72a397eff7b8c7` · 145,393 bytes ·
**103 checks**

The long-haul background objects were implemented, wired to 24 moods and covered by six
harness checks — and were effectively invisible. None of those checks looked at *where* the
objects land. Two defects, both measured:

| Defect | Evidence |
|---|---|
| **Two of six spots had their centres inside the head.** The layer draws behind the head, so those objects were erased by the opaque face, always. | `[9,54]` and `[91,50]`, ellipse metric **0.91**. The other four had nearest-corner metrics of 0.58–0.78, so they were half-eaten too. |
| **The spot stride stacked objects.** `i * 3 mod 6` resolves to 0,3,0 for a three-object pool and 0,3,0,3 for four. | A four-object parade drew **two** distinct positions; when the offset landed on the buried spots, it drew **one**. |

Root cause of the second-order problem: the head is an 86×82 ellipse in a 100×100 box, so
the free margin is **7 units** while a glyph needs 8–11. No spot could ever show a whole
object, whatever the coordinates. Going outside the box is not available either — the face
parks near a screen edge by default.

Fixes:

- **8 validated spots** in the three genuinely free lobes (top-left, top-right, bottom-left;
  bottom-right is the street sign). Found by search, not by eye, requiring ellipse metric
  ≥ 1.10 and the whole glyph box inside the frame.
- **`DRIFT_STEP = [0, 3, 5, 6]`** — pairwise distinct mod 8, so a 2-, 3- or 4-object parade
  never shares a spot. Same-lobe pairs sit 14.5+ units apart where two glyphs need 12.8.
- **`DRIFT_SCALE = [0.46, 0.52, 0.58]`** and **`DRIFT_EXTENT`** recording each glyph's true
  half-extent, so clearance is computed rather than assumed.
- Opacity 0.26 → 0.30.

New checks: *every drift object gets its own spot* (104 objects over 32 samples covering all
8 offsets × pools of 2/3/4) and *no drift object is buried in the face* (clearance floor
1.05). New tool `tools/check-drift.mjs` proves the layout statically.

Two findings recorded rather than hidden:

- **A newly truncated turn is agitated for its first 8 s**, so `overflowing` only starts
  drifting ~9 s into the hold. It is excluded from the placement sweep on purpose: sweeping
  it there would test the alarm, not the drift.
- **Holds are never sampled 1 s past a threshold.** The render clock refreshes on the 2 s
  tick, so it can sit a tick behind the timer clock; a 46 s sample of a 45 s gate fails for
  the lag. The sweep starts at 51 s.

## v21 — character pass

`d0b34025403c268a3a022cb6e7fbbf4986ae4e7ae90c64e1da94d60ca1ff0bdd` · 142,673 bytes ·
**101 checks**

Closes three of the five limitations recorded in `Stable 1/BASELINE.md`.

| Change | Why |
|---|---|
| **Idle blinking.** `BLINK_MS = 140`; the cycle is `3400 + (seed mod 5) * 620`, with a second cycle offset by `* 0.41` and stretched `* 3.17` so the rhythm is irregular. Derived from `Date.now()`, never scheduled, and suppressed while `arcOpacity >= 0.5` (an expression already owns the eyes). | A face that never closes its eyes reads as a doll. Baseline limitation #3. |
| **Line-weight hierarchy.** Head contour `2.8` against interior features `1.9`–`2.6`. | The silhouette should outrank the details. Baseline limitation #5. |
| **Negation-guarded praise.** `praiseHit()` rejects a praise word when `not / n't / no / never / hardly / barely` sits within the 14 characters before it. | `"this is not very good"` used to dress the companion up for an insult. Baseline limitation #2. |
| **Accessory exit animation.** Leaving adds `.dshcp-accout`; `wearAccessory` schedules a bump at `ms - 420` so the fade actually renders. | Accessories used to vanish between one frame and the next. |

New checks: *the face blinks on its own* (10/300 samples shut, 3.3%), *a shut lid never shows
the eyeball through it* (swept across 40 samples), *the silhouette outweighs the interior
lines*, *the accessory fades out before it goes*, *a negated compliment is not praise*.

### Trade-off accepted
The negation window is blunt, so the genuine `"I can't thank you enough"` is also rejected.
Reading an insult as praise was judged the worse error.

### Still open
- **Never mounted in a real browser.** Every check is static, structural or simulated. The
  first real page load remains the first true test.
- **`install.sh` has never been executed** — no bash on the machine that built it.
- Appearance, timing, feel, colour and taste are not measurable here and remain the user's call.

## v20 and earlier

Frozen in `Stable 1/` — `3581587084beccb0bc4acc813a4d046196f780fe5a23d2ff957715f954455226`,
140,561 bytes, 96 checks. That folder is the recovery point; it is not updated as work
continues, because a checkpoint that moves is not a checkpoint.
