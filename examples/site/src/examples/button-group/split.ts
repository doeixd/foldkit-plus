import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import {
  Button,
  ButtonGroup,
  ButtonGroupSlots,
  ButtonSlots,
  Menu,
  MenuSlots,
  Recipes,
} from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { outline } from '../../snippets/icon.js'
import { note, stack } from '../../snippets/layout.js'
import { forSlots } from '../../snippets/theme.js'

const Face = forSlots(ButtonSlots)(Recipes.Button({ tone: 'neutral', variant: 'outline' }))
const MenuStyle = forSlots(MenuSlots)(Recipes.Menu({}))

const rows: ReadonlyArray<Menu.Row> = [
  { value: 'Save as copy', label: 'Save as copy' },
  { value: 'Save as template', label: 'Save as template' },
  { value: 'Save and close', label: 'Save and close' },
]

// The Menu's state, packaged for a Bundle: its Model is the application's
// like every Menu's, and a choice is reported once.
const SaveMenu = Bundle.make('SaveMenu', {
  Model: Menu.Model,
  Message: Menu.Message,
  args: Schema.Struct({}),
  init: () => ({ model: Menu.init('split-save', rows, { isAnimated: true }) }),
  update: (model, message) => Menu.update(model, message),
})

const App = Bundle.compose({ last: Schema.String }).pipe(
  Bundle.withChild('menu', SaveMenu, {
    args: {},
    onOut: out => model => ({
      model: { ...model, last: Menu.OutMessage.match(out, { Selected: ({ value }) => value }) },
    }),
  }),
)

// A split button: the action, and a Menu of the others. The Menu's trigger is
// the group's last face, so it takes the group's end corners.
export default example({
  title: 'Split button',
  slots: ButtonGroupSlots,
  recipe: Recipes.ButtonGroup,
  state: App.placements.runtime({ Model: App.Model, initial: { last: '' } }),
  view: ({ style, model, onMessage, h }) =>
    stack(h, [
      ButtonGroup.view(
        {
          label: 'Save',
          items: [
            Button.view({ label: 'Save draft', style: Face }, h),
            Menu.view(
              {
                model: model.menu,
                rows,
                buttonContent: h.span(
                  [h.Role('img'), h.AriaLabel('More ways to save')],
                  [outline(h, 'M4 6l4 4 4-4')],
                ),
                onMessage: message => onMessage(App.Message.GotMenuMessage({ message })),
                mixins: [MenuStyle.mixin],
              },
              h,
            ),
          ],
          style,
        },
        h,
      ),
      note(h, [model.last === '' ? 'Nothing chosen yet' : `Chose: ${model.last}`]),
    ]),
})
