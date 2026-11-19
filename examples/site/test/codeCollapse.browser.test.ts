/**
 * A long code block of the site in a real browser, as a static region draws it
 * (a button with no handler, the page's script flipping it): clipped to its
 * first lines in the served markup, every line still in the page so a copy
 * reaches the whole code, and a real button whose press toggles it, keeps the
 * focus and says `aria-expanded`. A short block is untouched.
 */
import { Match, Schema } from 'effect'
import { inertHtml, type Html } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Subscription, type Update } from 'foldkit'
import { Style } from 'foldkit-mixins'
import { afterEach, expect, test, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'

import { codeBlock } from '../src/content/render.js'
import { Message, ToggleCode, CopyCode, codeCopy, codeToggle } from '../src/shell.js'
import { stylesheet } from '../src/style.js'

afterEach(() => {
  vi.restoreAllMocks()
  document.body.replaceChildren()
  document.body.removeAttribute('style')
})

const Model = Schema.Struct({})
type Model = typeof Model.Type
const codeOf = (count: number) =>
  Array.from({ length: count }, (_, at) => `const line${at} = ${at}`).join('\n')

const mount = async (count: number) => {
  Style.install(stylesheet)
  document.body.style.margin = '0'
  document.body.style.background = 'var(--fk-surface-base)'
  const container = document.createElement('div')
  container.id = 'code-collapse-page'
  document.body.appendChild(container)
  const code = codeOf(count)
  Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: {} }),
      // Only the two code Messages matter here; the rest of the shell's update is the page's.
      update: (model: Model, message: Message): Update.Return<Model, Message> =>
        Match.value(message).pipe(
          Match.tag('PressedCodeToggle', ({ index }) => ({
            model,
            commands: [ToggleCode({ index })],
          })),
          Match.tag('PressedCodeCopy', ({ index }) => ({ model, commands: [CopyCode({ index })] })),
          Match.orElse(() => ({ model })),
        ),
      subscriptions: Subscription.make<Model, Message>()(() => ({ codeCopy, codeToggle })),
      view: (): Html =>
        inertHtml.div([], [codeBlock(inertHtml, () => [], { code, lang: 'ts', copy: true })]),
    }),
  )
  await vi.waitFor(() => expect(document.querySelector('pre')).not.toBeNull())
  const figure = document.querySelector('figure')!
  return {
    code,
    figure,
    body: figure.querySelector('pre')!,
    lines: () => figure.querySelector('code')!.children,
  }
}

const lineHeightOf = (body: Element) => Number.parseFloat(getComputedStyle(body).lineHeight)

test('a long block is clipped to about twelve lines in the markup, and keeps all of its code', async () => {
  await page.viewport(390, 844)
  const { code, figure, body } = await mount(60)
  const button = figure.querySelector('button[aria-expanded]')!
  expect(figure.dataset['collapsed']).toBe('true')
  expect(button.getAttribute('aria-expanded')).toBe('false')
  // Twelve lines and the block's padding, not sixty: no scrolling script has run yet.
  const padding =
    Number.parseFloat(getComputedStyle(body).paddingTop) +
    Number.parseFloat(getComputedStyle(body).paddingBottom)
  expect(body.getBoundingClientRect().height).toBeLessThan(14 * lineHeightOf(body) + padding)
  expect(body.getBoundingClientRect().height).toBeGreaterThan(10 * lineHeightOf(body))
  expect(body.textContent).toBe(code)
})

test('Copy copies the whole code of a collapsed block', async () => {
  const { code, figure } = await mount(60)
  const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
  await userEvent.click(figure.querySelector<HTMLElement>('[data-copy-code]')!)
  await vi.waitFor(() => expect(write).toHaveBeenCalledWith(code))
})

test('the button opens and closes the block, says so, and keeps the focus', async () => {
  const { figure, body } = await mount(60)
  const button = figure.querySelector<HTMLElement>('[data-expand-code]')!
  const closed = body.getBoundingClientRect().height
  const labelClosed = button.textContent
  expect(labelClosed).toBe('Show all 60 lines')
  await userEvent.click(button)
  await vi.waitFor(() => expect(button.getAttribute('aria-expanded')).toBe('true'))
  expect(figure.dataset['collapsed']).toBe('false')
  expect(button.textContent).toBe('Show less')
  expect(document.activeElement).toBe(button)
  expect(body.getBoundingClientRect().height).toBeGreaterThan(closed * 4)
  await userEvent.click(button)
  await vi.waitFor(() => expect(button.getAttribute('aria-expanded')).toBe('false'))
  expect(figure.dataset['collapsed']).toBe('true')
  expect(button.textContent).toBe(labelClosed)
  expect(document.activeElement).toBe(button)
  expect(body.getBoundingClientRect().height).toBeCloseTo(closed, 0)
})

test('a block of fourteen lines or fewer has no button and no clip', async () => {
  const { figure, body } = await mount(14)
  expect(figure.querySelector('[data-expand-code]')).toBeNull()
  expect(figure.dataset['collapsed']).toBeUndefined()
  const padding =
    Number.parseFloat(getComputedStyle(body).paddingTop) +
    Number.parseFloat(getComputedStyle(body).paddingBottom)
  expect(body.getBoundingClientRect().height).toBeCloseTo(14 * lineHeightOf(body) + padding, 0)
})
