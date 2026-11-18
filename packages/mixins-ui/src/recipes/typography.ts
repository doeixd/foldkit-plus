/**
 * Set type: headings stepping down the scale, body copy at the base size,
 * and quieter voices for asides, for reading; and the interface's roles
 * (`display`, `title`, `subtitle`, `caption`, `micro`), each a size and a
 * leading that step with the size ladder. The recipe sets each level
 * outright; it does not inherit a prose container, so one voice reads the
 * same anywhere.
 *
 * The level is the view's one fact: it picks the element and is written as
 * `data-level`, which this recipe reads. There is no `level` axis to keep in
 * step with it; a level of your own is `Recipes.Typography.extend`'s job
 * through a `data-level` rule, or a style of the application's own.
 */
import { Style } from 'foldkit-mixins'
import { role } from 'foldkit-mixins/theme'
import { TypographySlots } from '../typography.js'
import { component, ref } from './design.js'

const heading = (size: string) => ({
  margin: '0',
  fontFamily: ref.font.heading,
  fontSize: size,
  fontWeight: ref.weight.heading,
  lineHeight: ref.leading.tight,
  letterSpacing: ref.tracking.heading,
  color: ref.text.overt,
})

export const Typography = Style.recipeFor(TypographySlots)({
  base: {
    text: component(
      Style.self({
        margin: '0',
        fontSize: ref.size.md,
        lineHeight: ref.leading.normal,
        color: ref.text.default,
        textAlign: ref.reading.align,
      }),
      Style.states(
        {
          h1: heading(ref.size['4xl']),
          h2: heading(ref.size['3xl']),
          h3: heading(ref.size['2xl']),
          h4: heading(ref.size.xl),
          lead: {
            fontSize: ref.size.lg,
            lineHeight: ref.leading.relaxed,
            color: ref.text.subtle,
            maxInlineSize: ref.reading.measure,
          },
          body: { maxInlineSize: ref.reading.measure },
          small: { fontSize: ref.size.sm },
          muted: { fontSize: ref.size.sm, color: ref.text.muted },
          quote: {
            paddingInlineStart: ref.space.md,
            borderInlineStart: `${ref.border.heavy} solid ${ref.outline.default}`,
            fontSize: ref.size.lg,
            lineHeight: ref.leading.relaxed,
            color: ref.text.subtle,
            maxInlineSize: ref.reading.measure,
          },
          // The interface's headings are set as the reading ones are: the heading
          // font, its weight (display a step bolder) and its tracking.
          display: {
            ...role('display', { fluid: true }),
            fontFamily: ref.font.heading,
            fontWeight: `calc(${ref.weight.heading} + 100)`,
            letterSpacing: ref.tracking.heading,
          },
          title: {
            ...role('title', { fluid: true }),
            fontFamily: ref.font.heading,
            fontWeight: ref.weight.heading,
          },
          subtitle: {
            ...role('subtitle', { fluid: true }),
            fontFamily: ref.font.heading,
            fontWeight: ref.weight.heading,
          },
          caption: { ...role('caption'), color: ref.text.muted },
          micro: role('micro'),
          code: {
            padding: `0 ${ref.space['3xs']}`,
            borderRadius: ref.radius.sm,
            background: ref.surface.muted,
            fontSize: ref.size.sm,
          },
        },
        'data-level',
      ),
    ),
  },
})
