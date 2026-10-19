/**
 * The Toast component on a real runtime. Collapsed, the toasts behind the
 * front one peek out above it, smaller, and pointing at the stack spreads
 * them out, none over another; past `max` the oldest waits, unseen and out
 * of reach. A card leaving fades in place while the one behind it comes
 * forward at once. A toast counts down only while nothing holds the stack: the
 * pointer, focus or a hidden page holds it, and letting go goes on from
 * what was left. A swipe toward the edge past the threshold dismisses, a
 * short one springs back; Escape inside a toast and its close button
 * dismiss it; its action sends `Acted`. A loading toast waits until it is
 * settled, then counts down as its outcome. The newest toast is spoken from
 * a polite live region, and an error from an assertive one. Under reduced
 * motion the cards no longer travel, and still fade, and a loading ring
 * that turns otherwise holds still.
 */
import { Option, Schema } from 'effect'
import { mapMessages } from 'foldkit/command'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { cdp, userEvent } from 'vitest/browser'
import { Recipes, Toast, ToastSlots } from '../src/index.js'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const style = Style.forSlots(ToastSlots)(Recipes.Toast({}))
const L = Layers.standard

const Model = Schema.Struct({ toasts: Toast.Model, acted: Schema.Option(Schema.String) })
type Model = typeof Model.Type
type Message =
  | { readonly _tag: 'Got'; readonly message: Toast.Message }
  | { readonly _tag: 'Show'; readonly input: Toast.ToastInput }
  | { readonly _tag: 'Settle'; readonly id: string; readonly input: Toast.ToastInput }

const got = (message: Toast.Message): Message => ({ _tag: 'Got', message })
const lifted = (model: Model, result: ReturnType<typeof Toast.update>) => ({
  model: { ...model, toasts: result.model },
  commands: mapMessages(result.commands ?? [], got),
})

afterEach(async () => {
  await cdp().send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
  })
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

/**
 * The stack, and a button for each Message of `script` by its name, which
 * `send` presses: a test speaks to the runtime as a page does.
 */
const mount = (options: Toast.InitOptions, script: Readonly<Record<string, Message>>) => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(L.declare, L.in('reset', Defaults.reset), L.in('theme', Theme.root(theme))) +
    style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'toasts-browser'
  document.body.appendChild(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { toasts: Toast.init('toasts', options), acted: Option.none() } }),
      update: (model: Model, message: Message) => {
        switch (message._tag) {
          case 'Got': {
            const result = Toast.update(model.toasts, message.message)
            return {
              ...lifted(model, result),
              model: {
                toasts: result.model,
                acted: Option.orElse(
                  Option.map(Option.fromNullishOr(result.outMessage), ({ value }) => value),
                  () => model.acted,
                ),
              },
            }
          }
          case 'Show':
            return lifted(model, Toast.show(model.toasts, message.input))
          case 'Settle':
            return lifted(model, Toast.settle(model.toasts, message.id, message.input))
        }
      },
      view: (model: Model, h: HtmlBuilder<Message>) =>
        h.div(
          [],
          [
            h.p([h.Id('acted')], [Option.getOrElse(model.acted, () => 'nothing')]),
            ...Object.entries(script).map(([name, message]) =>
              h.button([h.Id(name), h.Type('button'), h.OnClick(message)], [name]),
            ),
            Toast.view({ model: model.toasts, onMessage: got, style }, h),
          ],
        ),
    }),
  )
  const send = async (name: string) => {
    const button = await vi.waitFor(() => {
      const found = document.getElementById(name)
      expect(found).not.toBeNull()
      return found!
    })
    button.click()
  }
  return { handle, send }
}

const show = (title: string, rest: Partial<Toast.ToastInput> = {}): Message => ({
  _tag: 'Show',
  input: { title, ...rest },
})
const card = (n: number) => document.getElementById(`toasts-${n}`)
const box = (n: number) => card(n)!.getBoundingClientRect()
const frame = () => new Promise(resolve => requestAnimationFrame(resolve))
const sleep = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds))

/** Until no card is moving. */
const settled = async () => {
  await frame()
  await vi.waitFor(() =>
    expect(document.getAnimations().filter(animation => animation.playState === 'running')).toEqual(
      [],
    ),
  )
}

/** The pointer on an empty spot of the page, away from the stack. */
const away = async () =>
  userEvent.hover(
    await vi.waitFor(() => {
      const found = document.getElementById('acted')
      expect(found).not.toBeNull()
      return found!
    }),
  )

test('collapsed the toasts peek out above the front one, smaller; held they spread out apart', async () => {
  const { handle, send } = mount(
    { duration: 60_000 },
    {
      s0: show('First'),
      s1: show('Second', { description: 'Two lines of words, so it is taller than the rest.' }),
      s2: show('Third'),
    },
  )
  try {
    await away()
    await send('s0')
    await send('s1')
    await send('s2')
    await vi.waitFor(() => expect(card(2)).not.toBeNull())
    await settled()
    // Third is in front, at the bottom; Second and First step up behind it.
    expect(box(1).top).toBeLessThan(box(2).top)
    expect(box(0).top).toBeLessThan(box(1).top)
    expect(box(1).width).toBeLessThan(box(2).width)
    expect(box(0).width).toBeLessThan(box(1).width)
    // Behind the front one, as tall as it, before its scale.
    expect(card(1)!.offsetHeight).toBe(card(2)!.offsetHeight)
    await userEvent.hover(card(2)!)
    await vi.waitFor(() =>
      expect(document.getElementById('toasts')!.hasAttribute('data-expanded')).toBe(true),
    )
    await settled()
    expect(box(1).bottom).toBeLessThanOrEqual(box(2).top)
    expect(box(0).bottom).toBeLessThanOrEqual(box(1).top)
    expect(Math.abs(box(1).width - box(2).width)).toBeLessThan(1)
    // Spread out, Second shows its whole height.
    expect(box(1).height).toBeGreaterThan(box(2).height + 4)
  } finally {
    handle.dispose()
  }
})

test('a card leaving fades in place while the one behind comes forward at once', async () => {
  const { handle, send } = mount(
    { duration: 60_000 },
    {
      s0: show('First'),
      s1: show('Second'),
      s2: show('Third'),
      d2: { _tag: 'Got', message: Toast.Message.Dismissed({ id: 'toasts-2' }) },
    },
  )
  try {
    await away()
    await send('s0')
    await send('s1')
    await send('s2')
    await vi.waitFor(() => expect(card(2)).not.toBeNull())
    await settled()
    const front = box(2)
    await send('d2')
    await vi.waitFor(() => expect(card(2)?.hasAttribute('data-leave')).toBe(true))
    await frame()
    await frame()
    // Third is still fading, and Second is already on its way to the front, its words showing.
    expect(card(2)).not.toBeNull()
    const moving = card(1)!
      .getAnimations()
      .map(animation => (animation instanceof CSSTransition ? animation.transitionProperty : ''))
    expect(moving).toContain('translate')
    expect(Number(getComputedStyle(card(1)!.firstElementChild!).opacity)).toBeGreaterThan(0)
    await vi.waitFor(() => expect(card(2)).toBeNull())
    await settled()
    expect(box(1).bottom).toBeCloseTo(front.bottom, 0)
    expect(box(1).width).toBeCloseTo(front.width, 0)
  } finally {
    handle.dispose()
  }
})

test('past max the oldest waits, unseen and out of reach', async () => {
  const { handle, send } = mount(
    { duration: 60_000, max: 2 },
    { s0: show('First'), s1: show('Second'), s2: show('Third') },
  )
  try {
    await away()
    await send('s0')
    await send('s1')
    await send('s2')
    await vi.waitFor(() => expect(card(0)?.hasAttribute('data-waiting')).toBe(true))
    await settled()
    expect(getComputedStyle(card(0)!).opacity).toBe('0')
    expect(card(0)!.inert).toBe(true)
    expect(card(1)!.hasAttribute('data-waiting')).toBe(false)
  } finally {
    handle.dispose()
  }
})

test('the pointer holds the countdown, and letting go goes on from what was left', async () => {
  const { handle, send } = mount({ duration: 1200 }, { s0: show('Saved') })
  try {
    await away()
    await send('s0')
    await vi.waitFor(() => expect(card(0)).not.toBeNull())
    await sleep(700)
    await userEvent.hover(card(0)!)
    await sleep(1500)
    expect(card(0)).not.toBeNull()
    const left = performance.now()
    await away()
    await vi.waitFor(() => expect(card(0)).toBeNull(), { timeout: 3000, interval: 20 })
    // About 500ms were left; a countdown begun afresh would take 1200.
    expect(performance.now() - left).toBeLessThan(1100)
  } finally {
    handle.dispose()
  }
})

test('a finger holds the countdown without spreading the stack, and a tap’s focus spreads nothing', async () => {
  const { handle, send } = mount(
    { duration: 600 },
    { s0: show('Saved', { action: { label: 'Undo', value: 'undo' } }) },
  )
  try {
    await away()
    await send('s0')
    const undo = await vi.waitFor(() => {
      const found = card(0)?.querySelector('button')
      expect(found).toBeTruthy()
      return found!
    })
    const stack = card(0)!.closest('[data-position]')!
    const finger = { bubbles: false, pointerType: 'touch', pointerId: 3, isPrimary: true }
    stack.dispatchEvent(new PointerEvent('pointerenter', finger))
    await sleep(900)
    // Held, it stayed past its 600ms, and stayed as it was drawn.
    expect(card(0)).not.toBeNull()
    expect(stack.hasAttribute('data-expanded')).toBe(false)
    // A tap on its action: the press, then the focus a browser may give the button.
    undo.dispatchEvent(new PointerEvent('pointerdown', { ...finger, bubbles: true }))
    undo.focus()
    await sleep(50)
    expect(stack.hasAttribute('data-expanded')).toBe(false)
    undo.blur()
    stack.dispatchEvent(new PointerEvent('pointerleave', finger))
    await vi.waitFor(() => expect(card(0)).toBeNull(), { timeout: 3000 })
  } finally {
    handle.dispose()
  }
})

test('focus in the stack holds it, and so does a hidden page', async () => {
  const { handle, send } = mount(
    { duration: 400 },
    { s0: show('Saved', { action: { label: 'Undo', value: 'undo' } }), s1: show('Again') },
  )
  try {
    await away()
    await send('s0')
    const undo = await vi.waitFor(() => {
      const found = card(0)?.querySelector('button')
      expect(found).toBeTruthy()
      return found!
    })
    undo.focus()
    await sleep(900)
    expect(card(0)).not.toBeNull()
    undo.blur()
    await vi.waitFor(() => expect(card(0)).toBeNull(), { timeout: 3000 })
    // Hidden, the page holds the next one.
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
    await send('s1')
    await vi.waitFor(() => expect(card(1)).not.toBeNull())
    await sleep(900)
    expect(card(1)).not.toBeNull()
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => expect(card(1)).toBeNull(), { timeout: 3000 })
  } finally {
    Reflect.deleteProperty(document, 'visibilityState')
    handle.dispose()
  }
})

/** A drag on a toast's body by `dx`, `dy`, as the pointer events a finger sends. */
const drag = async (n: number, dx: number, dy: number) => {
  const body = card(n)!.querySelector('div')!
  const start = body.getBoundingClientRect()
  const at = (x: number, y: number) => ({
    bubbles: true,
    pointerId: 7,
    pointerType: 'touch',
    button: 0,
    buttons: 1,
    clientX: start.left + 10 + x,
    clientY: start.top + 10 + y,
  })
  body.dispatchEvent(new PointerEvent('pointerdown', at(0, 0)))
  for (const step of [0.25, 0.5, 0.75, 1]) {
    body.dispatchEvent(new PointerEvent('pointermove', at(dx * step, dy * step)))
    await frame()
  }
  body.dispatchEvent(new PointerEvent('pointerup', at(dx, dy)))
}

test('a swipe toward the edge past the threshold dismisses; a short one springs back', async () => {
  const { handle, send } = mount({ duration: 60_000 }, { s0: show('Saved') })
  try {
    await away()
    await send('s0')
    await vi.waitFor(() => expect(card(0)).not.toBeNull())
    await settled()
    const rest = box(0)
    await drag(0, 20, 0)
    await settled()
    expect(card(0)!.hasAttribute('data-leave')).toBe(false)
    expect(Math.abs(box(0).left - rest.left)).toBeLessThan(1)
    // Toward the far side, away from the edge: it gives a little and stays.
    await drag(0, -120, 0)
    await settled()
    expect(card(0)!.hasAttribute('data-leave')).toBe(false)
    await drag(0, 90, 0)
    await vi.waitFor(() => expect(card(0)?.getAttribute('data-swiped')).toBe('x'))
    await vi.waitFor(() => expect(card(0)).toBeNull())
  } finally {
    handle.dispose()
  }
})

test('Escape inside a toast and its close button dismiss it; its action sends Acted', async () => {
  const { handle, send } = mount(
    { duration: 60_000 },
    {
      s0: show('One'),
      s1: show('Two'),
      s2: show('Three', { action: { label: 'Undo', value: 'undo' } }),
    },
  )
  try {
    await away()
    await send('s0')
    await send('s1')
    await send('s2')
    await vi.waitFor(() => expect(card(2)).not.toBeNull())
    await userEvent.click(card(2)!.querySelector('button')!)
    await vi.waitFor(() => expect(document.getElementById('acted')?.textContent).toBe('undo'))
    await vi.waitFor(() => expect(card(2)).toBeNull())
    await userEvent.click(card(1)!.querySelector('[aria-label="Dismiss"]')!)
    await vi.waitFor(() => expect(card(1)).toBeNull())
    card(0)!.querySelector<HTMLElement>('[aria-label="Dismiss"]')!.focus()
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(card(0)).toBeNull())
  } finally {
    handle.dispose()
  }
})

test('a loading toast waits to be settled, then counts down as its outcome', async () => {
  const { handle, send } = mount(
    { duration: 300 },
    {
      s0: show('Uploading', { type: 'loading' }),
      s1: { _tag: 'Settle', id: 'toasts-0', input: { type: 'success', title: 'Uploaded' } },
    },
  )
  try {
    await away()
    await send('s0')
    await vi.waitFor(() => expect(card(0)).not.toBeNull())
    expect(card(0)!.querySelector('[data-type="loading"]')).not.toBeNull()
    await sleep(700)
    expect(card(0)).not.toBeNull()
    await send('s1')
    await vi.waitFor(() => expect(card(0)?.querySelector('[data-type="success"]')).toBeTruthy())
    expect(card(0)!.textContent).toContain('Uploaded')
    await vi.waitFor(() => expect(card(0)).toBeNull(), { timeout: 3000 })
  } finally {
    handle.dispose()
  }
})

test('the newest toast is spoken politely, an error assertively', async () => {
  const { handle, send } = mount(
    { duration: 60_000 },
    {
      s0: show('Saved', { description: 'All changes are live.' }),
      s1: show('Could not sync', { type: 'error' }),
    },
  )
  try {
    await send('s0')
    const status = () => document.querySelector('#toasts [role="status"]')?.textContent
    const alert = () => document.querySelector('#toasts [role="alert"]')?.textContent
    await vi.waitFor(() => expect(status()).toBe('Saved. All changes are live.'))
    expect(alert()).toBe('')
    await send('s1')
    await vi.waitFor(() => expect(alert()).toBe('Could not sync'))
    expect(status()).toBe('Saved. All changes are live.')
    // Outside the list of toasts, so a reader meets each once there.
    expect(document.querySelector('#toasts ol [role="status"]')).toBeNull()
  } finally {
    handle.dispose()
  }
})

test('under reduced motion a card no longer travels, and still fades', async () => {
  await cdp().send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  })
  const { handle, send } = mount({ duration: 60_000 }, { s0: show('Saved') })
  try {
    await send('s0')
    await vi.waitFor(() => expect(card(0)).not.toBeNull())
    const durations = getComputedStyle(card(0)!).transitionDuration.split(', ')
    const properties = getComputedStyle(card(0)!).transitionProperty.split(', ')
    const of = (property: string) => durations[properties.indexOf(property)]
    expect(of('translate')).toBe('0s')
    expect(of('opacity')).not.toBe('0s')
  } finally {
    handle.dispose()
  }
})

test('a loading toast’s ring turns, and holds still under reduced motion', async () => {
  const ring = async () => {
    const { handle, send } = mount(
      { duration: 60_000 },
      { s0: show('Uploading', { type: 'loading' }) },
    )
    try {
      await send('s0')
      const icon = await vi.waitFor(() => {
        const found = card(0)?.querySelector('[data-type="loading"]')
        expect(found).toBeTruthy()
        return found!
      })
      const turns = document.getAnimations().filter(animation => {
        const effect = animation.effect
        return (
          effect instanceof KeyframeEffect &&
          effect.target === icon &&
          effect.pseudoElement === '::before' &&
          effect.getKeyframes().some(frame => frame['rotate'] === '360deg')
        )
      })
      const style = getComputedStyle(icon, '::before')
      return {
        turns: turns.length,
        name: style.animationName,
        seconds: parseFloat(style.animationDuration),
      }
    } finally {
      handle.dispose()
      document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
      document.body.replaceChildren()
    }
  }
  const moving = await ring()
  expect(moving.turns).toBe(1)
  expect(moving.seconds).toBeGreaterThan(0.5)
  await cdp().send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  })
  const held = await ring()
  expect(held.turns).toBe(0)
  expect(held.name).toBe('none')
})
