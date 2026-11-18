/**
 * `Bundles.PasswordInput` and `Bundles.InputCopy` placed with `foldkit-bundle`:
 * each starts from its args and folds its own Messages through the placement.
 */
import { Option, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { describe, expect, it } from 'vitest'
import { Bundles, InputCopy, PasswordInput } from '../src/index.js'

const App = Bundle.compose({ note: Schema.String }).pipe(
  Bundle.withChild('password', Bundles.PasswordInput, { args: { visible: true } }),
  Bundle.withChild('token', Bundles.InputCopy, { args: { resetAfter: 500 } }),
)
const update = App.placements.update(model => ({ model }))
const start = () => App.placements.initial({ note: '' }).model

describe('Bundles.PasswordInput', () => {
  it('starts from its args and folds its toggle and Caps Lock reading', () => {
    expect(start().password).toEqual(PasswordInput.init({ visible: true }))
    const hidden = update(
      start(),
      App.Message.GotPasswordMessage({ message: PasswordInput.Message.Toggled() }),
    ).model
    expect(hidden.password.visible).toBe(false)
    const caps = update(
      hidden,
      App.Message.GotPasswordMessage({
        message: PasswordInput.Message.ReadCapsLock({ reading: Option.some(true) }),
      }),
    ).model
    expect(caps.password.capsLock).toBe(true)
  })
})

describe('Bundles.InputCopy', () => {
  it('starts from its args, and is copied after a Copied Message', () => {
    expect(start().token).toEqual(InputCopy.init({ resetAfter: 500 }))
    const copied = update(
      start(),
      App.Message.GotTokenMessage({ message: InputCopy.Message.Copied() }),
    ).model
    expect(copied.token.copied).toBe(true)
    expect(copied.token.resetAfter).toBe(500)
  })
})
