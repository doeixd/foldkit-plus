/**
 * A code block: a hairline frame on the muted surface, a quiet header with
 * the title and a copy button, and the code in the mono face, its tokens in
 * the theme's `syntax` colors by the kind each carries. Each line is as wide
 * as the widest, so a mark (`data-mark`) tints the whole row; the gutter
 * draws its number from `data-number`, out of a selection and a copy.
 * `header: 'float'` drops the bar and pins the copy button over the code's
 * corner; `scheme: 'dark'` keeps the block dark on a light page.
 */
import { Style } from 'foldkit-mixins'
import { Utilities } from 'foldkit-mixins/utilities'
import { CodeBlockSlots } from '../codeBlock/slots.js'
import { component, focusRing, hover, HOVERED, ref, unfilledHover, variant } from './design.js'

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

/** Every mark the recipe tints a line for, as `data-mark` names it. */
const marks = {
  added: { background: ref.success.subtle, '--_fk-code-gutter-ink': ref.success.ink },
  removed: { background: ref.error.subtle, '--_fk-code-gutter-ink': ref.error.ink },
  highlight: { background: ref.accent.subtle },
  selected: { background: ref.accent.subtle, '--_fk-code-gutter-ink': ref.accent.ink },
  error: { background: ref.error.subtle, '--_fk-code-gutter-ink': ref.error.ink },
  warning: { background: ref.warning.subtle, '--_fk-code-gutter-ink': ref.warning.ink },
  dim: { opacity: ref.knob['state-disabled'] },
}

const wrapped = ':where([data-wrap="true"]) &'
const pad = ref.space.md

export const CodeBlock = Style.recipeFor(CodeBlockSlots)({
  base: {
    root: component(
      Style.self({
        position: 'relative',
        margin: '0',
        minInlineSize: '0',
        border: `${ref.border.thin} solid ${ref.outline.default}`,
        borderRadius: ref.radius.md,
        background: ref.surface.subtle,
        color: ref.text.default,
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
        paddingInline: pad,
        borderBlockEnd: `${ref.border.thin} solid ${ref.outline.default}`,
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
        border: `${ref.border.thin} solid ${ref.outline.default}`,
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
    status: component(Utilities.srOnly),
    body: component(
      Style.self({
        margin: '0',
        paddingBlock: pad,
        paddingInline: '0',
        overflowX: 'auto',
        fontFamily: ref.font.mono,
        fontSize: ref.size.sm,
        lineHeight: ref.leading.relaxed,
        tabSize: '2',
      }),
      Style.nest(wrapped, { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }),
      // The fade says there is more below, over the last lines drawn.
      Style.nest(':where([data-collapsed="true"]) > &', {
        maskImage: 'linear-gradient(to bottom, black calc(100% - 4lh), transparent)',
      }),
    ),
    // As wide as the widest line and never narrower than the body, so each line's row is too.
    code: component(
      Style.self({ display: 'block', inlineSize: 'max-content', minInlineSize: '100%' }),
      Style.nest(wrapped, { inlineSize: 'auto' }),
    ),
    line: component(
      Style.self({
        display: 'inline-block',
        boxSizing: 'border-box',
        inlineSize: '100%',
        minBlockSize: '1lh',
        paddingInline: pad,
      }),
      Style.states(marks, 'data-mark'),
    ),
    gutter: component(
      Style.self({
        display: 'inline-block',
        boxSizing: 'content-box',
        minInlineSize: 'var(--fk-code-gutter, 2ch)',
        marginInlineEnd: pad,
        padding: '0',
        border: '0',
        background: 'transparent',
        font: 'inherit',
        lineHeight: 'inherit',
        textAlign: 'end',
        color: `var(--_fk-code-gutter-ink, ${ref.text.muted})`,
        userSelect: 'none',
        verticalAlign: 'top',
      }),
      Style.nest('&::before', { content: 'attr(data-number)' }),
      Style.nest('&:is(button)', { cursor: 'pointer', borderRadius: ref.radius.sm }),
      Style.nest(`&:is(button)${HOVERED}`, { color: ref.text.default, background: unfilledHover }),
      Style.states({ true: { color: ref.accent.ink } }, 'aria-pressed'),
      focusRing,
    ),
    token: component(Style.states(syntax, 'data-kind')),
    lineAction: component(
      Style.self({
        float: 'inline-end',
        marginInlineStart: ref.space.sm,
        fontFamily: ref.font.body,
        fontSize: ref.size.xs,
        whiteSpace: 'nowrap',
      }),
    ),
    expand: component(
      Style.self({
        display: 'block',
        inlineSize: '100%',
        paddingBlock: ref.space.xs,
        border: '0',
        borderBlockStart: `${ref.border.thin} solid ${ref.outline.default}`,
        background: 'transparent',
        color: ref.text.muted,
        font: 'inherit',
        fontSize: ref.size.xs,
        cursor: 'pointer',
      }),
      hover({ color: ref.text.default, background: unfilledHover }),
      focusRing,
    ),
  },
  variants: {
    header: {
      bar: {},
      // No bar: the copy button pins to the code's corner, and the title is left to the page.
      float: {
        header: variant(
          Style.self({
            position: 'absolute',
            insetBlockStart: ref.space.xs,
            insetInlineEnd: ref.space.xs,
            zIndex: '1',
            padding: '0',
            border: '0',
          }),
        ),
        title: variant(Style.self({ display: 'none' })),
        // Room at each line's end for the pinned button, so it never sits over the code.
        line: variant(Style.self({ paddingInlineEnd: `calc(${pad} + 4.5rem)` })),
      },
    },
    scheme: {
      page: {},
      // Inside, `light-dark()` tokens resolve to their dark half.
      dark: { root: variant(Style.self({ colorScheme: 'dark' })) },
    },
  },
  defaults: { header: 'bar', scheme: 'page' },
})
