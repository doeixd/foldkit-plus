/**
 * A Link spread into `Update.foldChild`, for a component that is not a Bundle:
 * a `@foldkit/ui` Tabs held in a parent whose Message union declares its
 * wrapper variant itself.
 */
import * as Tabs from '@foldkit/ui/tabs'
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import * as Update from 'foldkit/update'
import { describe, expect, it } from 'vitest'
import { Link } from '../src/index.js'

const Section = Schema.Literals(['general', 'billing'])
const SectionTabs = Tabs.create<typeof Section.Type>()

const Model = Schema.Struct({
  tabs: Tabs.Model,
  maybeTabs: Schema.Option(Tabs.Model),
  section: Section,
})
type Model = typeof Model.Type
const Message = defineMessageUnion({ GotTabsMessage: { message: Tabs.Message }, Saved: {} })

const GotTabs = Link.wrapper(Message.GotTabsMessage)
const tabs = Link.field<Model>()('tabs', GotTabs)
const maybeTabs = Link.optional<Model>()('maybeTabs', GotTabs)

const foldTabs = Update.foldChild({
  ...tabs,
  update: SectionTabs.update,
  foldOutMessage: Tabs.OutMessage.match<
    Update.Step<Model, typeof Message.Type>,
    Tabs.OutMessage<typeof Section.Type>
  >({
    Selected:
      ({ value }) =>
      model => ({ model: { ...model, section: value } }),
  }),
})

const ignore = () => (parent: Model) => ({ model: parent })
const foldMaybeTabs = Update.foldChild({
  ...maybeTabs,
  update: SectionTabs.update,
  foldOutMessage: ignore,
})

const model: Model = {
  tabs: Tabs.init({ id: 'sections' }),
  maybeTabs: Option.some(Tabs.init({ id: 'more' })),
  section: 'general',
}

describe('a Link as a foldChild lens', () => {
  it('returns the parent itself for a Message the component ignores', () => {
    const ignored = Tabs.Message.CompletedFocusTab()
    expect(foldTabs(model, ignored).model).toBe(model)
    expect(foldMaybeTabs(model, ignored).model).toBe(model)
  })

  it('writes a changed optional child back as Some', () => {
    const focused = Tabs.Message.FocusedTab({ index: 1 })
    const result = foldMaybeTabs(model, focused)
    expect(result.model.maybeTabs).toEqual(
      Option.map(model.maybeTabs, child => SectionTabs.update(child, focused).model),
    )
    expect(result.model.maybeTabs).not.toEqual(model.maybeTabs)
  })

  it('writes a changed child back and folds its OutMessage', () => {
    const selected = Tabs.Message.SelectedTab({ index: 1, value: 'billing' })
    const result = foldTabs(model, selected)
    expect(result.model.tabs).toEqual(SectionTabs.update(model.tabs, selected).model)
    expect(result.model.section).toBe('billing')
  })
})

describe('Link.wrapper from a declared variant', () => {
  const message = Tabs.Message.FocusedTab({ index: 1 })

  it('wraps into a value the parent union decodes as that variant', () => {
    expect(Schema.decodeUnknownSync(Message)(GotTabs.make(message))).toEqual(
      Message.GotTabsMessage({ message }),
    )
  })

  it('recognises the variant the union constructs, and no other', () => {
    expect(GotTabs.fromParentMessage(Message.GotTabsMessage({ message }))).toEqual(
      Option.some(message),
    )
    expect(GotTabs.fromParentMessage(Message.Saved())).toEqual(Option.none())
  })
})
