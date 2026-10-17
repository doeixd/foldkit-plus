/**
 * An assistant's questions in a chat: a title, each question with its
 * controls under it (the RadioGroup's, CheckboxGroup's, Input's and
 * Textarea's own recipes draw those), what is missing in the error ink
 * under its question, and the buttons at the end. Once sent, the answers are
 * a list of each question, muted, over its answer; one left blank is muted.
 *
 * The axes:
 *
 * - `variant`: `plain` (the default) on the page; `card` in a box, as a
 *   message stands in a chat.
 * - `actions`: `end` (the default) the buttons at the inline end; `start`.
 */
import { Style } from 'foldkit-mixins'
import { ladder, role } from 'foldkit-mixins/theme'
import { QuestionnaireSlots } from '../questionnaire.js'
import { component, ref, variant } from './design.js'

export const Questionnaire = Style.recipeFor(QuestionnaireSlots)({
  base: {
    root: component(
      Style.self({ display: 'grid', gap: ref.space.md, minInlineSize: '0', ...role('body') }),
    ),
    title: component(
      Style.self({
        margin: '0',
        color: ref.text.overt,
        fontWeight: ref.weight.semibold,
        ...role('subtitle'),
      }),
    ),
    progress: component(Style.self({ margin: '0', color: ref.text.muted, ...role('caption') })),
    question: component(Style.self({ display: 'grid', gap: ref.space.xs, minInlineSize: '0' })),
    prompt: component(
      Style.self({ margin: '0', color: ref.text.default, fontWeight: ref.weight.medium }),
    ),
    words: component(Style.self({ display: 'grid' })),
    field: component(Style.self({ display: 'grid', gap: ref.space['2xs'] })),
    other: component(Style.self({ paddingBlockStart: ref.space['2xs'] })),
    error: component(Style.self({ margin: '0', color: ref.error.ink, ...role('caption') })),
    actions: component(
      Style.self({ display: 'flex', flexWrap: 'wrap', gap: ladder('gap'), justifyContent: 'end' }),
    ),
    summary: component(
      Style.self({ display: 'grid', gap: ref.space['2xs'], margin: '0' }),
      // Each question but the first stands apart from the answer above it.
      Style.nest('& > dt:not(:first-child)', { marginBlockStart: ref.space.xs }),
    ),
    asked: component(Style.self({ color: ref.text.muted, ...role('caption') })),
    answer: component(
      Style.self({ margin: '0', color: ref.text.default }),
      Style.states({ true: { color: ref.text.muted } }, 'data-skipped'),
    ),
  },
  variants: {
    variant: {
      plain: {},
      card: {
        root: variant(
          Style.self({
            padding: ladder('pad'),
            border: `${ref.border.thin} solid ${ref.outline.default}`,
            borderRadius: ref.radius.lg,
            background: ref.surface.base,
          }),
        ),
      },
    },
    actions: {
      end: {},
      start: { actions: variant(Style.self({ justifyContent: 'start' })) },
    },
  },
  defaults: { variant: 'plain', actions: 'end' },
})
