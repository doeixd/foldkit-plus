import type { NamedStyle } from 'foldkit-mixins'
import { Recipes, FloatingPanelSlots } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import * as Widgets from '../widgets.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'
import type { Live } from '../showcase.js'

const panelBasic = <Message>(style: NamedStyle<typeof FloatingPanelSlots>, live: Live<Message>) =>
  Snippet.floatingPanel(
    style,
    live.widgets.panels,
    message => live.onWidget(Widgets.Message.GotPanel({ message })),
    live.onWidget(Widgets.Message.OpenedPanel()),
    live.h,
  )

export const showcase = fromRecipe(
  about('floating-panel'),
  FloatingPanelSlots,
  Recipes.FloatingPanel,
  panelBasic,
  undefined,
  [{ name: 'basic', title: 'Notes', draw: panelBasic }],
)
