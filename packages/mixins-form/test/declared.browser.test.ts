/// <reference types="@vitest/browser-playwright" />
/**
 * A form drawn from `Declared.of(form)` on a real page: a day typed into the
 * date input and an amount typed into the amount input arrive as the values
 * the Schema stores, the inputs carry the bounds and step it declares, and a
 * rule over two keys shows its message beside both and goes when it holds.
 */
import { CalendarDay, Money } from 'metakit/domain'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { afterEach, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { DeclaredView } from '../src/declared.js'
import { FormView } from '../src/index.js'
import { declared, stay, Stay, type StayMessage, type StayModel } from './declaredFixture.js'

let model: StayModel = Stay.initial

afterEach(() => document.body.replaceChildren())

const mount = async (view = FormView.fields(stay.form, stay.options).view) => {
  model = Stay.initial
  const container = document.createElement('div')
  container.id = 'declared-form'
  document.body.append(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model: Stay.bundle.Model,
      container,
      init: () => ({ model: Stay.initial }),
      update: (previous: StayModel, message: StayMessage) => {
        const result = Stay.bundle.update(previous, message, undefined)
        model = result.model
        return { model: result.model, commands: result.commands ?? [] }
      },
      view: (current: StayModel, h: HtmlBuilder<StayMessage>) =>
        view({ model: current, errors: [], canSubmit: true }, h),
    }),
  )
  await vi.waitFor(() => expect(input('arrives')).not.toBeNull())
  return handle
}

const input = (key: string) => document.querySelector<HTMLInputElement>(`#Stay-${key}`)!
const error = (key: string) => document.querySelector(`#Stay-${key}-error`)

it('reads a day typed into the date input as the day the Schema stores, within the bounds it declares', async () => {
  const handle = await mount()
  try {
    expect(input('arrives').type).toBe('date')
    expect(input('arrives').min).toBe('2026-01-01')
    expect(input('leaves').max).toBe('2026-12-31')

    await userEvent.fill(input('arrives'), '2026-03-05')
    await vi.waitFor(() =>
      expect(Stay.partial(model).arrives).toBe(CalendarDay.parseIsoUnsafe('2026-03-05')),
    )
    expect(input('arrives').validity.valid).toBe(true)

    // The browser's own range check agrees with the attributes.
    await userEvent.fill(input('arrives'), '2025-12-31')
    expect(input('arrives').validity.rangeUnderflow).toBe(true)
    await userEvent.fill(input('leaves'), '2027-01-01')
    expect(input('leaves').validity.rangeOverflow).toBe(true)
  } finally {
    handle.dispose()
  }
})

it('reads an amount typed as 12.50 as 1250 whole cents, and refuses one with a cent too many', async () => {
  const handle = await mount()
  try {
    const deposit = input('deposit')
    expect([deposit.type, deposit.inputMode]).toEqual(['text', 'decimal'])
    expect([deposit.min, deposit.max, deposit.step]).toEqual(['0.01', '10000.00', '0.01'])

    await userEvent.fill(deposit, '12.50')
    await vi.waitFor(() => expect(Stay.partial(model).deposit).toBe(Money.minor('USD', 1250)))

    await userEvent.fill(deposit, '12.345')
    await vi.waitFor(() => expect(model.fields.deposit.value).toBe('12.345'))
    expect(Stay.partial(model).deposit).toBeUndefined()
  } finally {
    handle.dispose()
  }
})

it('has the browser enforce the amount’s bounds and step once the caller makes it a number input', async () => {
  const numbered = DeclaredView.of(Stay, declared, { attrs: { deposit: { type: 'number' } } })
  const handle = await mount(FormView.fields(numbered.form, numbered.options).view)
  try {
    const deposit = input('deposit')
    expect(deposit.type).toBe('number')
    await userEvent.fill(deposit, '20000')
    expect(deposit.validity.rangeOverflow).toBe(true)
    await userEvent.fill(deposit, '0')
    expect(deposit.validity.rangeUnderflow).toBe(true)
    await userEvent.fill(deposit, '12.345')
    expect(deposit.validity.stepMismatch).toBe(true)
    await userEvent.fill(deposit, '12.34')
    expect(deposit.validity.valid).toBe(true)
  } finally {
    handle.dispose()
  }
})

it('shows a rule over two keys beside both once the values break it, and clears it when they hold', async () => {
  const handle = await mount()
  try {
    await userEvent.fill(input('arrives'), '2026-03-05')
    expect(error('leaves')).toBeNull()

    await userEvent.fill(input('leaves'), '2026-03-01')
    await vi.waitFor(() => expect(error('leaves')).not.toBeNull())
    for (const key of ['arrives', 'leaves']) {
      const message = error(key)!
      expect(message.textContent).toBe('Leave after you arrive')
      expect(input(key).getAttribute('aria-invalid')).toBe('true')
      expect(input(key).getAttribute('aria-describedby')).toBe(message.id)
    }
    // A key the rule does not read is untouched.
    expect(input('deposit').getAttribute('aria-invalid')).toBe('false')
    expect(input('deposit').hasAttribute('aria-describedby')).toBe(false)

    await userEvent.fill(input('leaves'), '2026-03-09')
    await vi.waitFor(() => expect(error('leaves')).toBeNull())
    expect(error('arrives')).toBeNull()
    for (const key of ['arrives', 'leaves']) {
      expect(input(key).getAttribute('aria-invalid')).toBe('false')
      expect(input(key).hasAttribute('aria-describedby')).toBe(false)
    }
  } finally {
    handle.dispose()
  }
})
