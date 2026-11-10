/**
 * The browser's entry under the loader (#472), built with
 * `DOMAINS_PLUS_LOADER=1`: the page loads this and nothing of Effect, Foldkit
 * or the app, and `entry.ts` runs when the plan's `start` says, the browser
 * idle or a person about to press. Until then a press on a cart form is held
 * and answered once the runtime runs, or posted after 3 s.
 */
import { load } from 'foldkit-ssr/loader'

load({ runtime: () => import('./entry.js') })
