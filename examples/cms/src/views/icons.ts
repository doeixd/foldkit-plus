/**
 * The studio's icons: line drawings on a 24-unit grid, stroked in the text's
 * color, from the Lucide set (ISC), generated into `iconData.ts` by
 * `pnpm icons` from `icons.json`. Decorative: each is hidden from assistive
 * technology, so the words beside it are what is read.
 */
import type { Html, HtmlBuilder } from 'foldkit/html'
import { Icon } from 'foldkit-media'
import { icons, type IconName } from './iconData.js'

export type { IconName }

/**
 * An icon as a CSS `url(…)`, for markup a package draws, where a view cannot
 * add an element: a Style masks it over the text's color.
 */
export const iconUrl = (name: IconName): string => Icon.maskUrl(icons[name])

export const icon = <M>(h: HtmlBuilder<M>, name: IconName, size = 16): Html =>
  Icon.draw(icons[name], h, { size: `${size}px` })
