/**
 * A radio group's arrow keys with a real keyboard: Right and Down are both
 * "next" and Left and Up both "previous", whichever way the group lies, with
 * Left and Right swapped under right to left, and a disabled option skipped.
 */
import { Option, Schema } from 'effect'
import * as RadioGroupUi from '@foldkit/ui/radioGroup'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { RadioGroup } from '../src/index.js'

type Choice = 'a' | 'b' | 'c' | 'd'
const Choices = RadioGroupUi.create<Choice>()
const Model = Schema.Struct({
  radio: RadioGroupUi.Model,
  value: Schema.Literals(['a', 'b', 'c', 'd']),
})
type Model = typeof Model.Type

afterEach(() => {
  document.documentElement.removeAttribute('dir')
  document.body.replaceChildren()
})

/** Four options, the second disabled, `a` chosen. */
const mount = (orientation: 'Horizontal' | 'Vertical', dir: 'ltr' | 'rtl') => {
  document.documentElement.dir = dir
  const container = document.createElement('div')
  container.id = 'radio-keys'
  document.body.append(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({
        model: { radio: RadioGroupUi.init({ id: 'pick' }), value: 'a' as const },
      }),
      update: (model: Model, message: RadioGroupUi.Message) => {
        const next = Choices.update(model.radio, message)
        return {
          model: { radio: next.model, value: next.outMessage?.value ?? model.value },
          commands: next.commands ?? [],
        }
      },
      view: (model: Model, h: HtmlBuilder<RadioGroupUi.Message>) =>
        Choices.view(
          model.radio,
          {
            options: ['a', 'b', 'c', 'd'],
            selectedValue: Option.some(model.value),
            ariaLabel: 'Pick',
            orientation,
            isOptionDisabled: value => value === 'b',
            toView: RadioGroup.toView([RadioGroup.readingKeys], { h }, ({ group, options }) =>
              h.div(
                group,
                options.map(option => h.button(option.option, [option.value])),
              ),
            ),
          },
          h,
        ),
    }),
  )
}

const focused = () => document.activeElement?.id

const cases = [
  ['ArrowRight', 'ltr', 'pick-option-3'],
  ['ArrowDown', 'ltr', 'pick-option-3'],
  ['ArrowLeft', 'ltr', 'pick-option-0'],
  ['ArrowUp', 'ltr', 'pick-option-0'],
  ['ArrowLeft', 'rtl', 'pick-option-3'],
  ['ArrowDown', 'rtl', 'pick-option-3'],
  ['ArrowRight', 'rtl', 'pick-option-0'],
  ['ArrowUp', 'rtl', 'pick-option-0'],
] as const

for (const orientation of ['Horizontal', 'Vertical'] as const) {
  for (const [key, dir, lands] of cases) {
    test(`${orientation} ${dir} group: ${key} moves to ${lands}`, async () => {
      const handle = mount(orientation, dir)
      try {
        await vi.waitFor(() => expect(document.getElementById('pick-option-0')).not.toBeNull())
        // From the third option, so neither way wraps, and "previous" travels back over the disabled one.
        await userEvent.click(document.getElementById('pick-option-2')!)
        await vi.waitFor(() => expect(focused()).toBe('pick-option-2'))
        await userEvent.keyboard(`{${key}}`)
        await vi.waitFor(() => expect(focused()).toBe(lands))
        expect(document.getElementById(lands)!.getAttribute('aria-checked')).toBe('true')
      } finally {
        handle.dispose()
      }
    })
  }
}

test.each([
  ['Home', 'pick-option-0'],
  ['End', 'pick-option-3'],
])('%s still goes to its end', async (key, lands) => {
  const handle = mount('Vertical', 'ltr')
  try {
    await vi.waitFor(() => expect(document.getElementById('pick-option-0')).not.toBeNull())
    await userEvent.click(document.getElementById('pick-option-2')!)
    await vi.waitFor(() => expect(focused()).toBe('pick-option-2'))
    await userEvent.keyboard(`{${key}}`)
    await vi.waitFor(() => expect(focused()).toBe(lands))
  } finally {
    handle.dispose()
  }
})

test('a key on the other axis is not left to scroll the page', async () => {
  const handle = mount('Horizontal', 'ltr')
  try {
    await vi.waitFor(() => expect(document.getElementById('pick-option-0')).not.toBeNull())
    const option = document.getElementById('pick-option-0')!
    option.focus()
    let prevented = false
    option.addEventListener('keydown', event => {
      queueMicrotask(() => {
        prevented = event.defaultPrevented
      })
    })
    await userEvent.keyboard('{ArrowDown}')
    await vi.waitFor(() => expect(prevented).toBe(true))
  } finally {
    handle.dispose()
  }
})
