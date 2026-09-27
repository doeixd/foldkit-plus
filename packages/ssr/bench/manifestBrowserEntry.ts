/** `timeOnPage`, for the page Chromium has loaded: bundled by `manifestBrowser.ts`. */
import { timeOnPage } from './manifestApp.js'

Object.assign(globalThis, { timeOnPage: () => timeOnPage(document) })
