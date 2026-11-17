/**
 * The browser's entry: the first application takes every page over except the
 * component pages and the theme creator, which the second takes (`main.ts`).
 * Each is a chunk of its own, so a guide loads none of the previews' code.
 */
import { isComponentPath } from './paths.js'

await (isComponentPath(location.pathname) ? import('./entryGallery.js') : import('./entryShell.js'))
