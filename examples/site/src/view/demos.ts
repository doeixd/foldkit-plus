/** The demos page: the list the home page ends with, on a page of its own. */
import type { Html } from 'foldkit/html'

import { demoRows } from './home.js'
import type { H, Slots } from './layout.js'

export const demosPage = (slots: Slots, h: H): ReadonlyArray<Html> => [
  h.section(slots.hero.attrs(), [
    h.h1(slots.heroTitle.attrs(), [
      'Demos. ',
      h.span(slots.quiet.attrs(), ['Each a working example.']),
    ]),
    h.p(slots.lede.attrs(), [
      'Examples from the repository, built as static files. Those with a server run it in your browser, shared by every tab, so nothing you do leaves it. Each says how to try it in its corner.',
    ]),
  ]),
  demoRows(slots, h),
]
