import { Capability, Event, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { MixinList } from './resolve.js'

/**
 * A code block publishes its regions as slots, down to each line and each
 * highlighted token; it owns no state. Highlighting is the caller's: pass the
 * tokens a tokenizer found (`foldkit-richtext-code`, `foldkit-richtext-code-shiki`)
 * and each is drawn with its `kind` as `data-kind`, which the recipe colors
 * from the theme's `syntax` group.
 */
export const CodeBlockSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  header: Slot.make({ capability: Capability.Container }),
  title: Slot.make({ capability: Capability.Container }),
  copy: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
  body: Slot.make({ capability: Capability.Container }),
  code: Slot.make({ capability: Capability.Container }),
  line: Slot.make({ capability: Capability.Container }),
  token: Slot.make({ capability: Capability.Container }),
})

/**
 * A highlighted run of the code, as offsets into it: the shape
 * `foldkit-richtext`'s `CodeToken` has, so a tokenizer's output passes as it is.
 */
export interface CodeToken {
  readonly from: number
  readonly to: number
  readonly kind: string
}

/** The copy button: what pressing it causes, and whether that has happened. */
export interface CodeBlockCopy<Message> {
  /**
   * The Message a press sends, given the code; run `foldkit-primitives`'
   * `copyText` from it. Without one the button is drawn with no handler, for
   * a page whose script copies by itself (a server-rendered static region).
   */
  readonly onCopy?: ((code: string) => Message) | undefined
  /** Draws the button as done: `data-copied="true"` and the `copied` words. */
  readonly copied?: boolean | undefined
  /** The button's words. Default: `'Copy'`. */
  readonly label?: string | undefined
  /** The words once copied. Default: `'Copied'`. */
  readonly copiedLabel?: string | undefined
}

/**
 * Code in one call: the text, the tokens that color it, a title (a file
 * name) or a language over it, line numbers, and a copy button. No upstream
 * component stands behind it.
 */
export interface CodeBlockView<Message> {
  readonly code: string
  /** Sorted, not overlapping, inside the code. Default: none, plain text. */
  readonly tokens?: ReadonlyArray<CodeToken> | undefined
  /** Written as `data-language` on the root, and shown when there is no title. */
  readonly language?: string | undefined
  /** Shown over the code: a file name, say. */
  readonly title?: string | undefined
  /** Numbers each line: `data-line-numbers="true"` on the root. */
  readonly lineNumbers?: boolean | undefined
  readonly copy?: CodeBlockCopy<Message> | undefined
  /** A style of `CodeBlockSlots`, for the block's look. */
  readonly style?: NamedStyle<typeof CodeBlockSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

/** A run of the code: plain, or one token's text with its kind. */
interface Run {
  readonly text: string
  readonly kind: string | undefined
}

/**
 * The code cut into lines of runs. A token out of order, overlapping the one
 * before it, outside the code or covering nothing throws: it is the
 * tokenizer's bug, and drawing it would color the wrong text.
 */
export const linesOf = (
  code: string,
  tokens: ReadonlyArray<CodeToken>,
): ReadonlyArray<ReadonlyArray<Run>> => {
  const runs: Array<Run> = []
  let at = 0
  for (const token of tokens) {
    if (!(Number.isInteger(token.from) && Number.isInteger(token.to)))
      throw new RangeError(
        `a ${token.kind} token at [${token.from}, ${token.to}) is not at whole offsets`,
      )
    if (token.from < at || token.to <= token.from || token.to > code.length)
      throw new RangeError(
        `a ${token.kind} token at [${token.from}, ${token.to}) is out of order, empty, or outside ${code.length} characters`,
      )
    if (token.from > at) runs.push({ text: code.slice(at, token.from), kind: undefined })
    runs.push({ text: code.slice(token.from, token.to), kind: token.kind })
    at = token.to
  }
  if (at < code.length) runs.push({ text: code.slice(at), kind: undefined })
  // A run that crosses a line break is cut at it, so each line holds its own runs.
  const lines: Array<Array<Run>> = [[]]
  for (const run of runs)
    run.text.split('\n').forEach((part, index) => {
      if (index > 0) lines.push([])
      if (part !== '') lines.at(-1)!.push({ text: part, kind: run.kind })
    })
  return lines
}

export const view = <Message>(options: CodeBlockView<Message>, h: HtmlBuilder<Message>): Html => {
  const builders = SlotView.buildersFor(
    CodeBlockSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const heading = options.title ?? options.language
  const copy = options.copy
  const header =
    heading === undefined && copy === undefined
      ? []
      : [
          h.div(builders.header.attrs(), [
            h.span(builders.title.attrs(), heading === undefined ? [] : [heading]),
            ...(copy === undefined
              ? []
              : [
                  h.button(
                    builders.copy.attrs([
                      h.Type('button'),
                      h.DataAttribute('copied', String(copy.copied === true)),
                      ...(copy.onCopy === undefined ? [] : [h.OnClick(copy.onCopy(options.code))]),
                    ]),
                    [
                      copy.copied === true
                        ? (copy.copiedLabel ?? 'Copied')
                        : (copy.label ?? 'Copy'),
                    ],
                  ),
                ]),
          ]),
        ]
  // Lines are inline and joined by the line breaks themselves, so the text of
  // the block is the code exactly, for a copy that reads it from the page.
  const lines = linesOf(options.code, options.tokens ?? []).flatMap((runs, index) => [
    ...(index === 0 ? [] : ['\n']),
    h.span(
      builders.line.attrs(),
      runs.map(run =>
        run.kind === undefined
          ? run.text
          : h.span(builders.token.attrs([h.DataAttribute('kind', run.kind)]), [run.text]),
      ),
    ),
  ])
  return h.figure(
    builders.root.attrs([
      ...(options.language === undefined ? [] : [h.DataAttribute('language', options.language)]),
      h.DataAttribute('line-numbers', String(options.lineNumbers === true)),
    ]),
    [...header, h.pre(builders.body.attrs(), [h.code(builders.code.attrs(), lines)])],
  )
}
