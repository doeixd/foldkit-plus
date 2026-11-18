import { Bundle } from 'foldkit-bundle'
import type { HtmlBuilder } from 'foldkit/html'
import {
  Bundles,
  Button,
  ButtonSlots,
  Recipes,
  Toolbar,
  ToolbarSlots,
  type ToolbarControl,
} from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { forSlots } from '../../snippets/theme.js'

const Tool = forSlots(ButtonSlots)(Recipes.Button({ tone: 'neutral', variant: 'outline' }))

// Each control is the application's own Button, handed the stop's attributes.
const control = <Outer>(h: HtmlBuilder<Outer>, label: string): ToolbarControl<Outer> => ({
  id: label,
  draw: stop => Button.view({ label, attributes: { button: stop.attributes }, style: Tool }, h),
})

const App = Bundle.compose({}).pipe(Bundle.withChild('bar', Bundles.Toolbar, { args: {} }))

// A toolbar of the application's own, stated once: every use starts from the
// base, and a named preset changes what differs. `orientation` and `direction`
// hold no Message, so they sit in a preset; the controls and the stop do not.
const AppToolbar = Toolbar.configure({
  base: { loop: false },
  presets: { stacked: { orientation: 'vertical' } },
})

export default example({
  title: 'Configure once',
  slots: ToolbarSlots,
  recipe: Recipes.Toolbar,
  state: App.placements.runtime({ Model: App.Model, initial: {} }),
  view: ({ style, model, onMessage, h }) =>
    AppToolbar.view(
      {
        id: 'stacked',
        label: 'Actions',
        preset: 'stacked',
        roving: model.bar,
        onFocus: Toolbar.focused(message => onMessage(App.Message.GotBarMessage({ message }))),
        items: ['Open', 'Rename', 'Delete'].map(label => control(h, label)),
        style,
      },
      h,
    ),
})
