import type { Listbox as UiListbox } from '@foldkit/ui'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { NamedStyle } from 'foldkit-mixins'
import { ListboxSlots, Recipes, SelectSlots } from 'foldkit-mixins-ui'
import basic from '../../examples/select/basic.js'
import configure from '../../examples/select/configure.js'
import groups from '../../examples/select/groups.js'
import placeholder from '../../examples/select/placeholder.js'
import states from '../../examples/select/states.js'
import * as Snippet from '../../snippets/components.js'
import * as Widgets from '../widgets.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'
import type { Live } from '../showcase.js'

type FruitDraw = <Message>(
  style: NamedStyle<typeof ListboxSlots>,
  state: Snippet.FruitState,
  toMessage: (message: UiListbox.Message) => Message,
  direction: 'ltr' | 'rtl',
  h: HtmlBuilder<Message>,
) => Html

/** A custom select example on its own list and fruit of the widgets' Model, in its own style. */
const custom = (
  name: string,
  title: string,
  style: NamedStyle<typeof ListboxSlots>,
  draw: FruitDraw,
  example: Widgets.SelectExample = 'custom',
) => ({
  name,
  title,
  draw: <Message>(_style: NamedStyle<typeof SelectSlots>, live: Live<Message>) =>
    draw(
      style,
      live.widgets.selects[example],
      message => live.onWidget(Widgets.Message.GotSelect({ example, message })),
      live.direction,
      live.h,
    ),
})

export const showcase = fromRecipe(about('select'), SelectSlots, Recipes.Select, basic, undefined, [
  { name: 'basic', example: basic },
  { name: 'placeholder', example: placeholder },
  { name: 'groups', example: groups },
  { name: 'states', example: states },
  { name: 'configure', example: configure },
  // Drawn over Listbox: the native select's style does not reach them.
  custom('custom', 'Custom', Snippet.SelectMenuStyle, Snippet.selectCustom),
  custom(
    'custom-icons',
    'Custom, with icons',
    Snippet.SelectMenuStyle,
    Snippet.selectIcons,
    'icons',
  ),
  custom(
    'custom-descriptions',
    'Custom, with descriptions',
    Snippet.SelectMenuStyle,
    Snippet.selectDescriptions,
    'descriptions',
  ),
  custom(
    'custom-groups',
    'Custom, in groups',
    Snippet.SelectMenuStyle,
    Snippet.selectCustomGroups,
    'groups',
  ),
  custom(
    'custom-placeholder',
    'Custom, with a placeholder',
    Snippet.SelectMenuStyle,
    Snippet.selectPrompt,
    'placeholder',
  ),
  custom(
    'custom-disabled',
    'Custom, with a disabled option',
    Snippet.SelectMenuStyle,
    Snippet.selectDisabledOption,
    'disabled',
  ),
  custom(
    'custom-check-start',
    'Custom, the check first',
    Snippet.SelectCheckStartStyle,
    Snippet.selectCustom,
    'check-start',
  ),
  custom(
    'custom-trigger-filled',
    'Custom, a filled trigger',
    Snippet.SelectFilledStyle,
    Snippet.selectCustom,
    'trigger-filled',
  ),
  custom(
    'custom-trigger-ghost',
    'Custom, a ghost trigger',
    Snippet.SelectGhostStyle,
    Snippet.selectCustom,
    'trigger-ghost',
  ),
  {
    name: 'custom-sizes',
    title: 'Custom, in three sizes',
    draw: (_style, live) =>
      Snippet.selectSizes(
        live.widgets.selects,
        (example, message) => live.onWidget(Widgets.Message.GotSelect({ example, message })),
        live.direction,
        live.h,
      ),
  },
])
