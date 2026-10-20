/**
 * What every page runs in its head, before any stylesheet draws: the reader's
 * light or dark, and the knobs of the theme they made, on the previews. The
 * build writes it through `site.ts`'s `head`, and the dev server through
 * `vite.config.ts`, so development serves the same first frame.
 */
import { schemeScript, Theme } from 'foldkit-mixins/theme'

import { knobsPlace } from './gallery/theme.js'

export const headScripts = `<script>${schemeScript()}</script><script>${Theme.knobScript(knobsPlace)}</script>`
