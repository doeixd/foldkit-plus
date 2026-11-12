/**
 * The page sheet's text, for `foldkit-mixins/vite`, which writes it as the file
 * the page links. Kept out of the browser's modules: reading it builds every token.
 */
import { stylesheet } from './appStyle.js'
// Its Styles' classes, which `Style.complete` adds to the sheet once loaded.
import './style.js'

export { stylesheet }
