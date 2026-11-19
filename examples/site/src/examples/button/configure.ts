import { Button, ButtonSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { row } from '../../snippets/layout.js'

// Stated once, at module scope: the look every button of the application
// starts from, and a named preset over it.
const Quiet = Recipes.Button.style({ tone: 'neutral', variant: 'outline' })
const Danger = Recipes.Button.style({ tone: 'danger' })

const AppButton = Button.configure({
  base: { style: Quiet },
  presets: { danger: { style: Danger } },
})

// Each use gives only what differs. A style at the call wins over both: the
// third button takes the one picked above.
export default example({
  title: 'Configure once',
  slots: ButtonSlots,
  recipe: Recipes.Button,
  view: ({ style, h }) =>
    row(h, [
      AppButton.view({ label: 'Cancel' }, h),
      AppButton.view({ label: 'Delete project', preset: 'danger' }, h),
      AppButton.view({ label: 'Save changes', style }, h),
    ]),
})
