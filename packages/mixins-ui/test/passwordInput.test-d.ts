/**
 * Compile-time: PasswordInput's `strength` is a gauge the application drew,
 * so PasswordInput itself imports no Meter. Type-checked, not executed.
 */
import { Meter, PasswordInput } from '../src/index.js'
import { h, message } from './fixture.js'

const password = {
  id: 'p',
  label: 'Password',
  value: '',
  visible: false,
  onInput: () => message('Other'),
  onToggle: message('Clicked'),
} as const

const gauge = { id: 'p-strength', label: 'Strength', value: 1, max: 4 } as const

export const drawn = PasswordInput.view({ ...password, strength: Meter.view(gauge, h) }, h)

export const options = PasswordInput.view(
  {
    ...password,
    // @ts-expect-error a Meter's options are drawn by `Meter.view` first.
    strength: gauge,
  },
  h,
)
