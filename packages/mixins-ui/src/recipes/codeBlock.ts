/**
 * A code block: a hairline frame on the muted surface, a quiet header with
 * the title and a copy button, and the code in the mono face, its tokens in
 * the theme's `syntax` colors by the kind each carries. Line numbers and the
 * copied state follow attributes, so they need no JavaScript.
 */
import { Style } from 'foldkit-mixins'
import { CodeBlockSlots } from '../codeBlock.js'
import { component, focusRing, hover, ref } from './design.js'

/** Every kind the theme colors, as `data-kind` names it. */
const syntax = {
  'syntax-keyword': { color: ref.syntax.keyword },
  'syntax-function': { color: ref.syntax.function },
  'syntax-type': { color: ref.syntax.type },
  'syntax-string': { color: ref.syntax.string },
  'syntax-number': { color: ref.syntax.number },
  'syntax-property': { color: ref.syntax.property },
  'syntax-operator': { color: ref.syntax.operator },
  'syntax-punctuation': { color: ref.syntax.punctuation },
  'syntax-comment': { color: ref.syntax.comment, fontStyle: 'italic' },
}

export const CodeBlock = Style.recipeFor(CodeBlockSlots)({
  base: {
    root: component(
      Style.self({
        margin: '0',
        minInlineSize: '0',
        border: `${ref.border.thin} solid ${ref.outline.subtle}`,
        borderRadius: ref.radius.md,
        background: ref.surface.muted,
        overflow: 'hidden',
      }),
    ),
    header: component(
      Style.self({
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: ref.space.sm,
        paddingBlock: ref.space['2xs'],
        paddingInline: ref.space.md,
        borderBlockEnd: `${ref.border.thin} solid ${ref.outline.subtle}`,
        fontSize: ref.size.xs,
        color: ref.text.muted,
      }),
    ),
    title: component(Style.self({ fontFamily: ref.font.mono, overflowWrap: 'anywhere' })),
    copy: component(
      Style.self({
        flexShrink: '0',
        paddingBlock: ref.space['3xs'],
        paddingInline: ref.space.xs,
        border: `${ref.border.thin} solid ${ref.outline.subtle}`,
        borderRadius: ref.radius.sm,
        background: ref.surface.base,
        color: ref.text.muted,
        font: 'inherit',
        cursor: 'pointer',
      }),
      hover({ color: ref.text.default, borderColor: ref.outline.default }),
      Style.states(
        { true: { color: ref.success.ink, borderColor: ref.success.outline } },
        'data-copied',
      ),
      focusRing,
    ),
    body: component(
      Style.self({
        margin: '0',
        padding: ref.space.md,
        overflowX: 'auto',
        fontFamily: ref.font.mono,
        fontSize: ref.size.sm,
        lineHeight: ref.leading.relaxed,
        tabSize: '2',
        color: ref.text.default,
        counterReset: 'line',
      }),
    ),
    line: component(
      Style.self({ counterIncrement: 'line' }),
      // The number sits before each line, out of a selection and a copy.
      Style.nest('[data-line-numbers="true"] &::before', {
        content: 'counter(line)',
        display: 'inline-block',
        minInlineSize: '2ch',
        marginInlineEnd: ref.space.md,
        textAlign: 'end',
        color: ref.text.muted,
        userSelect: 'none',
      }),
    ),
    token: component(Style.states(syntax, 'data-kind')),
  },
})
