/**
 * The frame of the first application: the home page, the demos, the guides
 * and API pages, and the 404.
 */
import type { HtmlBuilder } from 'foldkit/html'
import { type SlotBuilders } from 'foldkit-mixins'
import { SSR } from 'foldkit-ssr/client'

import type { Library } from '../library.js'
import { Page } from '../page.js'
import { Message, type Model } from '../shell.js'
import type { SiteStyle } from '../style.js'
import { demosPage } from './demos.js'
import { docPage } from './doc.js'
import { frame, missing } from './frame.js'
import { homeContents, homePage } from './home.js'

export type Slots = SlotBuilders<typeof SiteStyle.slots, Message>
export type H = HtmlBuilder<Message>

export interface Input {
  readonly model: Model
  readonly library: Library
}

const shellFrame = frame<Message>({
  menu: message => Message.GotMenuMessage({ message }),
  chosePageScheme: scheme => Message.ChosePageScheme({ scheme }),
})

/** A page of the other application, which this one is never given: a routing mistake, said loudly. */
const elsewhere = (path: string): never => {
  throw new Error(`${path} is drawn by the component application, not this one`)
}

/**
 * What the rail holds, and what the phone menu holds in its place: the same,
 * but for the doc sidebar, a static region (drawn once, so the menu has one
 * of its own) whose pages the menu folds by package.
 */
const contentsOf =
  (model: Model, library: Library, region: 'rail' | 'menu') => (slots: Slots, h: H) =>
    Page.match(model.page, {
      Home: () => homeContents(slots, h),
      Demos: () => [
        h.p(slots.railNote.attrs(), [
          'Built as static files.',
          h.br([]),
          'Servers run in your browser.',
        ]),
      ],
      Doc: () => [
        h.nav(slots.sidebar.attrs([h.AriaLabel('Documentation')]), [
          region === 'rail'
            ? SSR.static('sidebar', library.sidebar(model.path))
            : SSR.static('menu-sidebar', library.menuSidebar(model.path)),
        ]),
      ],
      Missing: () => [],
      Components: () => elsewhere(model.path),
      Primitives: () => elsewhere(model.path),
      Component: () => elsewhere(model.path),
      Create: () => elsewhere(model.path),
    })

export const Body = ({ model, library }: Input, h: H) =>
  shellFrame(
    {
      model,
      rail: contentsOf(model, library, 'rail'),
      menu: contentsOf(model, library, 'menu'),
      page: (slots, h) =>
        Page.match(model.page, {
          Home: () => homePage(model, library, slots, h),
          Demos: () => demosPage(slots, h),
          Doc: () => docPage(model, library, slots, h),
          Missing: () => missing(model, slots, h),
          Components: () => elsewhere(model.path),
          Primitives: () => elsewhere(model.path),
          Component: () => elsewhere(model.path),
          Create: () => elsewhere(model.path),
        }),
    },
    h,
  )
