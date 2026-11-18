import { Button, ButtonSlots, Recipes, Spinner, SpinnerSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { forSlots } from '../../snippets/theme.js'

const Face = forSlots(ButtonSlots)(Recipes.Button({}))

// A spinner in a Button's `icon`, with `busy` on: the button draws none of its
// own, so a page that never shows one never ships it. The spinner takes the
// button's own ink, and the button reports `aria-busy` while the press does nothing.
export default example({
  title: 'In a button',
  slots: SpinnerSlots,
  recipe: Recipes.Spinner,
  pins: { size: 'sm', tone: 'current' },
  view: ({ style, h }) =>
    Button.view({ label: 'Saving…', busy: true, icon: Spinner.view({ style }, h), style: Face }, h),
})
