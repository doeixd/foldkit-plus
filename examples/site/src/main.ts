/**
 * The website: a home page, the demos, and a subsite of guides and API pages
 * per package family, every page rendered at build time and taken over in the
 * browser. Links are ordinary links, so a page is a new document; the Model
 * holds what a page is called and the little the browser changes on it: the
 * menu on a phone and which example the home page shows.
 */
import { Effect, Option, Schema } from 'effect'
import { Command, Subscription, type Update } from 'foldkit'
import type { Document, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { defineTaggedUnion } from 'foldkit/schema'
import { modifyFields } from 'foldkit/struct'
import { SSR } from 'foldkit-ssr/client'
import { Projection, Surface } from 'foldkit-surface'

import { allSubsites } from './catalog.js'
import { COPY_ATTRIBUTE, type Library } from './library.js'
import { Body } from './view/layout.js'

// MODEL

/** What the page at an address is, as much as the browser needs to know. */
export const Page = defineTaggedUnion({
  Home: {},
  Demos: {},
  Doc: { subsite: Schema.String, title: Schema.String, description: Schema.String },
  Missing: {},
})
export type Page = typeof Page.Type

export const Example = Schema.Literals(['view', 'agent', 'sync', 'mirror'])
export type Example = typeof Example.Type

export const Model = Schema.Struct({
  path: Schema.String,
  page: Page,
  menuOpen: Schema.Boolean,
  example: Example,
  copied: Schema.Boolean,
})
export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  ToggledMenu: {},
  ChoseExample: { example: Example },
  PressedCopy: { text: Schema.String },
  CopiedText: {},
  PressedCodeCopy: { index: Schema.Number },
  CopiedCode: {},
  FailedToCopy: {},
})
export type Message = typeof Message.Type

// COMMAND

/** The clipboard refuses outside a secure context, or when the reader denies it. */
const writeClipboard = (text: string) =>
  Effect.tryPromise(() => navigator.clipboard.writeText(text))

const CopyText = Command.define('CopyText', {
  args: { text: Schema.String },
  messages: [Message.CopiedText, Message.FailedToCopy],
  execute: ({ text }) =>
    writeClipboard(text).pipe(
      Effect.as(Message.CopiedText()),
      Effect.orElseSucceed(() => Message.FailedToCopy()),
    ),
})

/**
 * Copies the code of the code block whose button is the `index`th on the
 * page, and marks the button done. The block is in a static region, which
 * the browser never draws again, so the button is marked where it stands.
 */
export const CopyCode = Command.define('CopyCode', {
  args: { index: Schema.Number },
  messages: [Message.CopiedCode, Message.FailedToCopy],
  execute: ({ index }) =>
    Effect.gen(function* () {
      const button = document.querySelectorAll<HTMLElement>(`[${COPY_ATTRIBUTE}]`)[index]
      const code = button?.closest('figure')?.querySelector('pre code')?.textContent
      if (button === undefined || code === undefined || code === null) return Message.FailedToCopy()
      yield* writeClipboard(code)
      button.dataset['copied'] = 'true'
      button.textContent = 'Copied'
      return Message.CopiedCode()
    }).pipe(Effect.orElseSucceed(() => Message.FailedToCopy())),
})

// UPDATE

type UpdateReturn = Update.Return<Model, Message>

export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    ToggledMenu: () => ({ model: modifyFields(model, { menuOpen: open => !open }) }),
    ChoseExample: ({ example }) =>
      example === model.example
        ? { model }
        : { model: modifyFields(model, { example: () => example }) },
    PressedCopy: ({ text }) => ({ model, commands: [CopyText({ text })] }),
    CopiedText: () => ({ model: modifyFields(model, { copied: () => true }) }),
    PressedCodeCopy: ({ index }) => ({ model, commands: [CopyCode({ index })] }),
    CopiedCode: () => ({ model }),
    FailedToCopy: () => ({ model }),
  })

// SUBSCRIPTION

/** Which copy button a click landed on, counted in the page's order. */
export const codeCopyOf = (event: MouseEvent): Option.Option<Message> => {
  const button =
    event.target instanceof Element ? event.target.closest(`[${COPY_ATTRIBUTE}]`) : null
  if (button === null) return Option.none()
  const index = Array.from(document.querySelectorAll(`[${COPY_ATTRIBUTE}]`)).indexOf(button)
  return index === -1 ? Option.none() : Option.some(Message.PressedCodeCopy({ index }))
}

/** A code block's copy button, answered for the static region that drew it without a handler. */
export const subscriptions = Subscription.make<Model, Message>()(() => ({
  codeCopy: Subscription.persistent(
    Subscription.fromEventFilterMap({
      target: () => document,
      type: 'click',
      filterMapEvent: codeCopyOf,
    }),
  ),
}))

// INIT

/** The Model a page starts from, before the server names it. */
export const initial: Model = {
  path: '/',
  page: Page.Missing(),
  menuOpen: false,
  example: 'view',
  copied: false,
}

/** The page at `path`, as the library knows it; the browser never runs this. */
export const modelAt = (library: Library, path: string): Model =>
  modifyFields(initial, { path: () => path, page: () => library.pageAt(path) })

// SSR

const App = Surface.application({ Model, Message, initial, update })

const DESCRIPTION =
  'Ready-made patterns for Foldkit: server data, offline sync, routing, forms, a CMS and AI agents, as packages that keep their state in your Model. Less code to write, fewer tokens to spend.'

const descriptionOf = (page: Page): string =>
  Page.match(page, {
    Home: () => DESCRIPTION,
    Demos: () => 'Examples from the Foldkit Plus repository, built as static files.',
    Doc: ({ description }) => (description === '' ? DESCRIPTION : description),
    Missing: () => DESCRIPTION,
  })

/**
 * The address and what the page is cross to the browser; the menu, the
 * example and the copy state start from `initial`. The guides, the API and the
 * sidebars are static regions, rendered on the server only.
 */
const planOf = (withMeta: boolean) =>
  SSR.plan(App, {
    id: 'site',
    state: Projection.pick(App.model.path, App.model.page),
    local: [App.model.menuOpen, App.model.example, App.model.copied],
    ...(withMeta ? { meta: (model: Model) => ({ description: descriptionOf(model.page) }) } : {}),
  })

/** The plan the build generates pages with. */
export const plan = planOf(true)
/** The dev server's plan: it serves pages without a template head to write meta into. */
export const servingPlan = planOf(false)

// VIEW

/** Where the site is served: a canonical address starts here. */
export const ORIGIN = 'https://foldkit-plus.pages.dev'

const titleOf = (page: Page): string =>
  Page.match(page, {
    Home: () => 'Foldkit Plus: ready-made patterns for Foldkit',
    Demos: () => 'Demos · Foldkit Plus',
    Doc: ({ subsite, title }) => {
      const family = allSubsites.find(each => each.id === subsite)
      return family === undefined || family.title === title
        ? `${title} · Foldkit Plus`
        : `${title} · ${family.title} · Foldkit Plus`
    },
    Missing: () => 'Not found · Foldkit Plus',
  })

export const viewWith =
  (library: Library) =>
  (model: Model, h: HtmlBuilder<Message>): Document => ({
    title: titleOf(model.page),
    canonical: `${ORIGIN}${model.path}`,
    body: Body({ model, library }, h),
  })
