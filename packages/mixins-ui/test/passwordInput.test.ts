/**
 * PasswordInput as markup: the input hidden or shown by the application's
 * flag, the toggle one name with its state pressed or not and pointing at the
 * input, autocomplete kept, and a disabled field sending nothing.
 */
import type { HtmlBuilder } from 'foldkit/html'
import { Scene } from 'foldkit/test'
import { describe, expect, it } from 'vitest'
import { A11y, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { PasswordInput, PasswordInputSlots, Patterns, Recipes } from '../src/index.js'
import { h, message, sends } from './fixture.js'

type Edited = { readonly _tag: 'Typed'; readonly text: string } | { readonly _tag: 'Toggled' }

const style = Style.forSlots(PasswordInputSlots)(Recipes.PasswordInput({}))
interface Extra {
  readonly disabled?: boolean
  readonly autocomplete?: 'new-password'
}
const drawn = (visible: boolean, extra: Extra = {}) =>
  PasswordInput.view(
    {
      id: 'sign-in',
      label: 'Password',
      value: 'hunter2',
      onInput: () => message('Other'),
      visible,
      onToggle: message('Clicked'),
      description: 'At least twelve characters.',
      style,
      ...extra,
    },
    h,
  )
const parts = (visible: boolean, extra?: Extra) => {
  const page = drawn(visible, extra)
  const [label] = Inert.byTag(page, 'label')
  const [input] = Inert.byTag(page, 'input')
  const [toggle] = Inert.byTag(page, 'button')
  const [description] = Inert.byTag(page, 'p')
  return { label, input, toggle, description }
}

describe('PasswordInput.view', () => {
  it('meets the password input pattern', () => {
    expect(A11y.validate(Patterns.PasswordInput, PasswordInputSlots)).toEqual([])
  })

  it('labels and describes the input, and keeps the saved password on offer', () => {
    const { label, input, description } = parts(false)
    expect(Inert.value(label, 'for')).toBe(Inert.value(input, 'id'))
    expect(Inert.value(input, 'aria-describedby')).toBe(Inert.value(description, 'id'))
    expect(Inert.value(input, 'autocomplete')).toBe('current-password')
    expect(Inert.value(parts(false, { autocomplete: 'new-password' }).input, 'autocomplete')).toBe(
      'new-password',
    )
  })

  it.each([
    [false, 'password', 'false'],
    [true, 'text', 'true'],
  ] as const)('visible %s draws a %s input and a toggle pressed %s', (visible, type, pressed) => {
    const { input, toggle } = parts(visible)
    expect(Inert.value(input, 'type')).toBe(type)
    expect(Inert.value(toggle, 'aria-pressed')).toBe(pressed)
    expect(Inert.value(toggle, 'aria-label')).toBe('Show password')
    expect(Inert.value(toggle, 'aria-controls')).toBe(Inert.value(input, 'id'))
    expect(Inert.value(toggle, 'type')).toBe('button')
  })

  it('keeps a shown password from spellcheck, correction and capitals', () => {
    const { input } = parts(true)
    expect(Inert.value(input, 'spellcheck')).toBe('false')
    expect(Inert.value(input, 'autocapitalize')).toBe('off')
    expect(Inert.value(input, 'autocorrect')).toBe('off')
  })

  it('says it is invalid only when told', () => {
    expect(Inert.value(parts(false).input, 'aria-invalid')).toBeUndefined()
    const invalid = PasswordInput.view(
      {
        id: 'sign-in',
        label: 'Password',
        value: '',
        onInput: () => message('Other'),
        visible: false,
        onToggle: message('Clicked'),
        invalid: true,
      },
      h,
    )
    expect(Inert.value(Inert.byTag(invalid, 'input')[0], 'aria-invalid')).toBe('true')
  })

  it('sends the text typed and the toggle', () => {
    sends(
      (h: HtmlBuilder<Edited>) =>
        PasswordInput.view(
          {
            id: 'sign-in',
            label: 'Password',
            value: '',
            onInput: text => ({ _tag: 'Typed', text }),
            visible: false,
            onToggle: { _tag: 'Toggled' },
          },
          h,
        ),
      Scene.type(Scene.label('Password'), 'hunter2'),
      Scene.expectOutMessage<Edited>({ _tag: 'Typed', text: 'hunter2' }),
      Scene.click(Scene.role('button', { name: 'Show password' })),
      Scene.expectOutMessage<Edited>({ _tag: 'Toggled' }),
    )
  })

  it('sends the toggle and the text while enabled, and nothing once disabled', () => {
    const enabled = parts(false)
    expect(enabled.toggle?.data?.on?.['click']).toBeTypeOf('function')
    expect(enabled.input?.data?.on?.['input']).toBeTypeOf('function')
    const shut = parts(false, { disabled: true })
    expect(shut.toggle?.data?.on?.['click']).toBeUndefined()
    expect(shut.input?.data?.on?.['input']).toBeUndefined()
  })

  it('draws the eye by the toggle state, struck through while the password shows', () => {
    const sheet = style.css
    expect(sheet).toMatch(/\[aria-pressed="false"\]\{--icon:url\("data:image\/svg\+xml,/)
    expect(sheet).toMatch(/\[aria-pressed="true"\]\{--icon:url\([^)]*M3%203l18%2018/)
  })
})
