/**
 * The website: a home page, the demos, and a subsite of guides and API pages
 * per package family, every page rendered at build time and taken over in the
 * browser. Links are ordinary links, so a page is a new document; the Model
 * holds what a page is called and the little the browser changes on it: the
 * menu on a phone, which example the home page shows, the two primitives
 * the Primitives overview runs in the page, and what a reader sets on the
 * component pages: a variant, a preview's state, and `/create`'s knobs.
 */
import { Effect, Match, Option, Schema } from 'effect'
import { Command, Dom, Subscription, Update } from 'foldkit'
import type { Document, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { defineTaggedUnion } from 'foldkit/schema'
import { modifyFields } from 'foldkit/struct'
import { Bundle } from 'foldkit-bundle'
import { chooseScheme, currentScheme, type Scheme as ThemeScheme } from 'foldkit-mixins/theme'
import { PrefersDark } from 'foldkit-primitives/media'
import { Timer } from 'foldkit-primitives/time'
import { SSR } from 'foldkit-ssr/client'
import { Projection, Surface } from 'foldkit-surface'

import { Listbox as UiListbox, Tabs as UiTabs } from '@foldkit/ui'

import { allSubsites } from './catalog.js'
import { showcaseOf } from './gallery/showcases.js'
import {
  Picker,
  PickerBox,
  Pickers,
  SectionTabs,
  initialPickers,
  initialTabs,
  pickedKnobs,
} from './gallery/studio.js'
import * as Widgets from './gallery/widgets.js'
import {
  Direction,
  Knob,
  Knobs,
  Scheme,
  Section,
  defaults as defaultKnobs,
  fit,
  ranges,
  sameKnobs,
  shuffled,
} from './gallery/theme.js'
import { COPY_ATTRIBUTE, type Library } from './library.js'
import { Body } from './view/layout.js'

// MODEL

/** What the page at an address is, as much as the browser needs to know. */
export const Page = defineTaggedUnion({
  Home: {},
  Demos: {},
  Components: {},
  Component: { slug: Schema.String },
  Create: {},
  Doc: { subsite: Schema.String, title: Schema.String, description: Schema.String },
  Missing: {},
})
export type Page = typeof Page.Type

export const Example = Schema.Literals(['view', 'agent', 'sync', 'mirror'])
export type Example = typeof Example.Type

/** The page's own light or dark, which the head script applied before the first paint. */
export const PageScheme: Schema.Codec<ThemeScheme> = Schema.Literals(['system', 'light', 'dark'])

/** The primitives the Primitives overview shows running: each a field of this Model. */
const Dark = Bundle.declare(PrefersDark, 'dark')
const Ticks = Bundle.declare(Timer, 'ticks')

export const Model = Schema.Struct({
  path: Schema.String,
  page: Page,
  menuOpen: Schema.Boolean,
  example: Example,
  copied: Schema.Boolean,
  /** The variant picked on a component's page, by axis. */
  selection: Schema.Record(Schema.String, Schema.String),
  /** What the previews' own controls hold. */
  switched: Schema.Boolean,
  /** The card chosen in the card group's preview, by key. */
  chosenCard: Schema.String,
  cardDismissed: Schema.Boolean,
  /** The previews with state of their own: tabs, a dialog, a slider and the rest. */
  widgets: Widgets.Model,
  knobs: Knobs,
  /** The pane of knobs `/create` shows, and the tabs that pick it. */
  section: Section,
  sectionTabs: UiTabs.Model,
  /** The Listboxes of the knobs chosen from a list. */
  pickers: Pickers,
  /** Whether `/create`'s knobs stand open over the preview on a phone. */
  drawerOpen: Schema.Boolean,
  scheme: Scheme,
  pageScheme: PageScheme,
  ...Dark.fields,
  ...Ticks.fields,
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
  PickedVariant: { axis: Schema.String, value: Schema.String },
  ToggledSwitch: { on: Schema.Boolean },
  ChoseCard: { key: Schema.String },
  DismissedCard: {},
  RestoredCard: {},
  GotWidget: { message: Widgets.Message },
  ChosePreset: { knobs: Knobs },
  MovedKnob: { knob: Knob, value: Schema.Number },
  PressedShuffle: {},
  GotSectionTabs: { message: UiTabs.Message },
  GotPicker: { picker: Picker, message: UiListbox.Message },
  ToggledDrawer: {},
  ChoseScheme: { scheme: Scheme },
  ChoseDirection: { direction: Direction },
  ChosePageScheme: { scheme: PageScheme },
  FoundPageScheme: { scheme: PageScheme },
  AppliedPageScheme: {},
  ...Dark.cases,
  ...Ticks.cases,
})
export type Message = typeof Message.Type

const Parent = Bundle.parent({ Model, Message })

const placements = Parent.assemble(
  Parent.at(Dark),
  Parent.at(Ticks, { args: { intervalMs: 1000 } }),
)

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

/** Applies the reader's scheme to the page and keeps it for the next visit. */
const ApplyPageScheme = Command.define('ApplyPageScheme', {
  args: { scheme: PageScheme },
  messages: [Message.AppliedPageScheme],
  execute: ({ scheme }) => chooseScheme(scheme).pipe(Effect.as(Message.AppliedPageScheme())),
})

/** What the head script applied, read once the browser takes the page over. */
const ReadPageScheme = Command.define('ReadPageScheme', {
  messages: [Message.FoundPageScheme],
  execute: Effect.sync(() => Message.FoundPageScheme({ scheme: currentScheme() })),
})

/** Knobs drawn at random, in the direction the preview reads. */
const Shuffle = Command.define('Shuffle', {
  args: { direction: Direction },
  messages: [Message.ChosePreset],
  execute: ({ direction }) =>
    Effect.sync(() => Message.ChosePreset({ knobs: shuffled(Math.random, direction) })),
})

// UPDATE

type UpdateReturn = Update.Return<Model, Message>

/** What a placement's wrapper never reaches: the placements take theirs. */
type OwnMessage = Bundle.OwnMessage<Message, typeof placements.placements>

/** `knobs` installed, unless they are the ones shown; the code copied before no longer matches them. */
const withKnobs = (model: Model, knobs: Knobs): UpdateReturn =>
  sameKnobs(model.knobs, knobs)
    ? { model }
    : { model: modifyFields(model, { knobs: () => knobs, copied: () => false }) }

type Step = Update.Step<Model, Message>

const foldSectionTabs = Update.foldChild({
  read: (model: Model) => Option.some(model.sectionTabs),
  write: (model: Model, sectionTabs: UiTabs.Model) =>
    sectionTabs === model.sectionTabs
      ? model
      : modifyFields(model, { sectionTabs: () => sectionTabs }),
  toParentMessage: (message: UiTabs.Message) => Message.GotSectionTabs({ message }),
  update: SectionTabs.update,
  // A pane chosen on a phone opens the drawer to show it.
  foldOutMessage: UiTabs.OutMessage.match<Step, UiTabs.OutMessage<Section>>({
    Selected:
      ({ value }) =>
      model =>
        value === model.section && model.drawerOpen
          ? { model }
          : { model: modifyFields(model, { section: () => value, drawerOpen: () => true }) },
  }),
})

const foldPicker = Update.foldChildAt({
  update: PickerBox.update,
  readAt: (model: Model, picker: Picker) => Option.some(model.pickers[picker]),
  writeAt: (model, picker, listbox) =>
    listbox === model.pickers[picker]
      ? model
      : modifyFields(model, { pickers: pickers => ({ ...pickers, [picker]: listbox }) }),
  toParentMessage: (picker, message) => Message.GotPicker({ picker, message }),
  foldOutMessage: picker =>
    UiListbox.OutMessage.match<Step, UiListbox.OutMessage<string>>({
      Selected:
        ({ value }) =>
        model =>
          pickedKnobs(model.knobs, picker, value).pipe(
            Option.match({ onNone: () => ({ model }), onSome: knobs => withKnobs(model, knobs) }),
          ),
    }),
})

const foldWidget = Update.foldChild({
  read: (model: Model) => Option.some(model.widgets),
  write: (model: Model, widgets: Widgets.Model) =>
    widgets === model.widgets ? model : modifyFields(model, { widgets: () => widgets }),
  toParentMessage: (message: Widgets.Message) => Message.GotWidget({ message }),
  update: Widgets.update,
})

const updateOwn = (model: Model, message: OwnMessage): UpdateReturn =>
  Match.valueTags(message, {
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
    PickedVariant: ({ axis, value }) =>
      Object.hasOwn(model.selection, axis) && model.selection[axis] === value
        ? { model }
        : { model: modifyFields(model, { selection: picked => ({ ...picked, [axis]: value }) }) },
    ToggledSwitch: ({ on }) =>
      on === model.switched ? { model } : { model: modifyFields(model, { switched: () => on }) },
    ChoseCard: ({ key }) =>
      key === model.chosenCard
        ? { model }
        : { model: modifyFields(model, { chosenCard: () => key }) },
    DismissedCard: () =>
      model.cardDismissed
        ? { model }
        : { model: modifyFields(model, { cardDismissed: () => true }) },
    RestoredCard: () =>
      model.cardDismissed
        ? { model: modifyFields(model, { cardDismissed: () => false }) }
        : { model },
    GotWidget: ({ message }) => foldWidget(model, message),
    ChosePreset: ({ knobs }) => withKnobs(model, knobs),
    MovedKnob: ({ knob, value }) => {
      const range = ranges.find(each => each.knob === knob)
      return range === undefined || !Number.isFinite(value)
        ? { model }
        : withKnobs(model, { ...model.knobs, [knob]: fit(range, value) })
    },
    PressedShuffle: () => ({
      model,
      commands: [Shuffle({ direction: model.knobs.direction })],
    }),
    GotSectionTabs: ({ message }) => foldSectionTabs(model, message),
    GotPicker: ({ picker, message }) => foldPicker(model, picker, message),
    ToggledDrawer: () => ({ model: modifyFields(model, { drawerOpen: open => !open }) }),
    ChoseDirection: ({ direction }) => withKnobs(model, { ...model.knobs, direction }),
    ChoseScheme: ({ scheme }) =>
      scheme === model.scheme
        ? { model }
        : { model: modifyFields(model, { scheme: () => scheme }) },
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
  })

export const update = placements.update(updateOwn)

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
export const subscriptions = placements.subscriptions(
  Subscription.aggregate(
    Subscription.make<Model, Message>()(() => ({
      codeCopy: Subscription.persistentEntry(
        Dom.streamFromEventFilterMap({
          target: () => document,
          type: 'click',
          filterMapEvent: codeCopyOf,
        }),
      ),
    })),
    Subscription.lift(Widgets.subscriptions)<Model, Message>({
      read: model => Option.some(model.widgets),
      toParentMessage: message => Message.GotWidget({ message }),
      // ⌘K belongs to the browser everywhere but the page that shows the menu.
      when: {
        palette: model => model.page._tag === 'Component' && model.page.slug === 'command',
      },
    }),
  ),
)

// INIT

/** The Model a page starts from, before the server names it. */
export const initial: Model = placements.initial({
  path: '/',
  page: Page.Missing(),
  menuOpen: false,
  example: 'view',
  copied: false,
  selection: {},
  switched: false,
  chosenCard: 'team',
  cardDismissed: false,
  widgets: Widgets.initial,
  knobs: defaultKnobs,
  section: 'theme',
  sectionTabs: initialTabs,
  pickers: initialPickers,
  drawerOpen: true,
  scheme: 'system',
  pageScheme: 'system',
}).model

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
    Components: () =>
      'Components drawn by the recipes foldkit-mixins-ui ships: pick a variant, read the code, theme them all.',
    Component: ({ slug }) =>
      Option.match(showcaseOf(slug), {
        onNone: () => DESCRIPTION,
        onSome: showcase => `${showcase.title}: ${showcase.summary}`,
      }),
    Create: () =>
      'Make a theme for foldkit-mixins: turn its knobs, see every component change, and copy the code.',
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
    local: [
      App.model.menuOpen,
      App.model.example,
      App.model.copied,
      App.model.selection,
      App.model.switched,
      App.model.chosenCard,
      App.model.cardDismissed,
      App.model.widgets,
      App.model.knobs,
      App.model.scheme,
      App.model.pageScheme,
      App.model.dark,
      App.model.ticks,
    ],
    // The server cannot know a reader's scheme; the head script applied it.
    boot: () => [ReadPageScheme()],
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
    Components: () => 'Components · Foldkit Plus',
    Component: ({ slug }) =>
      Option.match(showcaseOf(slug), {
        onNone: () => 'Components · Foldkit Plus',
        onSome: showcase => `${showcase.title} · Components · Foldkit Plus`,
      }),
    Create: () => 'Create a theme · Foldkit Plus',
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
