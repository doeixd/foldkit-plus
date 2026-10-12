// @vitest-environment jsdom
/**
 * CodeBlock: tokens cut at line breaks and drawn by kind, the text of the
 * block exactly the code, a header only when there is something to put in
 * it, a copy button that sends the code, and a recipe that colors each kind
 * from the theme.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SlotView, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { Theme } from 'foldkit-mixins/theme'
import { CodeBlockSlots, linesOf, view } from '../src/codeBlock.js'
import { Recipes } from '../src/index.js'

const h = SlotView.inertBuilder<never>()
const code = 'const a = "x"\n// note\nreturn a'
const tokens = [
  { from: 0, to: 5, kind: 'syntax-keyword' },
  { from: 10, to: 13, kind: 'syntax-string' },
  // A comment running into the next line's start is cut at the break.
  { from: 14, to: 22, kind: 'syntax-comment' },
]

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('linesOf', () => {
  it('cuts the code into lines of plain and highlighted runs', () => {
    expect(linesOf(code, tokens)).toEqual([
      [
        { text: 'const', kind: 'syntax-keyword' },
        { text: ' a = ', kind: undefined },
        { text: '"x"', kind: 'syntax-string' },
      ],
      [{ text: '// note', kind: 'syntax-comment' }],
      [{ text: 'return a', kind: undefined }],
    ])
  })

  it('keeps an empty line, and draws code with no tokens as plain text', () => {
    expect(linesOf('a\n\nb', [])).toEqual([
      [{ text: 'a', kind: undefined }],
      [],
      [{ text: 'b', kind: undefined }],
    ])
  })

  it.each([
    [
      'overlapping the one before',
      [
        { from: 0, to: 3, kind: 'k' },
        { from: 2, to: 4, kind: 'k' },
      ],
    ],
    ['outside the code', [{ from: 30, to: 40, kind: 'k' }]],
    ['covering nothing', [{ from: 2, to: 2, kind: 'k' }]],
    ['at a fractional offset', [{ from: 0.5, to: 2, kind: 'k' }]],
  ])('refuses a token %s', (_, bad) => {
    expect(() => linesOf(code, bad)).toThrow(RangeError)
  })
})

describe('CodeBlock view', () => {
  it('draws the code exactly, each token with its kind', () => {
    const block = view({ code, tokens }, h)
    expect(Inert.text(Inert.byTag(block, 'code')[0])).toBe(code)
    expect(
      Inert.byTag(block, 'span')
        .filter(span => Inert.value(span, 'data-kind') !== undefined)
        .map(span => [Inert.value(span, 'data-kind'), Inert.text(span)]),
    ).toEqual([
      ['syntax-keyword', 'const'],
      ['syntax-string', '"x"'],
      ['syntax-comment', '// note'],
    ])
  })

  it('heads the code with its title over its language, and with nothing when it has neither', () => {
    // The header is the block's one div, its title the first span in it.
    const heading = (block: ReturnType<typeof view>) =>
      Inert.text(Inert.byTag(Inert.byTag(block, 'div')[0], 'span')[0])
    const titled = view({ code, language: 'ts', title: 'app.ts' }, h)
    expect(heading(titled)).toBe('app.ts')
    expect(Inert.value(Inert.byTag(titled, 'figure')[0], 'data-language')).toBe('ts')
    expect(heading(view({ code, language: 'ts' }, h))).toBe('ts')
    expect(Inert.byTag(view({ code }, h), 'div')).toEqual([])
  })

  it('numbers its lines only when asked', () => {
    const numbered = (lineNumbers?: boolean) =>
      Inert.value(Inert.byTag(view({ code, lineNumbers }, h), 'figure')[0], 'data-line-numbers')
    expect([numbered(true), numbered(false), numbered()]).toEqual(['true', 'false', 'false'])
  })

  it('draws a copy button with its words, and as done once copied', () => {
    const button = (copied?: boolean) =>
      Inert.byTag(view({ code, copy: { copied } }, h), 'button')[0]
    expect([Inert.text(button()), Inert.value(button(), 'data-copied')]).toEqual(['Copy', 'false'])
    expect([Inert.text(button(true)), Inert.value(button(true), 'data-copied')]).toEqual([
      'Copied',
      'true',
    ])
  })
})

const Message = defineMessageUnion({ PressedCopy: { code: Schema.String } })
type Message = typeof Message.Type
const Model = Schema.Struct({ copied: Schema.Array(Schema.String) })
type Model = typeof Model.Type

describe('CodeBlock copy', () => {
  it('sends the code when pressed', async () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      setTimeout(() => callback(performance.now()), 0),
    )
    vi.stubGlobal('cancelAnimationFrame', clearTimeout)
    const container = document.createElement('div')
    container.id = 'code-block-harness'
    document.body.appendChild(container)
    Runtime.embed(
      Runtime.makeElement({
        Model,
        container,
        init: () => ({ model: { copied: [] } }),
        update: (model: Model, message: Message) => ({
          model: { copied: [...model.copied, message.code] },
        }),
        view: (state: Model, live: HtmlBuilder<Message>) =>
          live.div(
            [],
            [
              view({ code, copy: { onCopy: text => Message.PressedCopy({ code: text }) } }, live),
              live.output([], [state.copied.join('|')]),
            ],
          ),
      }),
    )
    await vi.waitFor(() => expect(document.querySelector('button')).not.toBeNull())
    document.querySelector('button')!.click()
    await vi.waitFor(() => expect(document.querySelector('output')?.textContent).toBe(code))
  })
})

describe('CodeBlock recipe', () => {
  const sheet = Style.forSlots(CodeBlockSlots)(Recipes.CodeBlock({})).css

  it('colors each kind from the theme', () => {
    for (const kind of ['keyword', 'string', 'comment', 'function', 'type'])
      expect(sheet).toContain(`[data-kind="syntax-${kind}"]{color:var(--fk-syntax-${kind})`)
  })

  it('numbers lines under the attribute, and marks a copy done under its own', () => {
    expect(sheet).toMatch(
      /\[data-line-numbers="true"\] [^{]*::before\{[^}]*content:counter\(line\)/,
    )
    expect(sheet).toMatch(/\[data-copied="true"]\{[^}]*color:var\(--fk-success-ink\)/)
  })

  it('reads only tokens the theme declares', () => {
    const theme = Theme.compose(
      Theme.tokens,
      Theme.oklch({ accent: { h: 260, c: 0.15, l: '55%' } }),
    )
    const style = Style.forSlots(CodeBlockSlots)(Recipes.CodeBlock({}))
    const block = view({ code, tokens, title: 'a.ts', copy: {}, lineNumbers: true, style }, h)
    expect(Inert.css([block]).length).toBeGreaterThan(0)
    expect(Inert.missingTokens(block, Style.stylesheet(Theme.root(theme)))).toEqual([])
  })
})
