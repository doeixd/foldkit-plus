/**
 * Compile-time `toView` contract. Type-checked, not executed.
 */
import { Option } from 'effect'
import * as UiButton from '@foldkit/ui/button'
import * as UiRadioGroup from '@foldkit/ui/radioGroup'
import * as UiTextarea from '@foldkit/ui/textarea'
import type { HtmlBuilder } from 'foldkit/html'
import { Behavior, Style } from 'foldkit-mixins'
import { Button, ButtonSlots, Input, RadioGroup, Textarea } from '../src/index.js'
import { h, message } from './fixture.js'
const Look = Style.forSlots(ButtonSlots)({ button: Style.class('look') })

// The Message comes from `h` and the config; no generics at the call.
UiButton.view(
  {
    onClick: message('Clicked'),
    toView: Button.toView([Look.mixin], { h }, ({ button }) => h.button(button, ['Save'])),
  },
  h,
)

// `input` may be left out of `resolve`'s context too.
UiButton.view(
  { toView: attributes => h.button(Button.resolve(attributes, [Look.mixin], { h }).button, []) },
  h,
)

// A resolved textarea bundle is one `h.textarea` takes, with no cast.
UiTextarea.view(
  { id: 'bio', toView: Textarea.toView([], { h }, ({ textarea }) => h.textarea(textarea)) },
  h,
)
UiTextarea.view(
  {
    id: 'bio',
    toView: attributes => h.textarea(Textarea.resolve(attributes, [], { h }).textarea),
  },
  h,
)

// A Submodel's `Value` comes from where the `toView` goes.
const Plans = UiRadioGroup.create<'free' | 'pro'>()
declare const plans: UiRadioGroup.Model
declare const hr: HtmlBuilder<UiRadioGroup.Message>
Plans.view(
  plans,
  {
    options: ['free', 'pro'],
    selectedValue: Option.none(),
    ariaLabel: 'Plan',
    toView: RadioGroup.toView([], { h: hr }, ({ group, options }) =>
      hr.div(
        group,
        options.map(option =>
          // @ts-expect-error `gold` is not one of the group's values.
          option.value === 'gold' ? hr.empty : hr.div(option.option, [option.value]),
        ),
      ),
    ),
  },
  hr,
)

type ForeignMessage = { readonly _tag: 'Foreign' }
const Foreign = Behavior.forSlots(ButtonSlots)<undefined, ForeignMessage>({
  button: Behavior.slot({ attributes: () => [] }),
})
// @ts-expect-error a Behavior from another Message universe cannot attach here.
Button.toView([Foreign.mixin], { h }, ({ button }) => h.button(button, []))

// @ts-expect-error `draw` sees only the slots the component publishes.
Button.toView([], { h }, ({ missing }) => h.button(missing, []))

UiButton.view(
  // @ts-expect-error an Input's `toView` is not a Button's.
  { toView: Input.toView([], { h }, ({ input }) => h.input(input)) },
  h,
)

// `Input.view` hides the UiInput wiring; `draw` places the resolved bundles.
Input.view(
  {
    id: 'email',
    type: 'email',
    draw: ({ input }, h) => h.input(input),
  },
  h,
)

// @ts-expect-error `draw` sees only the slots the component publishes.
Input.view({ id: 'email', draw: ({ missing }) => h.input(missing) }, h)

// @ts-expect-error an input needs an id.
Input.view({ draw: ({ input }, h) => h.input(input) }, h)

// `Textarea.view` forwards rows the same way.
Textarea.view(
  {
    id: 'bio',
    rows: 8,
    draw: ({ textarea }, h) => h.textarea(textarea),
  },
  h,
)

// The README's input view, kept compiling.
Input.view(
  {
    id: 'email',
    value: 'a@b.c',
    onInput: () => message('Other'),
    type: 'email',
    placeholder: 'you@example.com',
    draw: ({ input, label }, h) => h.div([], [h.label(label, ['Email']), h.input(input)]),
  },
  h,
)
