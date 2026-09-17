/**
 * A settings page built from placements: one media-query bundle placed twice,
 * @foldkit/ui Tabs placed through fromParts, and a keyed collection of uploads.
 * The parent owns every slice; the assembly is its one list of placements.
 */
import * as Tabs from '@foldkit/ui/tabs'
import { Schema, Stream } from 'effect'
import { evo } from 'foldkit/struct'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Submodel from 'foldkit/submodel'
import * as Subscription from 'foldkit/subscription'
import { Bundle } from 'foldkit-bundle'
import { BundleSurface } from 'foldkit-bundle-surface'
import { Module, Surface, type Contract } from 'foldkit-surface'

// --- A media query: define once ---

export const MediaQueryModel = Schema.Struct({ matches: Schema.Boolean })
type MediaQueryModel = typeof MediaQueryModel.Type
export const MediaQueryMessage = defineMessageUnion({ Changed: { matches: Schema.Boolean } })
type MediaQueryMessage = typeof MediaQueryMessage.Type

/** A stand-in for `matchMedia`, so the example runs outside a browser. */
export const matchMediaChanges = (_query: string): Stream.Stream<boolean> => Stream.make(true)

export const MediaQuery = Bundle.make('MediaQuery', {
  Model: MediaQueryModel,
  Message: MediaQueryMessage,
  args: Schema.Struct({ query: Schema.String }),
  init: () => ({ model: { matches: false } }),
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

export const Upload = Bundle.make('Upload', {
  Model: UploadModel,
  Message: UploadMessage,
  init: () => ({ model: { name: '', percent: 0 } }),
  update: (model, message) => {
    const next = evo(model, { percent: () => message.percent })
    return message.percent >= 100
      ? { model: next, outMessage: Finished.make({ name: model.name }) }
      : { model: next }
  },
  view: Submodel.defineView<UploadModel, typeof UploadMessage.Type>((model, h) =>
    h.li([], [`${model.name} ${model.percent}%`]),
  ),
  helpers: {
    restart: (model: UploadModel) => ({ model: evo(model, { percent: () => 0 }) }),
  },
})

// --- Settings tabs: a @foldkit/ui component ---

export const Section = Schema.Literals(['general', 'uploads'])
type Section = typeof Section.Type

// Not exported: its view type names a Foldkit-internal module, so a declaration
// file could not name it (TS2742). Exported values below avoid the view's type.
const SectionTabs = Bundle.fromParts('SectionTabs', {
  Model: Tabs.Model,
  Message: Tabs.Message,
  init: (config: Tabs.InitConfig) => Tabs.init(config),
  parts: Tabs.create<Section>(),
})

// --- The parent ---

export const Dark = Bundle.declare(MediaQuery, 'dark')
export const Narrow = Bundle.declare(MediaQuery, 'narrow')
const TabsSlot = Bundle.declare(SectionTabs, 'tabs')
export const UploadsSlot = Bundle.declareEach(Upload, 'uploads')

export const GotDarkMessage = Dark.wrapper
export const GotTabsMessage = TabsSlot.wrapper
export const GotUploadMessage = UploadsSlot.wrapper

export const Model = Schema.Struct({
  ...Dark.fields,
  ...Narrow.fields,
  ...TabsSlot.fields,
  ...UploadsSlot.fields,
  section: Section,
  finished: Schema.Array(Schema.String),
  savedAt: Schema.NullOr(Schema.String),
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ChoseFile: { id: Schema.String, name: Schema.String },
  ClickedRestart: { id: Schema.String },
  ...Dark.cases,
  ...Narrow.cases,
  ...TabsSlot.cases,
  ...UploadsSlot.cases,
})
export type Message = typeof Message.Type

export const App = Surface.application({ Model, Message })
const Page = BundleSurface.parent(App)

export const Uploads = Page.each(UploadsSlot, {
  onOut: (finished, _key) => model => ({
    model: evo(model, { finished: () => [...model.finished, finished.name] }),
  }),
})

const placements = Page.assemble(
  Page.at(Dark, { args: { query: '(prefers-color-scheme: dark)' } }),
  Page.at(Narrow, { args: { query: '(max-width: 40rem)' } }),
  Page.at(TabsSlot, {
    args: { id: 'settings' },
    onOut: selected => model => ({ model: evo(model, { section: () => selected.value }) }),
  }),
  Uploads,
)

export const placementKeys: ReadonlyArray<string> = placements.placements.map(placed => placed.key)

export const update = placements.update((model, message) => {
  switch (message._tag) {
    case 'ChoseFile':
      return Uploads.add(message.id, upload => evo(upload, { name: () => message.name }))(model)
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
  init: () => placements.initial({ section: 'general', finished: [], savedAt: null }),
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

const SettingsModule = Page.module(placements, [SettingsSync])
