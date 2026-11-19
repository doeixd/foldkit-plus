// @vitest-environment jsdom
/**
 * CodeBlock: tokens cut at line breaks and drawn by kind, the text of the
 * block exactly the code, a header only when there is something to put in
 * it, a copy button that sends the code, and a recipe that colors each kind
 * from the theme.
 */
import { Option, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { Scene } from 'foldkit/test'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SlotView, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { Theme } from 'foldkit-mixins/theme'
import { CodeBlockSlots, linesOf, view } from '../src/codeBlock.js'
import { Recipes } from '../src/index.js'
import { sends } from './fixture.js'

const h = SlotView.inertBuilder<never>()
/** A builder whose Messages are text, for the options that send one. */
const sent = SlotView.inertBuilder<string>()
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

  it('does not make a line of the break that ends the code', () => {
    expect(linesOf('a\n', [])).toEqual([[{ text: 'a', kind: undefined }]])
    // A break before a blank last line is still that line.
    expect(linesOf('a\n\n', [])).toEqual([[{ text: 'a', kind: undefined }], []])
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

  it('draws a final line break once, in the text and not as a numbered line', () => {
    const block = view({ code: 'a\n' }, h)
    expect(Inert.text(Inert.byTag(block, 'code')[0])).toBe('a\n')
    const [body] = Inert.byTag(block, 'code')
    expect(Inert.children(body).filter(child => child.sel === 'span')).toHaveLength(1)
  })

  it('names the copy button in the words given, before and after the copy, and keeps the others', () => {
    const button = (copied?: boolean) =>
      Inert.text(
        Inert.byTag(view({ code, copy: { copied }, words: { copy: 'Kopieren' } }, h), 'button')[0],
      )
    expect(button()).toBe('Kopieren')
    expect(button(true)).toBe('Copied')
    expect(Inert.text(Inert.byTag(view({ code, copy: {} }, h), 'button')[0])).toBe('Copy')
  })

  it('keeps a status region beside the copy button, which says the copied words once copied', () => {
    const status = (copied?: boolean) =>
      Inert.byRole(view({ code, copy: { copied }, words: { copied: 'Copied!' } }, h), 'status')
    expect(status()).toHaveLength(1)
    expect(Inert.text(status()[0])).toBe('')
    expect(Inert.text(status(true)[0])).toBe('Copied!')
    expect(Inert.byRole(view({ code }, h), 'status')).toEqual([])
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

describe('CodeBlock lines', () => {
  const five = 'a\nb\nc\nd\ne'
  const lines = (block: ReturnType<typeof view>) =>
    Inert.children(Inert.byTag(block, 'code')[0]).filter(child => child.sel === 'span')
  const gutters = (block: ReturnType<typeof view>) =>
    lines(block).map(line => Inert.value(Inert.children(line)[0], 'data-number'))

  it('numbers from startLine, and hands that number to every option', () => {
    const block = view<string>(
      {
        code: five,
        lineNumbers: true,
        startLine: 41,
        marks: [{ line: 42, kind: 'added' }],
        lineAction: line => (line === 44 ? Option.some(sent.b([], ['!'])) : Option.none()),
      },
      sent,
    )
    expect(gutters(block)).toEqual(['41', '42', '43', '44', '45'])
    expect(lines(block).map(line => Inert.value(line, 'data-mark'))).toEqual([
      undefined,
      'added',
      undefined,
      undefined,
      undefined,
    ])
    expect(Inert.byTag(block, 'b').map(Inert.text)).toEqual(['!'])
    // The gutter is aria-hidden and empty, so the text is the code and the action.
    expect(Inert.text(Inert.byTag(block, 'code')[0])).toBe('a\nb\nc\nd!\ne')
  })

  it('writes the gutter text in place of the number, every gutter as wide as the widest', () => {
    const block = view({ code: five, gutter: line => (line % 2 === 0 ? '1234' : '+') }, h)
    expect(gutters(block)).toEqual(['+', '1234', '+', '1234', '+'])
    expect(Inert.style(Inert.byTag(block, 'figure')[0])['--fk-code-gutter']).toBe('4ch')
    expect(Inert.value(Inert.byTag(block, 'figure')[0], 'data-line-numbers')).toBe('false')
  })

  it('draws no gutter unless numbered, given a gutter, or selectable', () => {
    expect(gutters(view({ code: five }, h))).toEqual(Array(5).fill(undefined))
    expect(Inert.style(Inert.byTag(view({ code: five }, h), 'figure')[0])).toEqual({})
  })

  it('makes each gutter a button that sends its line, pressed where the line is selected', () => {
    const block = view<string>(
      {
        code: five,
        onLineSelect: line => `line ${line}`,
        marks: [{ line: 3, kind: 'selected' }],
        words: { selectLine: 'Zeile {line}' },
      },
      sent,
    )
    const buttons = Inert.byTag(block, 'button')
    expect(buttons.map(button => Inert.value(button, 'aria-label'))).toEqual([
      'Zeile 1',
      'Zeile 2',
      'Zeile 3',
      'Zeile 4',
      'Zeile 5',
    ])
    expect(buttons.map(button => Inert.value(button, 'aria-pressed'))).toEqual([
      'false',
      'false',
      'true',
      'false',
      'false',
    ])
    sends<string>(
      drawn => view({ code: five, onLineSelect: line => `line ${line}` }, drawn),
      Scene.click(Scene.role('button', { name: 'Line 2' })),
      Scene.expectOutMessage('line 2'),
    )
  })

  it('clamps a collapsed block to its first lines, every line still in the page, and draws a button for the rest', () => {
    const block = view<string>(
      { code: `${five}\n`, collapsed: { lines: 2, onToggle: 'more' } },
      sent,
    )
    expect(Inert.text(Inert.byTag(block, 'code')[0])).toBe(`${five}\n`)
    const [figure] = Inert.byTag(block, 'figure')
    expect(Inert.value(figure, 'data-collapsed')).toBe('true')
    expect(Inert.style(figure)['--fk-code-clamp']).toBe('2')
    const [expand] = Inert.byTag(block, 'button')
    expect([
      Inert.text(expand),
      Inert.value(expand, 'aria-expanded'),
      Inert.value(expand, 'data-toggled-label'),
    ]).toEqual(['Show all 5 lines', 'false', 'Show less'])
    sends<string>(
      drawn => view({ code: five, collapsed: { lines: 2, onToggle: 'more' } }, drawn),
      Scene.click(Scene.role('button', { name: 'Show all 5 lines' })),
      Scene.expectOutMessage('more'),
    )
  })

  it('draws an expanded block unclamped, its button offering to collapse it', () => {
    const block = view<string>(
      { code: five, collapsed: { lines: 2, expanded: true, onToggle: 'less' } },
      sent,
    )
    const [figure] = Inert.byTag(block, 'figure')
    expect(Inert.value(figure, 'data-collapsed')).toBe('false')
    const [button] = Inert.byTag(block, 'button')
    expect([
      Inert.text(button),
      Inert.value(button, 'aria-expanded'),
      Inert.value(button, 'data-toggled-label'),
    ]).toEqual(['Show less', 'true', 'Show all 5 lines'])
  })

  it('draws the button with no handler when no Message is given, for a page whose script toggles it', () => {
    expect(() =>
      sends<string>(
        drawn => view({ code: five, collapsed: { lines: 2 } }, drawn),
        Scene.click(Scene.role('button', { name: 'Show all 5 lines' })),
      ),
    ).toThrow(/no click handler|has a click handler/)
  })

  it('draws a block no longer than its collapse whole, with no button', () => {
    const block = view<string>({ code: five, collapsed: { lines: 5, onToggle: 'more' } }, sent)
    expect(Inert.text(Inert.byTag(block, 'code')[0])).toBe(five)
    expect(Inert.byTag(block, 'button')).toEqual([])
    const [figure] = Inert.byTag(block, 'figure')
    expect(Inert.value(figure, 'data-collapsed')).toBeUndefined()
    expect(Inert.style(figure)).toEqual({})
  })

  it('wraps only when asked', () => {
    const wrap = (wrap?: boolean) =>
      Inert.value(Inert.byTag(view({ code: five, wrap }, h), 'figure')[0], 'data-wrap')
    expect([wrap(true), wrap(false), wrap()]).toEqual(['true', undefined, undefined])
  })

  it.each([
    ['a mark before the first line', { startLine: 10, marks: [{ line: 9, kind: 'dim' }] }],
    ['a mark past the last line', { marks: [{ line: 6, kind: 'dim' }] }],
    [
      'two marks on one line',
      {
        marks: [
          { line: 2, kind: 'added' },
          { line: 2, kind: 'dim' },
        ],
      },
    ],
    ['a fractional start', { startLine: 1.5 }],
    ['a collapse to no lines', { collapsed: { lines: 0, onToggle: 'more' } }],
  ])('refuses %s', (_, options) => {
    expect(() => view<string>({ code: five, ...options }, sent)).toThrow(RangeError)
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

  it('draws a gutter from its attribute, and marks a copy done under its own', () => {
    expect(sheet).toMatch(/::before\{[^}]*content:attr\(data-number\)/)
    expect(sheet).toMatch(/\[data-copied="true"]\{[^}]*color:var\(--fk-success-ink\)/)
  })

  it('tints each mark the view writes', () => {
    for (const [kind, tone] of [
      ['added', 'success'],
      ['removed', 'error'],
      ['highlight', 'accent'],
      ['selected', 'accent'],
      ['error', 'error'],
      ['warning', 'warning'],
    ])
      expect(sheet).toMatch(
        new RegExp(`\\[data-mark="${kind}"\\]\\{[^}]*background:var\\(--fk-${tone}-subtle\\)`),
      )
    expect(sheet).toMatch(/\[data-mark="dim"\]\{[^}]*opacity:/)
  })

  it('reads only tokens the theme declares', () => {
    const theme = Theme.standard(Theme.make({ accent: { hue: 260, chroma: 0.15, lightness: 55 } }))
    const style = Style.forSlots(CodeBlockSlots)(
      Recipes.CodeBlock({ header: 'float', scheme: 'dark' }),
    )
    const block = view<string>(
      {
        code,
        tokens,
        title: 'a.ts',
        copy: {},
        lineNumbers: true,
        marks: [{ line: 2, kind: 'added' }],
        wrap: true,
        collapsed: { lines: 1, onToggle: 'more' },
        lineAction: () => Option.some(sent.span([], ['ok'])),
        style,
      },
      sent,
    )
    expect(Inert.css([block]).length).toBeGreaterThan(0)
    expect(Inert.missingTokens(block, Style.stylesheet(Theme.root(theme)))).toEqual([])
  })
})
