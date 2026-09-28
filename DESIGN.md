# Design review — the face, and what was wrong with it

A professional pass over the character as it actually draws, not as the source reads.
Everything below is either measured or reproducible with the tools in `tools/`.

## How this was reviewed

`node tools/...` and the harness can prove behaviour; none of them can judge appearance. So
the face is now **drawn**: `SHEET_DIR=<dir> node verify.mjs` serializes the rendered SVG
straight out of the component tree and rasterizes a contact sheet of twelve moods.

```bash
cd companion-face
SHEET_DIR=../dist/renders SHEET_NAME=face-after.png node verify.mjs
BUNDLE="../Stable 1/companion-face/lib/client.js" SHEET_DIR=../dist/renders SHEET_NAME=face-before.png node verify.mjs
```

`BUNDLE` drives the same harness against the frozen v20 tree without touching it, so the
before/after is rendered by one tool from two bundles. Caveat: the rasterizer ignores CSS
animations, so particle fields appear at resting opacity and look stronger than they do live.

## The verdict

The drawing was competent and the **materials were wrong**. Three findings, in order of how
much damage they did.

### 1. Three of the four materials followed the shell theme; the skin did not

`--dsw-alias-label-primary` is defined twice in the shell — `neutral-bluish-1000` for the
light theme and `neutral-bluish-50` for the dark one, swapped under `.dark`. The ink, the
sclera and the contour all read that token. The skin is a **fixed** `#ffffff → #e9eef6`.

So in the dark theme the face inverted against itself: near-white brows, mouth, lids and
pupils drawn on a near-white head, with a dark sclera behind them. Not a subtle theme
mismatch — the face basically disappears.

This is the kind of fault that survives a lot of testing, because every behavioural check
passes: the mood is right, the classes are right, the geometry is right. Only drawing it
shows it.

**Fixed** by making the face self-contained. Skin, ink and contour are literal; colour is
one accent per mood. The bubble, chip and sign post still read tokens, because they are
chrome sitting on the shell. A new check walks the rendered tree and fails if any paint in
the face contains `var(--dsw-alias`.

### 2. The outline was the heaviest line in the drawing and did no work

Contour `#cfd4dc` on a head whose darkest tone is `#e9eef6` — a contrast ratio of **1.26:1**.
Invisible. Meanwhile it was 2.8 wide, heavier than the mouth and the eye arcs at 2.6, so the
one element supposed to define the silhouette was simultaneously the faintest and the
thickest. That is what "the design has some flow there" looks like from the outside: weight
with no contrast reads as a wobble rather than an edge.

**Fixed** by inverting it: the contour is now **thinner** (2.0) and **visible**
(7.71:1 against the skin). A dark thin line is crisper than a pale thick one and lets the
accent colours carry the character. The whole line system is now explicit rather than
accreted:

| Tier | Element | Weight |
|---|---|---|
| Contour | head silhouette | 2.0 |
| Features | mouth, eye arcs | 1.7 |
| | upper lash line | 1.35 |
| | sclera | 1.25 |
| Detail | iris ring | 1.0 |
| Mass | brows (filled), open mouth | heaviest by area, deliberately |

Mass is allowed to outrank line — that is normal for a character — but no interior *stroke*
may exceed the contour, and the harness now asserts it.

### 3. A perfect circle hid behind a rounded square

The mood colour was a filled circle of radius 46 behind a blob whose own half-width is 43
and half-height 41. So the tint showed as a **thick band down the sides, nothing at the
corners**, and read as a second outline disagreeing with the first.

**Fixed** by replacing it with a rim: the mood colour stroked along a 1.055× copy of the
head path. An even band all the way round by construction, and it rides every morph — squash,
melt, corner change — for free, because it is the same function.

## Braver colour: 7 shared tokens became 36 accents

Eight different working states were all the same blue. Now every mood has its own accent, and
the colour is spent where it reads as *light around the character* rather than as a wash on
top of it:

- the **rim**, whose width and opacity ride the ambient richness value
- the **glow** behind the head
- the **cheeks**
- the **irises** — previously `rgba(11,16,32,.22)`, a grey ghost doing nothing
- the **pupils**, deepened from the accent
- the **contour** itself, tinted 34% toward the accent, which is what makes a coloured face
  read as illustration rather than as a grey face with coloured lighting next to it
- the **deepest skin stop**, tinted 16% — the difference between a coloured face and a grey
  one standing near colour

Two live modulations stop it being a flat fill:

- a **±12° hue drift** on a ~56 s cycle while a mood is held, so a long state breathes
- a **+28° lurch on a poke**, so touching the face answers back in colour

The mood wash *on* the head was cut to 62% of its former strength: the colour moved outward,
where it belongs, instead of muddying the skin.

Palette construction, and why it is not evenly spaced: an even 10° wheel made the seven
green/teal working states near-identical — the old problem relocated. Hues are grouped by
family instead, and the warm band (18–115°) is held under L 0.545 because golds and yellows,
and only golds and yellows, wash out on an off-white face. Measured result: **36 distinct
accents, minimum 1.62:1 against the skin, minimum 4.37:1 against a near-black page.** Both
bounds are asserted.

## What is still a matter of taste, not measurement

The harness cannot judge these and neither can the numbers:

- whether the thinner, darker contour is the right *style* — it moves the face from soft clay
  toward flat illustration, which is a real change in character
- the rim width range (`4 + 22 × ring`, i.e. 5.8 to 17.2 units)
- the 28° poke lurch, which is the boldest single decision here
- the family-to-hue assignments: lime for `firstContact`, rose for `realigning`

Open `dist/renders/face-before.png` and `face-after.png` side by side and judge those
directly.

## The balloon is a label, except when it is a voice

Every caption the face produces is a label: one line, `white-space:nowrap`, clipped with an
ellipsis, up to 230 px. That is correct for *"Searching…"*, *"Approve pwsh?"* and *"Writing
files…"* — they are statuses, and a status that wraps to two lines is a status you have to read
twice.

Idle sayings are not statuses, and the label treatment fails them in a specific, visible way: a
proverb clipped to *"A watched process never fini…"* keeps the shape of a sentence and loses the
sentence, which reads as a rendering fault rather than as brevity. So sayings get one modifier
class — `white-space:normal`, centred, italic, `max-width:212px` (narrower than the caption
maximum, so a long line breaks into three balanced rows instead of one wide bar) — and nothing
else about the balloon changes: same box, same padding, same border, same pop animation, same
click-to-reset.

The italic is doing real work rather than decorating: it is the only typographic signal in the
plugin, and it is what separates *the companion is reporting something* from *the companion is
thinking out loud* without adding a second visual object to the frame.
