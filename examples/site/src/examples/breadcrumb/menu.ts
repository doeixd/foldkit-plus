import { mapMessages } from 'foldkit/command'
import { defineMessageUnion } from 'foldkit/message'
import {
  Breadcrumb,
  BreadcrumbMenu,
  BreadcrumbSlots,
  Menu,
  MenuSlots,
  Recipes,
} from 'foldkit-mixins-ui'
import { forSlots } from '../../snippets/theme.js'
import { example } from '../../gallery/example.js'

const steps = [
  { label: 'Home', href: '#' },
  { label: 'Docs', href: '#' },
  { label: 'Packages', href: '#' },
  { label: 'Mixins', href: '#' },
  { label: 'Recipes', href: '#' },
  { label: 'Breadcrumb', current: true },
]
const MAX = 3

const MenuStyle = forSlots(MenuSlots)(Recipes.Menu({}))
const Message = defineMessageUnion({ GotMenu: { message: Menu.Message } })
const got = (message: Menu.Message) => Message.GotMenu({ message })

// `BreadcrumbMenu.make` is a value the application passes, so a trail that
// never opens a Menu never loads one. The Menu's Model is the application's:
// `Menu.update` folds it, and a row chosen comes out as `Selected`, which
// `Breadcrumb.chosen` turns back into the step it stands for.
export default example({
  title: 'The hidden steps in a menu',
  slots: BreadcrumbSlots,
  recipe: Recipes.Breadcrumb,
  state: {
    Model: Menu.Model,
    Message,
    init: () => ({ model: Menu.init('trail-menu', Breadcrumb.menuRows(steps, MAX)) }),
    update: (model, { message }) => {
      const next = Menu.update(model, message)
      return { model: next.model, commands: mapMessages(next.commands, got) }
    },
  },
  view: ({ style, model, onMessage, h }) =>
    Breadcrumb.view(
      {
        steps,
        collapse: BreadcrumbMenu.make({
          max: MAX,
          menu: {
            model,
            onMessage: message => onMessage(got(message)),
            mixins: [MenuStyle.mixin],
          },
        }),
        style,
      },
      h,
    ),
})
