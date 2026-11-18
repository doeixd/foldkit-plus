import {
  Badge,
  BadgeSlots,
  Button,
  ButtonSlots,
  Input,
  InputSlots,
  Label,
  LabelSlots,
  Recipes,
} from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { outline } from '../../snippets/icon.js'
import { stack } from '../../snippets/layout.js'
import { forSlots } from '../../snippets/theme.js'

const Field = forSlots(InputSlots)(Recipes.Input({}))
const Help = forSlots(ButtonSlots)(Recipes.Button({ tone: 'neutral', variant: 'icon', size: 'xs' }))
const Soon = forSlots(BadgeSlots)(Recipes.Badge({ size: 'sm' }))

// `trailing` stands beside the label, not inside it, so a button there is not
// part of what names the control.
export default example({
  title: 'Trailing content',
  slots: LabelSlots,
  recipe: Recipes.Label,
  view: ({ style, h }) =>
    stack(h, [
      Label.view(
        {
          for: 'label-key',
          text: 'API key',
          trailing: Button.view(
            {
              label: 'What is an API key?',
              icon: outline(h, 'M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM8 7.5v3.5M8 5v.01'),
              style: Help,
            },
            h,
          ),
          style,
        },
        h,
      ),
      Input.view(
        { id: 'label-key', style: Field, draw: (resolved, h) => h.input(resolved.input) },
        h,
      ),
      Label.view(
        {
          for: 'label-domain',
          text: 'Custom domain',
          trailing: Badge.view({ text: 'Soon', tone: 'accent', style: Soon }, h),
          style,
        },
        h,
      ),
      Input.view(
        { id: 'label-domain', style: Field, draw: (resolved, h) => h.input(resolved.input) },
        h,
      ),
    ]),
})
