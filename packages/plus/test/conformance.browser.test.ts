/**
 * The suite with Foldkit's runtime in Chromium as the reference, against
 * Scene: what jsdom lays out or serializes differently cannot hide a
 * disagreement. The server drawer runs in `conformance.test.ts`; it reads no
 * DOM of its own.
 */
import { runtime, scene } from './conformance/drawers.js'
import { conformanceSuite } from './conformance/suite.js'

conformanceSuite({ reference: runtime, live: [scene], static: [] })
