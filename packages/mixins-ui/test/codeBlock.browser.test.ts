/**
 * CodeBlock in a real browser: a marked line is tinted across the whole row,
 * as wide as the widest line when the code scrolls sideways; every line's
 * code starts in one column whatever its gutter says; `wrap` keeps a long
 * line inside the frame; a floating header pins the copy button over the
 * code; `scheme: 'dark'` paints the block dark on a light page; and `follow`
 * keeps a growing block's end in view until the reader scrolls up.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import * as CodeBlock from '../src/codeBlock.js'
import { CodeBlockSlots } from '../src/codeBlock.js'
import * as Recipes from '../src/recipes/codeBlock.js'
import { unitKnobs } from './fixture.js'

const theme = Theme.standard(Theme.make({ ...unitKnobs, accent: { hue: 265, chroma: 0.16 } }))
const Message = defineMessageUnion({ Grew: {} })
type Message = typeof Message.Type
const Model = Schema.Struct({ lines: Schema.Number })
type Model = typeof Model.Type

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const long = `const short = 1\nconst long = "${'x'.repeat(200)}"\nconst end = 3`

const mount = async (
  options: Partial<CodeBlock.CodeBlockView<Message>>,
  selection: Parameters<typeof Recipes.CodeBlock>[0] = {},
  lines = 3,
) => {
  const style = Style.forSlots(CodeBlockSlots)(Recipes.CodeBlock(selection))
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(Layers.standard.declare, Layers.standard.in('theme', Theme.root(theme))) +
    style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'code-block-browser'
  container.style.inlineSize = '400px'
  document.body.appendChild(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { lines } }),
      update: (model: Model, _message: Message) => ({ model: { lines: model.lines + 1 } }),
      view: (model: Model, h: HtmlBuilder<Message>) =>
        h.div(
          [h.Id('code-block-browser')],
          [
            CodeBlock.view(
              {
                code: Array.from({ length: model.lines }, (_, index) => `line ${index}`).join('\n'),
                style,
                ...options,
              },
              h,
            ),
            h.button([h.Id('grow'), h.OnClick(Message.Grew())], ['Grow']),
          ],
        ),
    }),
  )
  await vi.waitFor(() => expect(document.querySelector('figure')).not.toBeNull())
  const figure = document.querySelector('figure')!
  return {
    handle,
    figure,
    body: figure.querySelector('pre')!,
    lines: () => Array.from(figure.querySelectorAll('code > span')),
  }
}

test('a marked line is tinted across the row, as wide as the widest line', async () => {
  const { handle, body, lines } = await mount({ code: long, marks: [{ line: 1, kind: 'added' }] })
  try {
    const [first, second] = lines()
    expect(getComputedStyle(first!).backgroundColor).not.toBe('rgba(0, 0, 0, 0)')
    expect(getComputedStyle(second!).backgroundColor).toBe('rgba(0, 0, 0, 0)')
    // The code scrolls sideways, and the short marked line is as wide as the long one.
    expect(body.scrollWidth).toBeGreaterThan(body.clientWidth)
    expect(first!.getBoundingClientRect().width).toBeCloseTo(
      second!.getBoundingClientRect().width,
      0,
    )
    expect(first!.getBoundingClientRect().width).toBeCloseTo(body.scrollWidth, 0)
  } finally {
    await handle.dispose()
  }
})

test('a short block marks its rows across the frame', async () => {
  const { handle, body, lines } = await mount({ marks: [{ line: 2, kind: 'highlight' }] })
  try {
    expect(lines()[1]!.getBoundingClientRect().width).toBeCloseTo(body.clientWidth, 0)
  } finally {
    await handle.dispose()
  }
})

test('every line starts its code in one column, whatever its gutter says', async () => {
  const { handle, lines } = await mount({ gutter: line => (line === 2 ? '+12' : '1') })
  try {
    const starts = lines().map(
      line => line.querySelector('[data-number]')!.getBoundingClientRect().right,
    )
    expect(new Set(starts.map(Math.round)).size).toBe(1)
  } finally {
    await handle.dispose()
  }
})

test('a wrapped block keeps a long line inside the frame', async () => {
  const { handle, body, lines } = await mount({ code: long, wrap: true })
  try {
    expect(body.scrollWidth).toBeLessThanOrEqual(body.clientWidth)
    const [, second] = lines()
    expect(second!.getBoundingClientRect().height).toBeGreaterThan(
      lines()[0]!.getBoundingClientRect().height * 2,
    )
  } finally {
    await handle.dispose()
  }
})

test('a floating header pins the copy button over the code, with no bar above it', async () => {
  const { handle, figure, body } = await mount({ copy: {}, title: 'a.ts' }, { header: 'float' })
  try {
    const button = figure.querySelector('button')!.getBoundingClientRect()
    const frame = figure.getBoundingClientRect()
    expect(body.getBoundingClientRect().top).toBeCloseTo(frame.top + 1, 0)
    expect(button.top).toBeGreaterThan(frame.top)
    expect(button.right).toBeLessThan(frame.right)
    expect(button.right).toBeGreaterThan(frame.right - 24)
  } finally {
    await handle.dispose()
  }
})

test('a dark block is dark on a light page', async () => {
  const page = await mount({})
  const light = getComputedStyle(page.figure).color
  await page.handle.dispose()
  document.body.replaceChildren()
  const dark = await mount({}, { scheme: 'dark' })
  try {
    // Text light on dark: the ink is not the page's.
    expect(getComputedStyle(dark.figure).colorScheme).toBe('dark')
    expect(getComputedStyle(dark.figure).color).not.toBe(light)
  } finally {
    await dark.handle.dispose()
  }
})

test('a following block keeps its end in view as it grows, until the reader scrolls up', async () => {
  const { handle, body } = await mount({ mixins: CodeBlock.follow }, {}, 20)
  body.style.maxBlockSize = '6rem'
  const grow = async () => {
    const before = body.scrollHeight
    document.querySelector<HTMLButtonElement>('#grow')!.click()
    await vi.waitFor(() => expect(body.scrollHeight).toBeGreaterThan(before))
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  }
  const atEnd = () => body.scrollHeight - body.clientHeight - body.scrollTop <= 8
  try {
    body.scrollTop = body.scrollHeight
    await new Promise(resolve => requestAnimationFrame(resolve))
    await grow()
    expect(atEnd()).toBe(true)
    body.scrollTop = 0
    await new Promise(resolve => requestAnimationFrame(resolve))
    await grow()
    expect(body.scrollTop).toBe(0)
  } finally {
    await handle.dispose()
  }
})
