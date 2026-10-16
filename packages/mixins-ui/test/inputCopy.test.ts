/**
 * InputCopy: a read-only field its label names, a button that says what it
 * copies and sends `onCopy`, "Copied" on the button and in a status region
 * that is drawn before it speaks; and `Copy`, which reports the clipboard's
 * answer as a Message, a refusal included.
 */
import { Effect } from 'effect'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { A11y, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { ClipboardMessage } from 'foldkit-primitives/dom'
import { InputCopy, InputCopySlots, Patterns, Recipes } from '../src/index.js'
import { h, message } from './fixture.js'

const style = Style.forSlots(InputCopySlots)(Recipes.InputCopy({}))
const drawn = (copied: boolean) =>
  InputCopy.view(
    { id: 'key', label: 'API key', value: 'sk-123', copied, onCopy: message('Clicked'), style },
    h,
  )

describe('InputCopy.view', () => {
  it('meets the input copy pattern', () => {
    expect(A11y.validate(Patterns.InputCopy, InputCopySlots)).toEqual([])
  })

  it('shows the value read-only, labelled', () => {
    const [input] = Inert.byTag(drawn(false), 'input')
    const [label] = Inert.byTag(drawn(false), 'label')
    expect(Inert.value(input, 'value')).toBe('sk-123')
    expect(Inert.value(input, 'readonly')).toBe('')
    expect(Inert.value(label, 'for')).toBe(Inert.value(input, 'id'))
  })

  it('names the button by its text and the label, and sends onCopy', () => {
    const [button] = Inert.byTag(drawn(false), 'button')
    const [label] = Inert.byTag(drawn(false), 'label')
    expect(Inert.value(button, 'aria-labelledby')).toBe(
      `${Inert.value(button, 'id')} ${Inert.value(label, 'id')}`,
    )
    expect(Inert.text(button)).toBe('Copy')
    expect(button?.data?.on?.['click']).toBeTypeOf('function')
  })

  it('says Copied on the button and in the status region, which is there before', () => {
    const idle = Inert.byRole(drawn(false), 'status')
    expect(idle.map(Inert.text)).toEqual([''])
    const [status] = Inert.byRole(drawn(true), 'status')
    const [button] = Inert.byTag(drawn(true), 'button')
    expect(Inert.text(status)).toBe('Copied')
    expect(Inert.text(button)).toBe('Copied')
    expect(Inert.value(button, 'data-copied')).toBe('true')
  })
})

describe('InputCopy.Copy', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const clipboard = (writeText: (text: string) => Promise<void>) =>
    vi.stubGlobal('navigator', { clipboard: { writeText } })

  it('writes the text and yields Copied', async () => {
    const written: Array<string> = []
    clipboard(text => {
      written.push(text)
      return Promise.resolve()
    })
    const result = await Effect.runPromise(InputCopy.Copy({ text: 'sk-123' }).effect)
    expect(result).toEqual(ClipboardMessage.Copied())
    expect(written).toEqual(['sk-123'])
  })

  it('yields CopyFailed when the clipboard refuses', async () => {
    clipboard(() => Promise.reject(new Error('denied')))
    const result = await Effect.runPromise(InputCopy.Copy({ text: 'sk-123' }).effect)
    expect(result).toEqual(ClipboardMessage.CopyFailed({ message: 'denied' }))
  })

  it('reads the clipboard when it runs, not when it is built', async () => {
    const command = InputCopy.Copy({ text: 'late' })
    const written: Array<string> = []
    clipboard(text => {
      written.push(text)
      return Promise.resolve()
    })
    expect(await Effect.runPromise(command.effect)).toEqual(ClipboardMessage.Copied())
    expect(written).toEqual(['late'])
  })
})

describe('InputCopy recipe', () => {
  const css = Style.forSlots(InputCopySlots)(Recipes.InputCopy({})).css

  it('rounds the input and the button to the corner inside the group border', () => {
    expect(css).toMatch(/border-start-start-radius:[^;}]*calc\(/)
    expect(css).toMatch(/border-end-start-radius:[^;}]*calc\(/)
    expect(css).toMatch(/border-start-end-radius:[^;}]*calc\(/)
    expect(css).toMatch(/border-end-end-radius:[^;}]*calc\(/)
  })
})
