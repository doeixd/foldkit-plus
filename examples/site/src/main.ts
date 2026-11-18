/**
 * The site's second application: the component pages and the theme creator.
 * It is the first (`shell.ts`) with the state a reader sets on the previews
 * added: a variant, a preview's state, `/create`'s knobs and the theme they
 * make. Only these pages load it.
 */
import { Effect, Match, Option, Schema, Stream } from 'effect'
import { Command, Dom, Subscription, Update } from 'foldkit'
import type { Document, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { Bundle } from 'foldkit-bundle'
import { SSR } from 'foldkit-ssr/client'
import { Projection, Surface } from 'foldkit-surface'

import { Listbox as UiListbox, Tabs as UiTabs, Tooltip as UiTooltip } from '@foldkit/ui'
import { Drawer } from 'foldkit-mixins-ui'

import { aboutOf } from './gallery/catalogue.js'
import { showcaseOf } from './gallery/showcases.js'
import {
  Canvas,
  CanvasTabs,
  Hint,
  HintTip,
  Picker,
  PickerBox,
  Pickers,
  SectionTabs,
  initialCanvasTabs,
  initialHints,
  initialPickers,
  initialTabs,
  pickedTheme,
} from './gallery/studio.js'
import * as Examples from './gallery/examplesState.js'
import * as PrimitiveBundles from './gallery/primitiveBundles.js'
import * as Widgets from './gallery/widgets.js'
import * as WidgetsUpdate from './gallery/widgetsUpdate.js'
import {
  Direction,
  KnobPath,
  Pack,
  Scheme,
  Section,
  ThemeValues,
  defaults as defaultTheme,
  fit,
  halfAt,
  keepKnobs,
  knobAt,
  presets,
  sameTheme,
  shippedPack,
  shuffled,
  valueAt,
  withValue,
} from './gallery/theme.js'
import { addressOf, queryOf } from './gallery/themeUrl.js'
import { COPY_ATTRIBUTE, CREATE, type Library } from './library.js'
import { Body } from './view/layout.js'
import { Page } from './page.js'
import * as Shell from './shell.js'

// MODEL

const decodePack = Schema.decodeUnknownOption(Pack)

export const Model = Schema.Struct({
  ...Shell.fields,
  /** The primitives the Primitives gallery runs. */
  ...PrimitiveBundles.fields,
  /** Whether a link to the theme was copied since the knobs last moved. */
  linkCopied: Schema.Boolean,
  /** Whether `/create` has read its address, before which it writes none. */
  addressRead: Schema.Boolean,
  /** The variant picked on a component's page, by axis. */
  selection: Schema.Record(Schema.String, Schema.String),
  /** What the previews' own controls hold. */
  switched: Schema.Boolean,
  /** What the Primitives gallery's `Resize` example last reported. */
  observed: Schema.Struct({ width: Schema.Number, height: Schema.Number }),
  /** The previews with state of their own: tabs, a dialog, a slider and the rest. */
  widgets: Widgets.Model,
  /** The state of each example that is a module of its own, by key. */
  examples: Examples.Model,
  /** The theme `/create` makes, as the values of the standard knobs. */
  theme: ThemeValues,
  /** Not the theme's: the preview's, to show the components right to left. */
  direction: Direction,
  /** The pane of knobs `/create` shows, and the tabs that pick it. */
  section: Section,
  sectionTabs: UiTabs.Model,
  /** The Listboxes of the knobs chosen from a list. */
  pickers: Pickers,
  /** A Tooltip for each knob's name, saying what it does. */
  hints: Schema.Array(HintTip),
  /** What `/create`'s preview shows, and the tabs that pick it. */
  canvas: Canvas,
  canvasTabs: UiTabs.Model,
  /** `/create`'s knobs, which a narrow screen docks to its bottom. */
  drawer: Drawer.Model,
  scheme: Scheme,
  /** The icon pack the previews draw the components' own icons in. */
  pack: Pack,
})
export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  ...Shell.cases,
  ...PrimitiveBundles.cases,
  PressedCopyLink: {},
  CopiedLink: {},
  FoundThemeAddress: { query: Schema.String },
  PickedVariant: { axis: Schema.String, value: Schema.String },
  ToggledSwitch: { on: Schema.Boolean },
  /** What the `Resize` and `Autofocus` Mounts of the Primitives gallery send. */
  Resized: { width: Schema.Number, height: Schema.Number },
  Focused: {},
  GotWidget: { message: Widgets.Message },
  GotExample: Examples.fields,
  ChoseValues: { values: ThemeValues },
  ChoseTheme: { name: Schema.String },
  /** A control moved: a knob's value, or a schemed knob's `dark` one. */
  SetKnob: {
    path: KnobPath,
    value: Schema.Union([Schema.Number, Schema.String]),
    dark: Schema.Boolean,
  },
  PressedShuffle: {},
  GotSectionTabs: { message: UiTabs.Message },
  GotCanvasTabs: { message: UiTabs.Message },
  GotPicker: { picker: Picker, message: UiListbox.Message },
  GotHint: { hint: Hint, message: UiTooltip.Message },
  GotDrawer: { message: Drawer.Message },
  ChoseScheme: { scheme: Scheme },
  ChoseDirection: { direction: Direction },
})
export type Message = typeof Message.Type

const Parent = Bundle.parent({ Model, Message })

const placements = Parent.assemble(
  Parent.at(Shell.Dark),
  Parent.at(Shell.Ticks, { args: { intervalMs: 1000 } }),
  Parent.at(PrimitiveBundles.Connection),
  Parent.at(PrimitiveBundles.Window),
  Parent.at(PrimitiveBundles.Fade, { args: { from: 0, to: 100, ms: 1500 } }),
  Parent.at(PrimitiveBundles.Note, { args: { initial: '' } }),
)

// COMMAND

/** Where the reader's theme is kept between pages: the query `/create` writes. */
const THEME_KEY = 'foldkit-site-theme'

/**
 * The theme the page's previews are drawn in: the address's when it names
 * one (a shared link), the one the reader last made otherwise.
 */
const ReadThemeAddress = Command.define('ReadThemeAddress', {
  messages: [Message.FoundThemeAddress],
  execute: Effect.sync(() =>
    Message.FoundThemeAddress({ query: openedTheme(window.location.search, storedTheme) }),
  ),
})

/** The address's query when it names anything, else the one kept: read only then. */
export const openedTheme = (search: string, stored: () => string): string =>
  search === '' ? stored() : search

const storedTheme = (): string => {
  try {
    return localStorage.getItem(THEME_KEY) ?? ''
  } catch {
    // Storage refused (a private window): every page starts at the default.
    return ''
  }
}

/** A link to `/create` with the theme `query` names in it, on the clipboard. */
const CopyLink = Command.define('CopyLink', {
  args: { query: Schema.String },
  messages: [Message.CopiedLink, Message.FailedToCopy],
  execute: ({ query }) =>
    Shell.writeClipboard(
      `${window.location.origin}${CREATE}${query === '' ? '' : `?${query}`}`,
    ).pipe(
      Effect.as(Message.CopiedLink()),
      Effect.orElseSucceed(() => Message.FailedToCopy()),
    ),
})

/** A theme drawn at random. */
const Shuffle = Command.define('Shuffle', {
  messages: [Message.ChoseValues],
  execute: Effect.sync(() => Message.ChoseValues({ values: shuffled(Math.random) })),
})

// UPDATE

type UpdateReturn = Update.Return<Model, Message>

/** What a placement's wrapper never reaches: the placements take theirs. */
type OwnMessage = Bundle.OwnMessage<Message, typeof placements.placements>

/** `values` installed, unless they are the theme shown; the code copied before no longer matches it. */
const withTheme = (model: Model, values: ThemeValues): UpdateReturn =>
  sameTheme(model.theme, values)
    ? { model }
    : {
        model: modifyFields(model, {
          theme: () => values,
          copied: () => false,
          linkCopied: () => false,
        }),
      }

/**
 * `theme` with the control at `path` moved to `value`: a slider's fitted to
 * its step, a schemed knob's `dark` half beside its light one, and the whole
 * checked by the knob's schema. On the spring or eased, a still theme moves
 * again, so choosing an easing shows it.
 */
const moved = (
  theme: ThemeValues,
  path: KnobPath,
  value: number | string,
  dark: boolean,
): Option.Option<ThemeValues> => {
  const knob = knobAt(path)
  const { control } = halfAt(path, dark)
  const fitted = control.kind === 'range' && typeof value === 'number' ? fit(control, value) : value
  const current = valueAt(theme, path)
  const next =
    typeof current === 'object'
      ? { ...current, [dark ? 'dark' : 'light']: fitted }
      : dark
        ? { light: current, dark: fitted }
        : fitted
  return Schema.decodeUnknownOption(knob.schema)(next).pipe(
    Option.map(checked => withValue(theme, path, checked)),
    Option.map(set =>
      path === 'motion.easing' && valueAt(set, 'motion.scale') === 0
        ? withValue(set, 'motion.scale', 1)
        : set,
    ),
  )
}

type Step = Update.Step<Model, Message>
const same: Step = model => ({ model })

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
        value === model.section && model.drawer.open
          ? { model }
          : {
              model: modifyFields(model, {
                section: () => value,
                drawer: drawer => Drawer.open(drawer),
              }),
            },
  }),
})

const foldCanvasTabs = Update.foldChild({
  read: (model: Model) => Option.some(model.canvasTabs),
  write: (model: Model, canvasTabs: UiTabs.Model) =>
    canvasTabs === model.canvasTabs ? model : modifyFields(model, { canvasTabs: () => canvasTabs }),
  toParentMessage: (message: UiTabs.Message) => Message.GotCanvasTabs({ message }),
  update: CanvasTabs.update,
  foldOutMessage: UiTabs.OutMessage.match<Step, UiTabs.OutMessage<Canvas>>({
    Selected:
      ({ value }) =>
      model =>
        value === model.canvas
          ? { model }
          : { model: modifyFields(model, { canvas: () => value }) },
  }),
})

const foldHint = Update.foldChildAt({
  update: UiTooltip.update,
  readAt: (model: Model, hint: Hint) =>
    Option.fromNullishOr(model.hints.find(each => each.hint === hint)?.tooltip),
  writeAt: (model, hint, tooltip) =>
    model.hints.some(each => each.tooltip === tooltip)
      ? model
      : modifyFields(model, {
          hints: hints => hints.map(each => (each.hint === hint ? { hint, tooltip } : each)),
        }),
  toParentMessage: (hint, message) => Message.GotHint({ hint, message }),
  foldOutMessage: () => UiTooltip.OutMessage.match<Step>({ Shown: () => same, Hidden: () => same }),
})

/** `model` drawn in the pack `value` names; the same Model for its own pack or a word of none. */
const withPack = (model: Model, value: string): Model =>
  Option.match(decodePack(value), {
    onNone: () => model,
    onSome: chosen => (chosen === model.pack ? model : modifyFields(model, { pack: () => chosen })),
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
          picker === 'pack'
            ? { model: withPack(model, value) }
            : pickedTheme(model.theme, picker, value).pipe(
                Option.match({
                  onNone: () => ({ model }),
                  onSome: values => withTheme(model, values),
                }),
              ),
    }),
})

const foldWidget = Update.foldChild({
  read: (model: Model) => Option.some(model.widgets),
  write: (model: Model, widgets: Widgets.Model) =>
    widgets === model.widgets ? model : modifyFields(model, { widgets: () => widgets }),
  toParentMessage: (message: Widgets.Message) => Message.GotWidget({ message }),
  update: WidgetsUpdate.update,
})

/**
 * A Message the first application answers alike: its `updateOwn` takes it over
 * this Model, and what it changed is written back.
 */
const asShell = (model: Model, message: Shell.OwnMessage): UpdateReturn => {
  const step = Shell.updateOwn(model, message)
  return {
    model: step.model === model ? model : { ...model, ...step.model },
    ...(step.commands === undefined ? {} : { commands: step.commands }),
  }
}

const updateOwn = (model: Model, message: OwnMessage): UpdateReturn =>
  Match.valueTags(message, {
    ToggledMenu: message => asShell(model, message),
    ChoseExample: message => asShell(model, message),
    PressedCopy: message => asShell(model, message),
    CopiedText: message => asShell(model, message),
    PressedCodeCopy: message => asShell(model, message),
    CopiedCode: message => asShell(model, message),
    FailedToCopy: message => asShell(model, message),
    ChosePageScheme: message => asShell(model, message),
    FoundPageScheme: message => asShell(model, message),
    AppliedPageScheme: message => asShell(model, message),
    PressedCopyLink: () => ({
      model,
      commands: [CopyLink({ query: queryOf(addressIn(model)) })],
    }),
    CopiedLink: () => ({ model: modifyFields(model, { linkCopied: () => true }) }),
    // Read once, on whichever page was opened: the knobs it names, then the
    // address is the Model's to write, so a theme follows the reader around.
    FoundThemeAddress: ({ query }) => {
      if (model.addressRead) return { model }
      const address = addressOf(query)
      return {
        model: modifyFields(model, {
          theme: () => address.values,
          scheme: () => address.scheme,
          canvas: () => address.canvas,
          direction: () => address.direction,
          addressRead: () => true,
        }),
      }
    },
    PickedVariant: ({ axis, value }) =>
      Object.hasOwn(model.selection, axis) && model.selection[axis] === value
        ? { model }
        : { model: modifyFields(model, { selection: picked => ({ ...picked, [axis]: value }) }) },
    ToggledSwitch: ({ on }) =>
      on === model.switched ? { model } : { model: modifyFields(model, { switched: () => on }) },
    GotWidget: ({ message }) => foldWidget(model, message),
    GotExample: message => {
      const step = Examples.update(model.examples, message, Message.GotExample)
      return {
        model:
          step.model === model.examples
            ? model
            : modifyFields(model, { examples: () => step.model }),
        ...(step.commands === undefined ? {} : { commands: step.commands }),
      }
    },
    Resized: ({ width, height }) =>
      model.observed.width === width && model.observed.height === height
        ? { model }
        : { model: modifyFields(model, { observed: () => ({ width, height }) }) },
    Focused: () => ({ model }),
    ChoseValues: ({ values }) => withTheme(model, values),
    // A preset by its name, and in its own scheme when it is known in one; a
    // name of none is ignored.
    ChoseTheme: ({ name }) =>
      Option.fromNullishOr(presets.find(preset => preset.name === name)).pipe(
        Option.match({
          onNone: () => ({ model }),
          onSome: preset => {
            const chosen = withTheme(model, preset.values).model
            const scheme = preset.scheme ?? chosen.scheme
            return {
              model:
                scheme === chosen.scheme ? chosen : modifyFields(chosen, { scheme: () => scheme }),
            }
          },
        }),
      ),
    SetKnob: ({ path, value, dark }) =>
      Option.match(moved(model.theme, path, value, dark), {
        onNone: () => ({ model }),
        onSome: values => withTheme(model, values),
      }),
    PressedShuffle: () => ({ model, commands: [Shuffle()] }),
    GotSectionTabs: ({ message }) => foldSectionTabs(model, message),
    GotCanvasTabs: ({ message }) => foldCanvasTabs(model, message),
    GotPicker: ({ picker, message }) => foldPicker(model, picker, message),
    GotHint: ({ hint, message }) => foldHint(model, hint, message),
    GotDrawer: ({ message }) => {
      const drawer = Drawer.update(model.drawer, message)
      return {
        model: drawer === model.drawer ? model : modifyFields(model, { drawer: () => drawer }),
      }
    },
    ChoseDirection: ({ direction }) =>
      direction === model.direction
        ? { model }
        : { model: modifyFields(model, { direction: () => direction }) },
    ChoseScheme: ({ scheme }) =>
      scheme === model.scheme
        ? { model }
        : { model: modifyFields(model, { scheme: () => scheme }) },
  })

export const update = placements.update(updateOwn)

// SUBSCRIPTION

const onCreate = (page: Page): boolean => page._tag === 'Create'

/** What of the Model the address holds; which canvas `/create` shows, only there. */
export const addressIn = (model: Model) => ({
  values: model.theme,
  scheme: model.scheme,
  canvas: onCreate(model.page) ? model.canvas : ('components' as const),
  direction: model.direction,
})

/** Keeps `query` for the next page; the default theme keeps nothing. */
const rememberTheme = (query: string) =>
  Effect.sync(() => {
    try {
      if (query === '') localStorage.removeItem(THEME_KEY)
      else localStorage.setItem(THEME_KEY, query)
    } catch {
      // Storage refused: the theme lasts as long as this page.
    }
  })

/** Writes `query` as the page's, in place: a new entry per knob would fill the history. */
const writeThemeAddress = (query: string) =>
  Effect.sync(() => {
    const search = query === '' ? '' : `?${query}`
    if (window.location.search === search) return
    try {
      history.replaceState(
        history.state,
        '',
        `${window.location.pathname}${search}${window.location.hash}`,
      )
    } catch {
      // Refused (too many writes): the next change writes it.
    }
  })

/** A code block's copy button, answered for the static region that drew it without a handler. */
export const subscriptions = placements.subscriptions(
  Subscription.aggregate(
    Subscription.make<Model, Message>()(entry => ({
      // The reader's knobs on every preview, as each change lands, and kept
      // for the head script of the next page. Not before the page has read
      // the theme it was opened at: the head script's rule stands until then,
      // and the default would undo it.
      knobs: entry(
        { theme: Schema.Option(ThemeValues) },
        {
          modelToDependencies: model => ({
            theme: model.addressRead ? Option.some(model.theme) : Option.none(),
          }),
          dependenciesToStream: ({ theme }) =>
            Option.match(theme, {
              onNone: () => Stream.empty,
              onSome: values => Stream.fromEffect(keepKnobs(values)).pipe(Stream.drain),
            }),
        },
      ),
      // The reader's theme, once the page has read the one it was opened at:
      // kept for the next page, every link being a page load of its own, and
      // on `/create` in its address too, the link a reader shares. A quarter
      // second after the knobs stop, so a slider's drag writes it once (Safari
      // refuses more than 100 address writes in 10 seconds).
      themeAddress: entry(
        { query: Schema.Option(Schema.String), create: Schema.Boolean },
        {
          modelToDependencies: model => ({
            query: model.addressRead ? Option.some(queryOf(addressIn(model))) : Option.none(),
            create: onCreate(model.page),
          }),
          dependenciesToStream: ({ query, create }) =>
            Option.match(query, {
              onNone: () => Stream.empty,
              onSome: query =>
                Stream.fromEffect(
                  Effect.sleep('250 millis').pipe(
                    Effect.andThen(rememberTheme(query)),
                    Effect.andThen(create ? writeThemeAddress(query) : Effect.void),
                  ),
                ).pipe(Stream.drain),
            }),
        },
      ),
      codeCopy: Shell.codeCopy,
    })),
    Subscription.lift(WidgetsUpdate.subscriptions)<Model, Message>({
      read: model => Option.some(model.widgets),
      toParentMessage: message => Message.GotWidget({ message }),
      // ⌘K belongs to the browser everywhere but the page that shows the menu.
      when: {
        palette: model => model.page._tag === 'Component' && model.page.slug === 'command',
      },
    }),
    Examples.subscriptions<Model, Message>({
      read: model => model.examples,
      onPage: (model, slug) => model.page._tag === 'Component' && model.page.slug === slug,
      toParent: Message.GotExample,
    }),
  ),
)

// INIT

const descriptionOf = (page: Page): string =>
  Page.match(page, {
    Primitives: () =>
      'Primitives from foldkit-primitives, by family: what each owns, how it is imported, and a live example of it.',
    Components: () =>
      'Components drawn by the recipes foldkit-mixins-ui ships: pick a variant, read the code, theme them all.',
    Component: ({ slug }) =>
      Option.match(aboutOf(slug), {
        onNone: () => Shell.DESCRIPTION,
        onSome: about => `${about.title}: ${about.summary}`,
      }),
    Create: () =>
      'Make a theme for foldkit-mixins: turn its knobs, see every component change, and copy the code.',
    Missing: () => Shell.DESCRIPTION,
    Home: () => elsewhere('Home'),
    Demos: () => elsewhere('Demos'),
    Doc: () => elsewhere('Doc'),
  })

const titleOf = (page: Page): string =>
  Page.match(page, {
    Components: () => 'Components · Foldkit Plus',
    Primitives: () => 'Primitives · Foldkit Plus',
    Component: ({ slug }) =>
      Option.match(aboutOf(slug), {
        onNone: () => 'Components · Foldkit Plus',
        onSome: about => `${about.title} · Components · Foldkit Plus`,
      }),
    Create: () => 'Create a theme · Foldkit Plus',
    Missing: () => 'Not found · Foldkit Plus',
    Home: () => elsewhere('Home'),
    Demos: () => elsewhere('Demos'),
    Doc: () => elsewhere('Doc'),
  })

/** A page of the guides application, which this one is never given: a routing mistake, said loudly. */
const elsewhere = (page: string): never => {
  throw new Error(`the ${page} page is drawn by the guides application, not this one`)
}

/** The Model a page starts from, before the server names it. */
export const initial: Model = placements.initial({
  path: '/',
  page: Page.Missing(),
  menuOpen: false,
  example: 'view',
  copied: false,
  linkCopied: false,
  addressRead: false,
  selection: {},
  switched: false,
  observed: { width: 0, height: 0 },
  widgets: Widgets.initial,
  examples: Examples.initial,
  theme: defaultTheme,
  direction: 'ltr',
  section: 'theme',
  sectionTabs: initialTabs,
  pickers: initialPickers,
  hints: initialHints,
  canvas: 'components',
  canvasTabs: initialCanvasTabs,
  drawer: Drawer.init({ id: 'theme-panes' }),
  scheme: 'system',
  pack: shippedPack,
  pageScheme: 'system',
}).model

/** The page at `path`, as the library knows it; the browser never runs this. */
export const modelAt = (library: Library, path: string): Model =>
  modifyFields(initial, { path: () => path, page: () => library.pageAt(path) })

// SSR

const App = Surface.application({ Model, Message, initial, update })

/**
 * The address and what the page is cross to the browser; the menu, the
 * example and the copy state start from `initial`. The guides, the API and the
 * sidebars are static regions, rendered on the server only.
 */
const planOf = (withMeta: boolean) =>
  SSR.plan(App, {
    id: 'gallery',
    state: Projection.pick(App.model.path, App.model.page),
    local: [
      App.model.menuOpen,
      App.model.example,
      App.model.copied,
      App.model.selection,
      App.model.switched,
      App.model.observed,
      App.model.widgets,
      App.model.examples,
      App.model.theme,
      App.model.direction,
      App.model.scheme,
      App.model.pageScheme,
      App.model.dark,
      App.model.ticks,
      App.model.online,
      App.model.windowSize,
      App.model.fade,
      App.model.note,
    ],
    // The server cannot know a reader's scheme; the head script applied it.
    // Nor the theme a link carries, which every page's previews are drawn in.
    boot: () => [Shell.ReadPageScheme(), ReadThemeAddress()],
    ...(withMeta ? { meta: (model: Model) => ({ description: descriptionOf(model.page) }) } : {}),
  })

/** The plan the build generates pages with. */
export const plan = planOf(true)
/** The dev server's plan: it serves pages without a template head to write meta into. */
export const servingPlan = planOf(false)

// VIEW

export const viewWith =
  (library: Library) =>
  (model: Model, h: HtmlBuilder<Message>): Document => ({
    title: titleOf(model.page),
    canonical: `${Shell.ORIGIN}${model.path}`,
    body: Body({ model, library }, h),
  })
