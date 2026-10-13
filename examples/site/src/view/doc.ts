/**
 * A guide or API page: the article and its "On this page", both rendered by
 * the build into static regions. The browser adopts them as they are. The
 * Primitives overview draws live primitives between its article and pager.
 */
import type { Html } from 'foldkit/html'
import { SSR } from 'foldkit-ssr/client'

import type { Library } from '../library.js'
import type { Model } from '../main.js'
import type { H, Slots } from './layout.js'
import { LIVE_PATH, livePrimitives } from './live.js'

export const docPage = (
  model: Model,
  library: Library,
  slots: Slots,
  h: H,
): ReadonlyArray<Html> => [
  h.div(slots.doc.attrs(), [
    h.article(slots.article.attrs(), [
      SSR.static('article', library.article(model.path)),
      ...(model.path === LIVE_PATH ? [livePrimitives(model, slots, h)] : []),
      SSR.static('pager', library.pager(model.path)),
    ]),
    h.aside(slots.outline.attrs([h.AriaLabel('On this page')]), [
      SSR.static('outline', library.outline(model.path)),
    ]),
  ]),
]
