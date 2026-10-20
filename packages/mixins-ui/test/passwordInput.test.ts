/**
 * PasswordInput as markup: the input hidden or shown by the application's
 * flag, the toggle one name with its state pressed or not and pointing at the
 * input, autocomplete kept, and a disabled field sending nothing.
 */
import { Option, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Scene } from 'foldkit/test'
import { describe, expect, it } from 'vitest'
import { A11y, Style, SlotView } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { MeterSlots, PasswordInput, PasswordInputSlots, Patterns, Recipes } from '../src/index.js'
import { h, message, sends, type TestMessage } from './fixture.js'

const Edited = defineMessageUnion({ Typed: { text: Schema.String }, Toggled: {} })
type Edited = typeof Edited.Type

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
            onInput: text => Edited.Typed({ text }),
            visible: false,
            onToggle: Edited.Toggled(),
          },
          h,
        ),
      Scene.type(Scene.label('Password'), 'hunter2'),
      Scene.expectOutMessage(Edited.Typed({ text: 'hunter2' })),
      Scene.click(Scene.role('button', { name: 'Show password' })),
      Scene.expectOutMessage(Edited.Toggled()),
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
    // The theme's icons, so a pack the application gives draws them too.
    expect(sheet).toContain('[aria-pressed="false"]{--icon:var(--fk-icon-eye)}')
    expect(sheet).toContain('[aria-pressed="true"]{--icon:var(--fk-icon-eye-off)}')
  })

  const aided = (extra: Partial<PasswordInput.PasswordInputView<TestMessage>>) =>
    PasswordInput.view(
      {
        id: 'new',
        label: 'Password',
        value: 'hunter2',
        onInput: () => message('Other'),
        visible: false,
        onToggle: message('Clicked'),
        ...extra,
      },
      h,
    )

  it('draws every element in a Slot, the requirements and the hint too', () => {
    const Drawn = SlotView.forMessages<TestMessage>().define(
      PasswordInputSlots,
      (_: undefined, __, h) =>
        PasswordInput.view(
          {
            id: 'new',
            label: 'Password',
            value: '',
            onInput: () => message('Other'),
            visible: false,
            onToggle: message('Clicked'),
            description: 'Twelve or more.',
            requirements: [{ label: 'A number', met: true }],
            capsLock: { on: true, onKey: () => message('Other') },
          },
          h,
        ),
    )
    expect(Inert.unslotted(Inert.draw(Drawn, undefined))).toEqual([])
  })

  it('lists the requirements, each met or not in words, and the input reads them', () => {
    const tree = aided({
      requirements: [
        { label: 'At least 12 characters', met: false },
        { label: 'A number', met: true },
      ],
    })
    const [list] = Inert.byTag(tree, 'ul')
    expect(Inert.byTag(tree, 'li').map(Inert.text)).toEqual([
      'At least 12 characters, not met',
      'A number, met',
    ])
    expect(Inert.byTag(tree, 'li').map(item => Inert.value(item, 'data-met'))).toEqual([
      'false',
      'true',
    ])
    expect(Inert.value(Inert.byTag(tree, 'input')[0], 'aria-describedby')).toBe(
      Inert.value(list, 'id'),
    )
    expect(Inert.byTag(aided({ requirements: [] }), 'ul')).toEqual([])
  })

  it('draws the strength Meter given, with its own label', () => {
    const meter = Style.forSlots(MeterSlots)(Recipes.Meter({}))
    const tree = aided({
      strength: { id: 'new-strength', label: 'Strength', value: 1, max: 4, style: meter },
    })
    const [gauge] = Inert.byRole(tree, 'meter')
    expect(Inert.value(gauge, 'aria-valuenow')).toBe('1')
    expect(Inert.value(gauge, 'aria-valuemax')).toBe('4')
  })

  it.each([
    ['a capital without Shift', 'A', false, Option.some(true)],
    ['a capital with Shift', 'A', true, Option.some(false)],
    ['a small letter with Shift', 'a', true, Option.some(true)],
    ['a small letter', 'a', false, Option.some(false)],
    ['a digit', '1', false, Option.none()],
    ['a named key', 'Enter', false, Option.none()],
  ])('reads Caps Lock from %s', (_, key, shiftKey, reading) => {
    expect(
      PasswordInput.capsLockOf(key, { shiftKey, ctrlKey: false, altKey: false, metaKey: false }),
    ).toEqual(reading)
  })

  it('says Caps Lock is on in a status region drawn always, which the input reads while on', () => {
    const off = aided({ capsLock: { on: false, onKey: () => message('Other') } })
    expect(Inert.byRole(off, 'status').map(Inert.text)).toEqual([''])
    expect(Inert.value(Inert.byTag(off, 'input')[0], 'aria-describedby')).toBeUndefined()
    const on = aided({ capsLock: { on: true, onKey: () => message('Other') } })
    const [status] = Inert.byRole(on, 'status')
    expect(Inert.text(status)).toBe('Caps Lock is on')
    expect(Inert.value(Inert.byTag(on, 'input')[0], 'aria-describedby')).toBe(
      Inert.value(status, 'id'),
    )
  })

  it('sends what each key says of Caps Lock', () => {
    const Read = defineMessageUnion({ ReadCapsLock: { reading: Schema.Option(Schema.Boolean) } })
    sends(
      (h: HtmlBuilder<typeof Read.Type>) =>
        PasswordInput.view(
          {
            id: 'new',
            label: 'Password',
            value: '',
            onInput: () => Read.ReadCapsLock({ reading: Option.none() }),
            visible: false,
            onToggle: Read.ReadCapsLock({ reading: Option.none() }),
            capsLock: { on: false, onKey: reading => Read.ReadCapsLock({ reading }) },
          },
          h,
        ),
      Scene.keydown(Scene.label('Password'), 'Q'),
      Scene.expectOutMessage(Read.ReadCapsLock({ reading: Option.some(true) })),
    )
  })
})
