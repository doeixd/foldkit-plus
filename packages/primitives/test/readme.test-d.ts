/**
 * The sixty-second example from this package's README, type-checked so the
 * documentation cannot drift from the API. Imports are relative, as in every
 * package's fixture; the README shows the published `foldkit-primitives/media`.
 */
import { Schema } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { MediaQuery, PrefersDark, PrefersReducedMotion } from '../src/media/index.js'
import { history } from '../src/state/index.js'

const Page = Bundle.compose({ theme: Schema.String }).pipe(
  Bundle.withMessages({ ThemeSet: { theme: Schema.String } }),
  Bundle.withChild('dark', MediaQuery, { args: { query: '(prefers-color-scheme: dark)' } }),
)
type Model = typeof Page.Model.Type
type Message = typeof Page.Message.Type
const { placements } = Page

// The declaration the later sections place by hand.
const Dark = Bundle.declare(MediaQuery, 'dark')

const view = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div([], [model.dark.matches ? 'Dark mode' : 'Light mode'])

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

// The README's preset line: a preset places with no config.
const darkOnly = Bundle.compose({ theme: Schema.String }).pipe(
  Bundle.withChild('dark', PrefersDark),
).placements

void config
void preset
void darkOnly

// State: undo/redo over any value Schema.
const EditHistory = history({ name: 'EditHistory', value: Schema.String, capacity: 50 })
const Doc = Bundle.declare(EditHistory, 'doc')

void Doc

// Time: debounce settles through an OutMessage the placement handles.
import { Interval, Timer, debounce, Throttle } from '../src/time/index.js'

const Query = debounce({ name: 'Query', value: Schema.String })
const SearchBox = Bundle.declare(Query, 'search')
const SearchModel = Schema.Struct({ ...SearchBox.fields, fired: Schema.Array(Schema.String) })
type SearchModel = typeof SearchModel.Type
const SearchMessage = defineMessageUnion({ ...SearchBox.cases })
const SearchPage = Bundle.parent({ Model: SearchModel, Message: SearchMessage })
const search = SearchPage.assemble(
  SearchPage.at(SearchBox, {
    args: { delayMs: 300 },
    onOut: out => model => ({ model: { ...model, fired: [...model.fired, out.value] } }),
  }),
)

const Save = Bundle.declare(Throttle, 'save')
const ThrottleModel = Schema.Struct({ ...Save.fields, fired: Schema.Array(Schema.Number) })
type ThrottleModel = typeof ThrottleModel.Type
const ThrottleMessage = defineMessageUnion({ ...Save.cases })
const ThrottlePage = Bundle.parent({ Model: ThrottleModel, Message: ThrottleMessage })
const throttled = ThrottlePage.assemble(
  ThrottlePage.at(Save, {
    args: { intervalMs: 1000 },
    onOut: out => model => ({ model: { ...model, fired: [...model.fired, out.at] } }),
  }),
)

void search
void throttled
void Timer
void Interval

// One primitive per subpath, placed on a single page.
import { Online } from '../src/net/index.js'
import { SelectionSet } from '../src/state/index.js'
import { Tween } from '../src/motion/index.js'
import { Geolocation } from '../src/device/index.js'
import { Visibility } from '../src/events/index.js'

const Net = Bundle.declare(Online, 'net')
const Picked = Bundle.declare(SelectionSet, 'picked')
const Slide = Bundle.declare(Tween, 'slide')
const Here = Bundle.declare(Geolocation, 'here')
const Tab = Bundle.declare(Visibility, 'tab')
const TourModel = Schema.Struct({
  ...Dark.fields,
  ...Net.fields,
  ...Picked.fields,
  ...Slide.fields,
  ...Here.fields,
  ...Tab.fields,
})
type TourModel = typeof TourModel.Type
const TourMessage = defineMessageUnion({
  ...Dark.cases,
  ...Net.cases,
  ...Picked.cases,
  ...Slide.cases,
  ...Here.cases,
  ...Tab.cases,
})
const TourPage = Bundle.parent({ Model: TourModel, Message: TourMessage })
const tour = TourPage.assemble(
  TourPage.at(Dark, { args: { query: '(max-width: 800px)' } }),
  TourPage.at(Net),
  TourPage.at(Picked),
  TourPage.at(Slide, { args: { from: 0, to: 1, ms: 200 } }),
  TourPage.at(Here),
  TourPage.at(Tab),
)

void tour

// Entries lift into subscriptions, mapping to the parent's Message.
import { Option, Stream } from 'effect'
import * as Subscription from 'foldkit/subscription'
import { keyboardEvents, type KeyboardMessage } from '../src/events/index.js'

const KeyModel = Schema.Struct({ lastKey: Schema.String })
type KeyModel = typeof KeyModel.Type
// A view hosting a Mount includes the Mount's message shape in its union,
// so the action types where it attaches.
const KeyMessage = defineMessageUnion({
  Key: { key: Schema.String },
  Resized: { width: Schema.Number, height: Schema.Number },
})
type KeyMessage = typeof KeyMessage.Type
type Pressed = Extract<KeyboardMessage, { readonly _tag: 'Pressed' }>
const keyed = Subscription.make<KeyModel, KeyMessage>()(() => ({
  keys: Subscription.persistent(
    Stream.map(
      Stream.filter(keyboardEvents(), (message): message is Pressed => message._tag === 'Pressed'),
      pressed => KeyMessage.Key({ key: pressed.key }),
    ),
  ),
}))

void keyed

// Mounts attach in views, on the element they observe.
import { Resize } from '../src/observers/index.js'
import { ClipboardMessage, copyText } from '../src/dom/index.js'
import { mapMessage } from 'foldkit/command'
import type * as Update from 'foldkit/update'

declare const widget: (model: KeyModel, h: HtmlBuilder<KeyMessage>) => Html

const panel = (model: KeyModel, h: HtmlBuilder<KeyMessage>): Html =>
  h.div([h.OnMount(Resize())], [model.lastKey])

void widget
void panel

// Standalone Commands map into the parent union through a wrapper variant.
const KeyClipboardMessage = defineMessageUnion({
  Key: { key: Schema.String },
  Clipboard: { message: ClipboardMessage },
})

const saveStep = (
  model: KeyModel,
): Update.Return<KeyModel, typeof KeyClipboardMessage.Type, never> => ({
  model,
  commands: [
    mapMessage(copyText(model.lastKey), message => KeyClipboardMessage.Clipboard({ message })),
  ],
})

void saveStep
