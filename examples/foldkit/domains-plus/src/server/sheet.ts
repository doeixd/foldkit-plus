/**
 * The page sheet's text, for the server and for `foldkit-mixins/vite`, which
 * writes it as the file the pages link. Kept out of the browser's modules:
 * reading it builds every token (#487's prune runs over it too).
 */
import { app } from '../client/appStyle.js'
// Its Slots' classes, which `Style.complete` adds to the sheet once loaded.
import '../client/style.js'

export const stylesheet = app.stylesheet
