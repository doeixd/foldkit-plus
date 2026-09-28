/**
 * The README's "A Link without a Bundle" snippet, as written there.
 */
import * as Tabs from '@foldkit/ui/tabs'
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import * as Update from 'foldkit/update'
import { expectTypeOf } from 'vitest'
import { Link } from '../src/index.js'

const Section = Schema.Literals(['general', 'billing'])
type Section = typeof Section.Type
const SectionTabs = Tabs.create<Section>()

const Model = Schema.Struct({ tabs: Tabs.Model, section: Section })
type Model = typeof Model.Type
const Message = defineMessageUnion({ GotTabsMessage: { message: Tabs.Message }, Saved: {} })
type Message = typeof Message.Type

const tabs = Link.field<Model>()('tabs', Link.wrapper(Message.GotTabsMessage))

const foldTabs = Update.foldChild({
  ...tabs,
  update: SectionTabs.update,
  foldOutMessage: Tabs.OutMessage.match<Update.Step<Model, Message>, Tabs.OutMessage<Section>>({
    Selected:
      ({ value }) =>
      model => ({ model: { ...model, section: value } }),
  }),
})

const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    GotTabsMessage: ({ message }) => foldTabs(model, message),
    Saved: () => ({ model }),
  })

expectTypeOf(update).returns.toEqualTypeOf<Update.Return<Model, Message>>()

// Its init folds through the same Link: init has no parent yet to read, so
// the fold takes the parent's other fields instead.
const init = (): Update.Return<Model, Message> =>
  Update.foldChildInit(
    { model: Tabs.init({ id: 'sections' }) },
    Link.foldInit(tabs, { section: 'general' }),
  )

expectTypeOf(init).returns.toEqualTypeOf<Update.Return<Model, Message>>()

Update.foldChildInit(
  { model: Tabs.init({ id: 'sections' }) },
  Link.foldInit(
    tabs,
    // @ts-expect-error the rest keeps its types: section is not a number
    { section: 42 },
  ),
)

// The Link's Message lift is a member of the parent union, so a fold for the wrong
// variant is refused where it meets the parent's update.
const wrong = Link.field<Model>()(
  'tabs',
  Link.wrapper(defineMessageUnion({ GotOtherMessage: { message: Tabs.Message } }).GotOtherMessage),
)
const foldWrong = Update.foldChild({
  ...wrong,
  update: SectionTabs.update,
  foldOutMessage: () => (model: Model) => ({ model }),
})
Message.match<Update.Return<Model, Message>>(Message.Saved(), {
  // @ts-expect-error its Commands carry `GotOtherMessage`, which Message lacks
  GotTabsMessage: ({ message }) => foldWrong(model0, message),
  Saved: () => ({ model: model0 }),
})
declare const model0: Model
