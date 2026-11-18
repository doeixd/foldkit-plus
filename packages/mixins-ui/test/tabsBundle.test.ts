import { Option, Schema } from 'effect'
import * as UiTabs from '@foldkit/ui/tabs'
import { Bundle } from 'foldkit-bundle'
import { describe, expect, it } from 'vitest'
import { Bundles } from '../src/index.js'

const App = Bundle.compose({ value: Schema.String }).pipe(
  Bundle.withChild('tabs', Bundles.Tabs, {
    args: { id: 'sections', activationMode: 'Manual' },
    onOut: out => model => ({ model: { ...model, value: out.value } }),
  }),
)
const update = App.placements.update(model => ({ model }))

describe('Bundles.Tabs', () => {
  it('starts from its args, in the field the application named', () => {
    const start = App.placements.initial({ value: 'a' }).model
    expect(start.tabs).toEqual(UiTabs.init({ id: 'sections', activationMode: 'Manual' }))
  })

  it('reports the chosen value to the application, which owns it', () => {
    const start = App.placements.initial({ value: 'a' }).model
    const chosen = update(
      start,
      App.Message.GotTabsMessage({
        message: UiTabs.Message.SelectedTab({ index: 1, value: 'b' }),
      }),
    ).model
    expect(chosen.value).toBe('b')
    expect(chosen.tabs.maybeFocusedIndex).toEqual(Option.none())
  })
})
