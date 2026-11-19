/**
 * The site's first application: the home page, the demos, the guides and API
 * pages, and the 404. It holds the frame's state (the phone menu, the page's
 * light or dark), the home page's example tab, the code blocks' copy button and
 * the two primitives the Primitives overview runs. The component pages and the
 * theme creator are a second application (`main.ts`) that adds their state to
 * this one's, so a visitor to a guide loads none of their code.
 */
import * as UiDialog from '@foldkit/ui/dialog'
import { Effect, Equal, Match, Option, Queue, Schema, Stream } from 'effect'
import { Command, Dom, Subscription, Update } from 'foldkit'
import type { Document, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { Bundle } from 'foldkit-bundle'
import { Bundles, Sheet } from 'foldkit-mixins-ui'
import { chooseScheme, currentScheme } from 'foldkit-mixins/theme'
import { PrefersDark } from 'foldkit-primitives/media'
import { Timer } from 'foldkit-primitives/time'
import { SSR } from 'foldkit-ssr/client'
import { Projection, Surface } from 'foldkit-surface'

import { NARROW } from './breakpoints.js'
import { BLOG_DESCRIPTION, metaOf } from './blog/meta.js'
import { allSubsites } from './catalog.js'
import { COPY_ATTRIBUTE, EXPAND_ATTRIBUTE, MENU_ID, type Library } from './library.js'
import { Example, Page, PageScheme } from './page.js'
import { markSection, sections } from './spy.js'
import { Body } from './view/shellLayout.js'

// MODEL

/** The primitives the Primitives overview shows running: each a field of this Model. */
export const Dark = Bundle.declare(PrefersDark, 'dark')
export const Ticks = Bundle.declare(Timer, 'ticks')
/** The phone menu: a Sheet from the inline-start edge, holding the rail's contents. */
export const Menu = Bundle.declare(Bundles.Sheet, 'menu')

/** What the second application adds its own fields to. */
export const fields = {
  path: Schema.String,
  page: Page,
  example: Example,
  copied: Schema.Boolean,
  pageScheme: PageScheme,
  /** The section the reader is in, read from the scroll for the sidebar's links. */
  spied: Schema.Option(Schema.String),
  ...Dark.fields,
  ...Ticks.fields,
  ...Menu.fields,
}

export const Model = Schema.Struct(fields)
export type Model = typeof Model.Type

// MESSAGE

/** What the second application shares with this one: its Messages are these and more. */
export const cases = {
  ChoseMenuLink: { href: Schema.String },
  LeftMenu: {},
  ChoseExample: { example: Example },
  PressedCopy: { text: Schema.String },
  CopiedText: {},
  PressedCodeCopy: { index: Schema.Number },
  CopiedCode: {},
  PressedCodeToggle: { index: Schema.Number },
  ToggledCode: {},
  FailedToCopy: {},
  ChosePageScheme: { scheme: PageScheme },
  FoundPageScheme: { scheme: PageScheme },
  AppliedPageScheme: {},
  SpiedSection: { section: Schema.Option(Schema.String) },
  MarkedSection: {},
  ...Dark.cases,
  ...Ticks.cases,
  ...Menu.cases,
}

export const Message = defineMessageUnion(cases)
export type Message = typeof Message.Type

const Parent = Bundle.parent({ Model, Message })

export const placements = Parent.assemble(
  Parent.at(Dark),
  Parent.at(Ticks, { args: { intervalMs: 1000 } }),
  Parent.at(Menu, { args: { id: MENU_ID, side: 'left' }, onOut: Bundle.ignore }),
)

// COMMAND

/** The clipboard refuses outside a secure context, or when the reader denies it. */
export const writeClipboard = (text: string) =>
  Effect.tryPromise(() => navigator.clipboard.writeText(text))

export const CopyText = Command.define('CopyText', {
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

/**
 * Opens or closes the collapsed code block whose button is the `index`th on
 * the page. The block is in a static region, so its state is the attributes
 * the styles read (`data-collapsed` on the figure, `aria-expanded` on the
 * button) and the button's two labels, swapped where they stand; the focus
 * stays on the button because nothing is drawn again.
 */
export const ToggleCode = Command.define('ToggleCode', {
  args: { index: Schema.Number },
  messages: [Message.ToggledCode],
  execute: ({ index }) =>
    Effect.sync(() => {
      const button = document.querySelectorAll<HTMLElement>(`[${EXPAND_ATTRIBUTE}]`)[index]
      const figure = button?.closest('figure')
      if (button === undefined || figure === null || figure === undefined)
        return Message.ToggledCode()
      const open = button.getAttribute('aria-expanded') !== 'true'
      const shown = button.textContent
      button.setAttribute('aria-expanded', String(open))
      figure.dataset['collapsed'] = String(!open)
      button.textContent = button.dataset['toggledLabel'] ?? shown
      button.dataset['toggledLabel'] = shown ?? ''
      // A block that closes is shorter than the page was: keep its button in view.
      if (!open) button.scrollIntoView({ block: 'nearest' })
      return Message.ToggledCode()
    }),
})

/** What the open menu's history entry carries, which Back takes off instead of leaving the page. */
const MENU_ENTRY = 'foldkitPlusMenu'

const holdsMenuEntry = (): boolean => {
  const state: unknown = history.state
  return typeof state === 'object' && state !== null && MENU_ENTRY in state
}

/**
 * Goes where a link of the open menu leads. The menu holds a history entry
 * of its own, so the entry is taken off first: Back from the new page then
 * lands on the old one, not on the same page twice.
 */
export const LeaveMenu = Command.define('LeaveMenu', {
  args: { href: Schema.String },
  messages: [Message.LeftMenu],
  execute: ({ href }) =>
    Effect.callback<typeof Message.LeftMenu.Type>(resume => {
      const go = () => {
        location.assign(href)
        resume(Effect.succeed(Message.LeftMenu()))
      }
      if (!holdsMenuEntry()) return go()
      // A browser that never answers `history.back()` must not strand the link.
      const timer = setTimeout(go, 300)
      addEventListener(
        'popstate',
        () => {
          clearTimeout(timer)
          go()
        },
        { once: true },
      )
      history.back()
    }),
})

/** Applies the reader's scheme to the page and keeps it for the next visit. */
export const ApplyPageScheme = Command.define('ApplyPageScheme', {
  args: { scheme: PageScheme },
  messages: [Message.AppliedPageScheme],
  execute: ({ scheme }) => chooseScheme(scheme).pipe(Effect.as(Message.AppliedPageScheme())),
})

/** What the head script applied, read once the browser takes the page over. */
export const ReadPageScheme = Command.define('ReadPageScheme', {
  messages: [Message.FoundPageScheme],
  execute: Effect.sync(() => Message.FoundPageScheme({ scheme: currentScheme() })),
})

/** Marks the sidebar link of the section the reader is in, where the static region drew it. */
export const MarkSection = Command.define('MarkSection', {
  args: { section: Schema.Option(Schema.String) },
  messages: [Message.MarkedSection],
  execute: ({ section }) =>
    Effect.sync(() => {
      markSection(section)
      return Message.MarkedSection()
    }),
})

// UPDATE

type UpdateReturn = Update.Return<Model, Message>

/** What a placement's wrapper never reaches: the placements take theirs. */
export type OwnMessage = Bundle.OwnMessage<Message, typeof placements.placements>

/** The Messages both applications answer alike: the second hands them back to this. */
export const updateOwn = (model: Model, message: OwnMessage): UpdateReturn =>
  Match.valueTags(message, {
    ChoseMenuLink: ({ href }) => ({ model, commands: [LeaveMenu({ href })] }),
    LeftMenu: () => ({ model }),
    ChoseExample: ({ example }) =>
      example === model.example
        ? { model }
        : { model: modifyFields(model, { example: () => example }) },
    PressedCopy: ({ text }) => ({ model, commands: [CopyText({ text })] }),
    CopiedText: () => ({ model: modifyFields(model, { copied: () => true }) }),
    PressedCodeCopy: ({ index }) => ({ model, commands: [CopyCode({ index })] }),
    CopiedCode: () => ({ model }),
    PressedCodeToggle: ({ index }) => ({ model, commands: [ToggleCode({ index })] }),
    ToggledCode: () => ({ model }),
    FailedToCopy: () => ({ model }),
    ChosePageScheme: ({ scheme }) =>
      scheme === model.pageScheme
        ? { model }
        : {
            model: modifyFields(model, { pageScheme: () => scheme }),
            commands: [ApplyPageScheme({ scheme })],
          },
    FoundPageScheme: ({ scheme }) =>
      scheme === model.pageScheme
        ? { model }
        : { model: modifyFields(model, { pageScheme: () => scheme }) },
    AppliedPageScheme: () => ({ model }),
    SpiedSection: ({ section }) =>
      Equal.equals(section, model.spied)
        ? { model }
        : {
            model: modifyFields(model, { spied: () => section }),
            commands: [MarkSection({ section })],
          },
    MarkedSection: () => ({ model }),
  })

export const update = placements.update(updateOwn)

// SUBSCRIPTION

/** Which button carrying `attribute` a click landed on, counted in the page's order. */
const buttonIndexOf = (attribute: string, event: MouseEvent): Option.Option<number> => {
  const button = event.target instanceof Element ? event.target.closest(`[${attribute}]`) : null
  if (button === null) return Option.none()
  const index = Array.from(document.querySelectorAll(`[${attribute}]`)).indexOf(button)
  return index === -1 ? Option.none() : Option.some(index)
}

/** Which copy button a click landed on, counted in the page's order. */
export const codeCopyOf = (event: MouseEvent): Option.Option<Message> =>
  Option.map(buttonIndexOf(COPY_ATTRIBUTE, event), index => Message.PressedCodeCopy({ index }))

/** Which collapsed block's button a click landed on, counted in the page's order. */
export const codeToggleOf = (event: MouseEvent): Option.Option<Message> =>
  Option.map(buttonIndexOf(EXPAND_ATTRIBUTE, event), index => Message.PressedCodeToggle({ index }))

/** A code block's copy button, answered for the static region that drew it without a handler. */
export const codeCopy = Subscription.persistentEntry(
  Dom.streamFromEventFilterMap({
    target: () => document,
    type: 'click',
    filterMapEvent: codeCopyOf,
  }),
)

/** A collapsed code block's button, answered for the static region that drew it without a handler. */
export const codeToggle = Subscription.persistentEntry(
  Dom.streamFromEventFilterMap({
    target: () => document,
    type: 'click',
    filterMapEvent: codeToggleOf,
  }),
)

/** A plain click on a link of the open menu: the page is left once the menu's history entry is. */
export const menuLinkOf = (event: MouseEvent): Option.Option<Message> => {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
    return Option.none()
  const link =
    event.target instanceof Element ? event.target.closest(`#${MENU_ID}-panel a[href]`) : null
  return link instanceof HTMLAnchorElement &&
    link.target !== '_blank' &&
    !link.hasAttribute('download')
    ? Option.some(Message.ChoseMenuLink({ href: link.href }))
    : Option.none()
}

/** A link of the menu, led to by the page's script so the menu's history entry goes first. */
export const menuLinks = Subscription.persistentEntry(
  Dom.streamFromEventFilterMapPreventDefault({
    target: () => document,
    type: 'click',
    filterMapEvent: menuLinkOf,
  }),
)

const closeMenu = Message.GotMenuMessage({
  message: Sheet.Message.GotDialog({ message: UiDialog.Message.RequestedClose() }),
})

/**
 * While the menu is open: a history entry of its own, so Back closes it; and
 * a widened window closes it, since the rail it stands for is then drawn. The
 * entry is taken off when the menu closes any other way.
 */
const menuOpenEvents = Stream.callback<Message>(queue =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const close = () => Queue.offerUnsafe(queue, closeMenu)
      const narrow = matchMedia(NARROW)
      const widened = () => {
        if (!narrow.matches) close()
      }
      history.pushState({ [MENU_ENTRY]: true }, '')
      addEventListener('popstate', close)
      narrow.addEventListener('change', widened)
      return () => {
        removeEventListener('popstate', close)
        narrow.removeEventListener('change', widened)
        if (holdsMenuEntry()) history.back()
      }
    }),
    release => Effect.sync(release),
  ),
)

export const menuWatch = Subscription.make<Model, Message>()(entry => ({
  menuWatch: entry(
    { open: Schema.Boolean },
    {
      modelToDependencies: model => ({ open: Sheet.isOpen(model.menu) }),
      dependenciesToStream: ({ open }) => (open ? menuOpenEvents : Stream.empty),
    },
  ),
}))

/** The reader's place among the page's sections, restarted with each page so a new page starts unmarked. */
export const sectionSpy = Subscription.make<Model, Message>()(entry => ({
  sectionSpy: entry(
    { path: Schema.String },
    {
      modelToDependencies: model => ({ path: model.path }),
      dependenciesToStream: () =>
        sections.pipe(Stream.map(section => Message.SpiedSection({ section }))),
    },
  ),
}))

export const subscriptions = placements.subscriptions(
  Subscription.aggregate(
    Subscription.make<Model, Message>()(() => ({ codeCopy, codeToggle, menuLinks })),
    sectionSpy,
    menuWatch,
  ),
)

// INIT

/** The Model a page starts from, before the server names it. */
export const initial: Model = placements.initial({
  path: '/',
  page: Page.Missing(),
  example: 'view',
  copied: false,
  pageScheme: 'system',
  spied: Option.none(),
}).model

/** The page at `path`, as the library knows it; the browser never runs this. */
export const modelAt = (library: Library, path: string): Model =>
  modifyFields(initial, { path: () => path, page: () => library.pageAt(path) })

// SSR

const App = Surface.application({ Model, Message, initial, update })

/** A page of the component application, which this one is never given: a routing mistake, said loudly. */
const elsewhere = (page: string): never => {
  throw new Error(`the ${page} page is drawn by the component application, not this one`)
}

export const DESCRIPTION =
  'Ready-made patterns for Foldkit: server data, offline sync, routing, forms, a CMS and AI agents, as packages that keep their state in your Model. Less code to write, fewer tokens to spend.'

export const descriptionOf = (page: Page): string =>
  Page.match(page, {
    Home: () => DESCRIPTION,
    Demos: () => 'Examples from the Foldkit Plus repository, built as static files.',
    Components: () => elsewhere('Components'),
    Primitives: () => elsewhere('Primitives'),
    Component: () => elsewhere('Component'),
    Create: () => elsewhere('Create'),
    Doc: ({ description }) => (description === '' ? DESCRIPTION : description),
    Blog: () => BLOG_DESCRIPTION,
    Post: ({ description }) => description,
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
    local: [
      App.model.menu,
      App.model.example,
      App.model.copied,
      App.model.pageScheme,
      App.model.spied,
      App.model.dark,
      App.model.ticks,
    ],
    // The server cannot know a reader's scheme; the head script applied it.
    boot: () => [ReadPageScheme()],
    ...(withMeta
      ? {
          meta: (model: Model) =>
            Option.getOrElse(metaOf(model.page, ORIGIN), () => ({
              description: descriptionOf(model.page),
            })),
        }
      : {}),
  })

/** The plan the build generates pages with. */
export const plan = planOf(true)
/** The dev server's plan: it serves pages without a template head to write meta into. */
export const servingPlan = planOf(false)

// VIEW

/** Where the site is served: a canonical address starts here. */
export const ORIGIN = 'https://foldkit-plus.pages.dev'

export const titleOf = (page: Page): string =>
  Page.match(page, {
    Home: () => 'Foldkit Plus: ready-made patterns for Foldkit',
    Demos: () => 'Demos · Foldkit Plus',
    Components: () => elsewhere('Components'),
    Primitives: () => elsewhere('Primitives'),
    Component: () => elsewhere('Component'),
    Create: () => elsewhere('Create'),
    Doc: ({ subsite, title }) => {
      const family = allSubsites.find(each => each.id === subsite)
      return family === undefined || family.title === title
        ? `${title} · Foldkit Plus`
        : `${title} · ${family.title} · Foldkit Plus`
    },
    Blog: () => 'Blog · Foldkit Plus',
    Post: ({ title }) => `${title} · Foldkit Plus`,
    Missing: () => 'Not found · Foldkit Plus',
  })

export const viewWith =
  (library: Library) =>
  (model: Model, h: HtmlBuilder<Message>): Document => ({
    title: titleOf(model.page),
    canonical: `${ORIGIN}${model.path}`,
    body: Body({ model, library }, h),
  })
