/**
 * Effect-placement checker.
 *
 * The head is an ellipse (HEAD_CX, HEAD_CY, rx 43, ry 41) inside the 100x100
 * viewBox. An effect particle that lands inside it reads as a blemish ON the
 * face rather than light AROUND it, which is exactly the bug this guards.
 *
 * A particle is clear when the point of its circle nearest the head centre is
 * still outside the ellipse. Fields that travel (rise, fall, float) are checked
 * along their whole animation path, and rotating fields (orbit, swirl) are
 * checked at every angle, because their particles sweep a full ring.
 *
 * Usage: node companion-face/tools/check-fx.mjs
 */
const HEAD = { cx: 50, cy: 52, rx: 43, ry: 41 }

/** Ellipse metric: < 1 inside the head, > 1 outside. */
function metric(x, y) {
  return Math.pow((x - HEAD.cx) / HEAD.rx, 2) + Math.pow((y - HEAD.cy) / HEAD.ry, 2)
}

/** The point of a radius-r particle that reaches closest to the head centre. */
function nearestPoint(x, y, r) {
  const vx = HEAD.cx - x
  const vy = HEAD.cy - y
  const len = Math.sqrt(vx * vx + vy * vy) || 1
  return [x + (vx / len) * r, y + (vy / len) * r]
}

/** Worst (smallest) metric along a particle's travel. */
function worstAlongPath(x, y, r, travelY) {
  let worst = Infinity
  for (let t = 0; t <= 1.0001; t += 0.02) {
    const [px, py] = nearestPoint(x, y + travelY * t, r)
    worst = Math.min(worst, metric(px, py))
  }
  return worst
}

/** Worst metric for a rotating field: sample every angle of the swept ring. */
function worstOnRing(rx, ry, r) {
  let worst = Infinity
  for (let a = 0; a < Math.PI * 2; a += 0.02) {
    const [px, py] = nearestPoint(HEAD.cx + Math.cos(a) * rx, HEAD.cy + Math.sin(a) * ry, r)
    worst = Math.min(worst, metric(px, py))
  }
  return worst
}

const FIELDS = {
  stardust: { travel: 0, points: [[30, 4], [96, 38], [20, 92], [68, 3], [8, 74], [97, 58], [40, 97], [88, 16], [12, 17], [60, 98], [4, 38], [48, 0]], radii: [1.4, 1.2, 1.5, 1.1, 1.3, 1.6, 1.2, 1.4, 1.1, 1.3, 1.5, 1.2], radiusScale: 1.15 },
  bubbles: { travel: -24, points: [[8, 98], [92, 98], [4, 88], [96, 84]], radii: [2.9, 2.9, 2.0, 2.0], radiusScale: 1 },
  embers: { travel: -24, points: [[3, 88], [3, 70], [97, 86], [97, 68], [7, 96], [93, 96]], radii: [1.6, 2.1, 1.6, 2.1, 2.6, 2.6], radiusScale: 1 },
  confetti: { travel: 22, points: [[4, 4], [8, 0], [14, 0], [86, 0], [92, 0], [96, 4]], radii: [2.6, 2.6, 2.6, 2.6, 2.6, 2.6], radiusScale: 1 },
  codeflow: { travel: 22, points: [[2, 0], [6, 6], [10, 0], [90, 0], [94, 6], [98, 0]], radii: [2.3, 2.3, 2.3, 2.3, 2.3, 2.3], radiusScale: 1 },
  hearts: { travel: -17, points: [[14, 14], [86, 14], [50, -4]], radii: [7, 7, 7], radiusScale: 1 },
  sparkle: { travel: 0, points: [[10, 2], [90, 2], [10, 96], [90, 96]], radii: [9, 9, 9, 9], radiusScale: 1 },
  dots: { travel: 0, points: [[72, 11], [81, 6], [90, 1]], radii: [3, 3, 3], radiusScale: 1 },
  sweat: { travel: 13, points: [[97, 12]], radii: [8], radiusScale: 1 },
  halo: { travel: 0, points: [[50, 4]], radii: [5], radiusScale: 1 },
  zzz: { travel: -16, points: [[80, 4], [89, -2]], radii: [7, 5], radiusScale: 1 },
}

const RINGS = { orbit: [52, 52, 3.6], swirl: [48, 46, 2.8], starsInner: [54, 54, 9], starsOuter: [58, 50, 6.3] }

let bad = 0
for (const [name, field] of Object.entries(FIELDS)) {
  let worst = Infinity
  let worstAt = null
  field.points.forEach((p, i) => {
    const r = (field.radii[i % field.radii.length]) * (field.radiusScale || 1)
    const value = worstAlongPath(p[0], p[1], r, field.travel)
    if (value < worst) { worst = value; worstAt = p }
  })
  const ok = worst > 1
  if (!ok) bad += 1
  console.log(`${ok ? 'ok  ' : 'BAD '} ${name.padEnd(10)} worst metric ${worst.toFixed(3)} at [${worstAt}]`)
}

for (const [name, ring] of Object.entries(RINGS)) {
  const worst = worstOnRing(ring[0], ring[1], ring[2])
  const ok = worst > 1
  if (!ok) bad += 1
  console.log(`${ok ? 'ok  ' : 'BAD '} ${name.padEnd(10)} ring ${ring[0]}x${ring[1]} worst metric ${worst.toFixed(3)}`)
}

console.log(bad === 0 ? '\nall fields clear the face' : `\n${bad} field(s) still overlap the face`)
process.exit(bad === 0 ? 0 : 1)
