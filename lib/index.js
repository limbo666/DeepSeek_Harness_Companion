/**
 * Host half of the companion face.
 *
 * The companion is entirely a browser surface, so this half intentionally
 * contributes nothing: it exists so the profile row activates and the node half
 * of the client-module system (`@deepseek-ai/dsh-client-modules`) can scan this
 * package for its `dsh.client` declaration and serve `lib/client.js` to the page.
 *
 * The row must reach an active fiber for the scan to include it, which is why
 * `apply` is a real (if empty) function rather than a missing export.
 */

export const name = 'dsh-companion-face'

/** No host-side behaviour: every side effect lives in lib/client.js. */
export function apply() {}
