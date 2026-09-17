/**
 * The sixty-second example from this package's README, type-checked so the
 * documentation cannot drift from the API. Imports are relative, as in every
 * package's fixture; the README shows the published `foldkit-bundles/media`.
 */
import { Schema } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { MediaQuery, PrefersDark, PrefersReducedMotion } from '../src/media/index.js'
import { history } from '../src/state/index.js'

const Dark = Bundle.declare(MediaQuery, 'dark')

const Model = Schema.Struct({ ...Dark.fields, theme: Schema.String })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Dark.cases, ThemeSet: { theme: Schema.String } })
type Message = typeof Message.Type

const Page = Bundle.parent({ Model, Message })
const placements = Page.assemble(Page.at(Dark, { args: { query: '(prefers-color-scheme: dark)' } }))

declare const view: (model: Model, h: HtmlBuilder<Message>) => Html

const config = placements.complete({
  init: () => placements.initial({ theme: 'light' }),
  update: placements.update(model => ({ model })),
  view,
  subscriptions: placements.subscriptions(),
})

// Presets place with no args.
const Motion = Bundle.declare(MediaQuery, 'motion')
const WideModel = Schema.Struct({ ...Dark.fields, ...Motion.fields })
type WideModel = typeof WideModel.Type
const WideMessage = defineMessageUnion({ ...Dark.cases, ...Motion.cases })
const WidePage = Bundle.parent({ Model: WideModel, Message: WideMessage })
const preset = WidePage.assemble(
  WidePage.place(PrefersDark, 'dark'),
  WidePage.place(PrefersReducedMotion, 'motion'),
)

// The README's preset line, on the sixty-second scope above.
const darkOnly = Page.assemble(Page.place(PrefersDark, 'dark'))

void config
void preset
void darkOnly

// State: undo/redo over any value Schema.
const EditHistory = history({ name: 'EditHistory', value: Schema.String, capacity: 50 })
const Doc = Bundle.declare(EditHistory, 'doc')

void Doc
