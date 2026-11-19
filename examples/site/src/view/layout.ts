/**
 * The frame of the second application: the component pages, the theme
 * creator, and the 404 an unknown component gets.
 */
import { Option } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { type SlotBuilders } from 'foldkit-mixins'

import { showcaseOf } from '../gallery/showcases.js'
import type { Library } from '../library.js'
import { Message, type Model } from '../main.js'
import { Page } from '../page.js'
import type { SiteStyle } from '../style.js'
import { componentPage, componentsContents, componentsPage } from './components.js'
import { createPage } from './create.js'
import { primitivesContents, primitivesPage } from './primitives.js'
import { frame, missing } from './frame.js'

export type Slots = SlotBuilders<typeof SiteStyle.slots, Message>
export type H = HtmlBuilder<Message>

export interface Input {
  readonly model: Model
  readonly library: Library
}

const galleryFrame = frame<Message>({
  menu: message => Message.GotMenuMessage({ message }),
  chosePageScheme: scheme => Message.ChosePageScheme({ scheme }),
})

/** A page of the other application, which this one is never given: a routing mistake, said loudly. */
const elsewhere = (path: string): never => {
  throw new Error(`${path} is drawn by the guides application, not this one`)
}

export const Body = ({ model, library }: Input, h: H) =>
  galleryFrame(
    {
      model,
      rail: (slots, h) =>
        Page.match(model.page, {
          Components: () => componentsContents(model.path, slots, h),
          Primitives: () => primitivesContents(slots, h),
          Component: () => componentsContents(model.path, slots, h),
          Create: () => componentsContents(model.path, slots, h),
          Missing: () => [],
          Home: () => elsewhere(model.path),
          Demos: () => elsewhere(model.path),
          Doc: () => elsewhere(model.path),
          Blog: () => elsewhere(model.path),
          Post: () => elsewhere(model.path),
        }),
      page: (slots, h) =>
        Page.match(model.page, {
          Components: () => componentsPage(model, slots, h),
          Primitives: () => primitivesPage(model, library, slots, h),
          Component: ({ slug }) =>
            Option.match(showcaseOf(slug), {
              onNone: () => missing(model, slots, h),
              onSome: showcase => componentPage(model, showcase, library, slots, h),
            }),
          Create: () => createPage(model, slots, h),
          Missing: () => missing(model, slots, h),
          Home: () => elsewhere(model.path),
          Demos: () => elsewhere(model.path),
          Doc: () => elsewhere(model.path),
          Blog: () => elsewhere(model.path),
          Post: () => elsewhere(model.path),
        }),
    },
    h,
  )
