/// <reference types="@vitest/browser-playwright" />
/**
 * The submit button is `aria-disabled`, never `disabled`, so Enter always
 * reaches the form and `update` decides from the Model: a submit the form
 * cannot take shows what is missing and goes nowhere, and one the Model
 * can take goes through even when the frame that would have enabled the button
 * was not drawn yet.
 */
import { Schema } from 'effect'
import { Form } from 'foldkit-form'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { afterEach, expect, it, vi } from 'vitest'
import { cdp, userEvent } from 'vitest/browser'
import { FormView } from '../src/index.js'

const Signup = Form.make(
  'Signup',
  Form.input(
    Schema.Struct({
      email: Schema.String.check(Schema.isMinLength(1)).annotate({ title: 'Email' }),
      name: Schema.String.check(Schema.isMinLength(1)).annotate({ title: 'Name' }),
    }),
  ),
)
type Model = typeof Signup.initial
type Message = typeof Signup.Message.Type
const View = FormView.define(Signup)

/** The values the form handed out: a submit that went through. */
let submitted: Array<unknown> = []

afterEach(() => document.body.replaceChildren())

const mount = async () => {
  submitted = []
  const container = document.createElement('div')
  container.id = 'submit-keys'
  document.body.append(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model: Signup.bundle.Model,
      container,
      init: () => ({ model: Signup.initial }),
      update: (model: Model, message: Message) => {
        const answered = Signup.bundle.update(model, message, undefined)
        if (answered.outMessage !== undefined) submitted.push(answered.outMessage.value)
        return { model: answered.model }
      },
      view: (model: Model, h: HtmlBuilder<Message>) =>
        View({ model, errors: [], canSubmit: Signup.canSubmit(model) }, h),
    }),
  )
  await vi.waitFor(() => expect(email()).not.toBeNull())
  return handle
}

const email = () => document.getElementById('Signup-email') as HTMLInputElement
const name = () => document.getElementById('Signup-name') as HTMLInputElement
const button = () => document.querySelector<HTMLButtonElement>('form button[type="submit"]')!

/** Runs `act` with every frame held, then lets them go: what it sent meets the page as last drawn. */
const beforeNextFrame = async (act: () => Promise<void>) => {
  const real = window.requestAnimationFrame
  const held: Array<FrameRequestCallback> = []
  window.requestAnimationFrame = callback => held.push(callback)
  try {
    await act()
  } finally {
    window.requestAnimationFrame = real
    held.forEach(callback => real.call(window, callback))
  }
}

type Frame = {
  readonly frame: { readonly id: string }
  readonly childFrames?: ReadonlyArray<Frame>
}
type AxNode = {
  readonly role?: { readonly value?: string }
  readonly properties?: ReadonlyArray<{
    readonly name: string
    readonly value: { value?: unknown }
  }>
}

/** The submit button's state in Chrome's own accessibility tree: whether it reads disabled. */
const axDisabled = async (): Promise<boolean> => {
  await cdp().send('Accessibility.enable')
  const { frameTree } = (await cdp().send('Page.getFrameTree')) as { frameTree: Frame }
  const frames: Array<Frame> = []
  const walk = (frame: Frame) => {
    frames.push(frame)
    frame.childFrames?.forEach(walk)
  }
  walk(frameTree)
  const buttons: Array<AxNode> = []
  for (const { frame } of frames) {
    const { nodes } = (await cdp().send('Accessibility.getFullAXTree', { frameId: frame.id })) as {
      nodes: ReadonlyArray<AxNode>
    }
    buttons.push(...nodes.filter(node => node.role?.value === 'button'))
  }
  expect(buttons).toHaveLength(1)
  return (
    buttons[0]!.properties?.find(property => property.name === 'disabled')?.value.value === true
  )
}

it('accepts an Enter sent before the frame that would enable the button', async () => {
  const handle = await mount()
  try {
    await userEvent.fill(name(), 'Ada')
    expect(button().matches('[aria-disabled="true"], :disabled')).toBe(true)
    // Both keys are filled and Enter pressed with no frame drawn between: the
    // button the page shows still says the form cannot submit.
    await beforeNextFrame(async () => {
      await userEvent.fill(email(), 'ada@example.com')
      await userEvent.type(email(), '{Enter}')
    })
    await vi.waitFor(() => expect(submitted).toEqual([{ email: 'ada@example.com', name: 'Ada' }]))
  } finally {
    handle.dispose()
  }
})

it('refuses an Enter the Model cannot take: it shows what is missing and submits nothing', async () => {
  const handle = await mount()
  try {
    expect(button().disabled).toBe(false)
    expect(button().getAttribute('aria-disabled')).toBe('true')
    await userEvent.fill(name(), 'Ada')
    await userEvent.type(name(), '{Enter}')
    await vi.waitFor(() => expect(email().getAttribute('aria-invalid')).toBe('true'))
    expect(name().getAttribute('aria-invalid')).toBe('false')
    expect(submitted).toEqual([])
  } finally {
    handle.dispose()
  }
})

it('refuses a press of the button, which keeps the focus it was given', async () => {
  const handle = await mount()
  try {
    // Playwright will not click an `aria-disabled` element, so press it as a script would.
    button().focus()
    button().click()
    await vi.waitFor(() => expect(email().getAttribute('aria-invalid')).toBe('true'))
    expect(name().getAttribute('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(button())
    expect(submitted).toEqual([])
  } finally {
    handle.dispose()
  }
})

it('reads disabled in Chrome’s accessibility tree while it cannot submit, and enabled once it can', async () => {
  const handle = await mount()
  try {
    expect(await axDisabled()).toBe(true)
    await userEvent.fill(name(), 'Ada')
    await userEvent.fill(email(), 'ada@example.com')
    await vi.waitFor(() =>
      expect(button().matches('[aria-disabled="true"], :disabled')).toBe(false),
    )
    expect(await axDisabled()).toBe(false)
  } finally {
    handle.dispose()
  }
})
