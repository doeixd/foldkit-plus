/**
 * Compile-time: a text field's `onInput` is a closure or the `OnInput`
 * attribute the view's own builder makes, and either must make the view's
 * Message. Type-checked, not executed.
 */
import { SlotView } from 'foldkit-mixins'
import { Input, PasswordInput } from '../src/index.js'
import { h, message } from './fixture.js'

type ForeignMessage = { readonly _tag: 'Foreign' }
const foreign = SlotView.inertBuilder<ForeignMessage>()

const password = { id: 'p', label: 'Password', value: '', visible: false } as const

export const closure = PasswordInput.view(
  { ...password, onInput: () => message('Other'), onToggle: message('Clicked') },
  h,
)

export const attribute = PasswordInput.view(
  { ...password, onInput: h.OnInput(() => message('Other')), onToggle: message('Clicked') },
  h,
)

export const kept = PasswordInput.view(
  {
    ...password,
    onInput: () => message('Other'),
    onToggle: message('Clicked'),
    attributes: { input: [h.DataAttribute('kept', '')] },
  },
  h,
)

export const foreignAttribute = PasswordInput.view(
  {
    ...password,
    // @ts-expect-error an attribute another view's builder made sends that view's Message.
    onInput: foreign.OnInput(() => ({ _tag: 'Foreign' })),
    onToggle: message('Clicked'),
  },
  h,
)

export const foreignClosure = PasswordInput.view(
  {
    ...password,
    // @ts-expect-error the closure must make this view's Message.
    onInput: (): ForeignMessage => ({ _tag: 'Foreign' }),
    onToggle: message('Clicked'),
  },
  h,
)

export const notOnInput = PasswordInput.view(
  {
    ...password,
    // @ts-expect-error only an `OnInput` attribute binds typing.
    onInput: h.OnChange(() => message('Other')),
    onToggle: message('Clicked'),
  },
  h,
)

export const foreignKept = PasswordInput.view(
  {
    ...password,
    onInput: () => message('Other'),
    onToggle: message('Clicked'),
    // @ts-expect-error a Slot's attributes send this view's Message.
    attributes: { input: [foreign.OnClick({ _tag: 'Foreign' })] },
  },
  h,
)

export const inputAttribute = Input.view(
  { id: 'email', onInput: h.OnInput(() => message('Other')), draw: ({ input }) => h.input(input) },
  h,
)

export const inputForeign = Input.view(
  {
    id: 'email',
    // @ts-expect-error an attribute another view's builder made sends that view's Message.
    onInput: foreign.OnInput(() => ({ _tag: 'Foreign' })),
    draw: ({ input }) => h.input(input),
  },
  h,
)
