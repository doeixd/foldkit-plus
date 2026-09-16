/**
 * A settings page built from placements: one media-query bundle placed twice,
 * @foldkit/ui Tabs placed through fromParts, and a keyed collection of uploads.
 * The parent owns every slice; the assembly is its one list of placements.
 */
import * as Tabs from '@foldkit/ui/tabs'
import { Option, Schema, Stream } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Submodel from 'foldkit/submodel'
import * as Subscription from 'foldkit/subscription'
import type * as Update from 'foldkit/update'
import { Bundle, Link } from 'foldkit-bundle'
import { BundleSurface } from 'foldkit-bundle-surface'
import { Module, Surface, type Contract } from 'foldkit-surface'

// --- A media query: define once ---

export const MediaQueryModel = Schema.Struct({ matches: Schema.Boolean })
type MediaQueryModel = typeof MediaQueryModel.Type
export const MediaQueryMessage = defineMessageUnion({ Changed: { matches: Schema.Boolean } })
type MediaQueryMessage = typeof MediaQueryMessage.Type

/** A stand-in for `matchMedia`, so the example runs outside a browser. */
export const matchMediaChanges = (_query: string): Stream.Stream<boolean> => Stream.make(true)

export const MediaQuery = Bundle.make({
  name: 'MediaQuery',
  Model: MediaQueryModel,
  Message: MediaQueryMessage,
  init: (_: { readonly query: string }) => ({ model: { matches: false } }),
  update: (_model, message) => ({ model: { matches: message.matches } }),
  subscriptions: ({ query }) =>
    Subscription.make<MediaQueryModel, MediaQueryMessage>()(() => ({
      changes: Subscription.persistent(
        Stream.map(matchMediaChanges(query), matches => MediaQueryMessage.Changed({ matches })),
      ),
    })),
})

// --- An upload: placed once per file ---

export const UploadModel = Schema.Struct({ name: Schema.String, percent: Schema.Number })
type UploadModel = typeof UploadModel.Type
export const UploadMessage = defineMessageUnion({ Progressed: { percent: Schema.Number } })
export const Finished = Schema.TaggedStruct('Finished', { name: Schema.String })
type Finished = typeof Finished.Type

export const Upload = Bundle.make({
  name: 'Upload',
  Model: UploadModel,
  Message: UploadMessage,
  init: () => ({ model: { name: '', percent: 0 } }),
  update: (model, message) => {
    const next = { ...model, percent: message.percent }
    return message.percent >= 100
      ? { model: next, outMessage: Finished.make({ name: model.name }) }
      : { model: next }
  },
  view: Submodel.defineView<UploadModel, typeof UploadMessage.Type>((model, h) =>
    h.li([], [`${model.name} ${model.percent}%`]),
  ),
  helpers: {
    restart: (model: UploadModel) => ({ model: { ...model, percent: 0 } }),
  },
})

// --- Settings tabs: a @foldkit/ui component ---

export const Section = Schema.Literals(['general', 'uploads'])
type Section = typeof Section.Type

// Not exported: its view type names a Foldkit-internal module, so a declaration
// file could not name it (TS2742). Exported values below avoid the view's type.
const SectionTabs = Bundle.fromParts({
  name: 'SectionTabs',
  Model: Tabs.Model,
  Message: Tabs.Message,
  init: (config: Tabs.InitConfig) => Tabs.init(config),
  parts: Tabs.create<Section>(),
})

// --- The parent ---

export const GotDarkMessage = Link.wrapper('GotDarkMessage', MediaQueryMessage)
export const GotNarrowMessage = Link.wrapper('GotNarrowMessage', MediaQueryMessage)
export const GotTabsMessage = Link.wrapper('GotTabsMessage', Tabs.Message)
export const GotUploadMessage = Link.keyedWrapper('GotUploadMessage', UploadMessage)

export const Model = Schema.Struct({
  dark: MediaQueryModel,
  narrow: MediaQueryModel,
  tabs: Tabs.Model,
  section: Section,
  uploads: Schema.Record(Schema.String, UploadModel),
  finished: Schema.Array(Schema.String),
  savedAt: Schema.NullOr(Schema.String),
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ChoseFile: { id: Schema.String, name: Schema.String },
  ClickedRestart: { id: Schema.String },
  ...GotDarkMessage.cases,
  ...GotNarrowMessage.cases,
  ...GotTabsMessage.cases,
  ...GotUploadMessage.cases,
})
export type Message = typeof Message.Type

export const App = Surface.application({ Model, Message })

export const Dark = MediaQuery.at(BundleSurface.link(App.model.dark, GotDarkMessage), {
  args: { query: '(prefers-color-scheme: dark)' },
})
export const Narrow = MediaQuery.at(BundleSurface.link(App.model.narrow, GotNarrowMessage), {
  args: { query: '(max-width: 40rem)' },
})
const Sections = SectionTabs.at(BundleSurface.link(App.model.tabs, GotTabsMessage), {
  args: { id: 'settings' },
  onOut: selected => model => ({ model: { ...model, section: selected.value } }),
})
export const Uploads = Upload.each(Link.collection<Model>()('uploads', GotUploadMessage), {
  onOut:
    (finished: Finished): Update.Step<Model, Message> =>
    model => ({ model: { ...model, finished: [...model.finished, finished.name] } }),
})

const placements = Bundle.assemble<Model, Message>()([Dark, Narrow, Sections, Uploads])

export const placementKeys: ReadonlyArray<string> = placements.placements.map(placed => placed.key)

export const empty: Model = {
  dark: { matches: false },
  narrow: { matches: false },
  tabs: Tabs.init({ id: 'placeholder' }),
  section: 'general',
  uploads: {},
  finished: [],
  savedAt: null,
}

export const update = placements.update((model, message) => {
  switch (message._tag) {
    case 'ChoseFile':
      return Uploads.add(message.id, upload => ({ ...upload, name: message.name }))(model)
    case 'ClickedRestart':
      return Uploads.helpers.restart(message.id)(model)
    default:
      return { model }
  }
})

export const view = (model: Model, h: HtmlBuilder<Message>) =>
  h.main(
    [],
    [h.p([], [model.dark.matches ? 'dark' : 'light']), h.ul([], Uploads.viewAll(model, h))],
  )

export const config = placements.complete({
  init: () => placements.init(empty),
  update,
  view,
  subscriptions: placements.subscriptions(),
})

/** Who owns what, for Module.validate: the placements and the page's own settings sync. */
export const SettingsSync: Contract = {
  kind: 'sync',
  name: 'Settings',
  owner: App.owner,
  owns: [['savedAt']],
  observes: [],
  messages: [],
  metadata: [],
}

export const settingsFindings = () => Module.validate(SettingsModule)
export const settingsOwnership = () => Module.toMarkdown(SettingsModule)

const SettingsModule = BundleSurface.module(App, placements, [SettingsSync])
