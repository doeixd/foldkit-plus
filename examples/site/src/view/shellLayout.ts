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
  toggledMenu: () => Message.ToggledMenu(),
  chosePageScheme: scheme => Message.ChosePageScheme({ scheme }),
})

/** A page of the other application, which this one is never given: a routing mistake, said loudly. */
const elsewhere = (path: string): never => {
  throw new Error(`${path} is drawn by the component application, not this one`)
}

export const Body = ({ model, library }: Input, h: H) =>
  shellFrame(
    {
      model,
      rail: (slots, h) =>
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
              SSR.static('sidebar', library.sidebar(model.path)),
            ]),
          ],
          Missing: () => [],
          Components: () => elsewhere(model.path),
          Primitives: () => elsewhere(model.path),
          Component: () => elsewhere(model.path),
          Create: () => elsewhere(model.path),
        }),
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
