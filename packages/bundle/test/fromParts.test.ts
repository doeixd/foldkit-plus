/**
 * A real @foldkit/ui component through Bundle.fromParts: its created
 * `{ update, view }` pair, view inputs, and OutMessage, placed like any bundle.
 */
import * as Tabs from '@foldkit/ui/tabs'
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Scene } from 'foldkit/test'
import { describe, expect, it } from 'vitest'
import { Bundle, Link } from '../src/index.js'

const Section = Schema.Literals(['general', 'billing'])
type Section = typeof Section.Type

const SectionTabs = Bundle.fromParts({
  name: 'SectionTabs',
  Model: Tabs.Model,
  Message: Tabs.Message,
  init: (config: Tabs.InitConfig) => Tabs.init(config),
  parts: Tabs.create<Section>(),
})

const GotTabsMessage = Link.wrapper('GotTabsMessage', Tabs.Message)
const Model = Schema.Struct({ tabs: Tabs.Model, section: Section })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...GotTabsMessage.cases })
type Message = typeof Message.Type

const Placed = SectionTabs.at(Link.field<Model>()('tabs', GotTabsMessage), {
  args: { id: 'sections' },
  onOut: selected => model => ({ model: { ...model, section: selected.value } }),
})
const placements = Bundle.assemble<Model, Message>()([Placed])

const update = (model: Model, message: Message) =>
  Option.getOrElse(placements.update(model, message), () => ({ model }))

describe('Bundle.fromParts', () => {
  it('wraps init’s Model as an update return', () => {
    const result = placements.init({ tabs: Tabs.init({ id: 'x' }), section: 'general' })
    expect(result.model.tabs).toEqual(Tabs.init({ id: 'sections' }))
    expect(result.commands).toEqual([])
  })

  it('places the created view with its inputs and folds the OutMessage into the parent', () => {
    Scene.scene(
      {
        update,
        view: (model, h) =>
          h.main(
            [h.Id('page')],
            [
              Placed.view(model, h, {
                tabs: ['general', 'billing'],
                selectedValue: model.section,
                ariaLabel: 'Sections',
                toView: ({ tablist, tabs }) =>
                  h.div(
                    [...tablist],
                    tabs.map(tab =>
                      h.button([...tab.tab, h.Class(`tab-${tab.value}`)], [tab.value]),
                    ),
                  ),
              }),
              h.p([h.Id('section')], [model.section]),
            ],
          ),
      },
      Scene.given<Model>({ tabs: Tabs.init({ id: 'sections' }), section: 'general' }),
      Scene.click('.tab-billing'),
      // The lifted Command resolves by its Tabs definition; Scene applies the recorded wrap.
      Scene.Command.resolve(Tabs.FocusTab, Tabs.Message.CompletedFocusTab()),
      Scene.expect(Scene.selector('#section')).toHaveText('billing'),
    )
  })
})
