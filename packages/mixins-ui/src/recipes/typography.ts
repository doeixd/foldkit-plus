/**
 * Set type: headings stepping down the scale, body copy at the base size,
 * and quieter voices for asides. The recipe sets each level outright; it
 * does not inherit a prose container, so one voice reads the same anywhere.
 */
import { Style } from 'foldkit-mixins'
import { TypographySlots } from '../typography.js'
import { component, ref, variant } from './design.js'

const heading = (size: string): ReturnType<typeof variant> =>
  variant(
    Style.self({
      margin: '0',
      fontSize: size,
      fontWeight: ref.weight.semibold,
      lineHeight: ref.leading.tight,
      letterSpacing: '-0.01em',
      color: ref.text.overt,
    }),
  )

export const Typography = Style.recipeFor(TypographySlots)({
  base: {
    text: component(
      Style.self({
        margin: '0',
        fontSize: ref.size.md,
        lineHeight: ref.leading.normal,
        color: ref.text.default,
      }),
    ),
  },
  variants: {
    level: {
      h1: { text: heading(ref.size['4xl']) },
      h2: { text: heading(ref.size['3xl']) },
      h3: { text: heading(ref.size['2xl']) },
      h4: { text: heading(ref.size.xl) },
      lead: {
        text: variant(
          Style.self({
            fontSize: ref.size.lg,
            lineHeight: ref.leading.relaxed,
            color: ref.text.subtle,
          }),
        ),
      },
      body: { text: variant(Style.self({})) },
      small: { text: variant(Style.self({ fontSize: ref.size.sm })) },
      muted: {
        text: variant(Style.self({ fontSize: ref.size.sm, color: ref.text.muted })),
      },
      quote: {
        text: variant(
          Style.self({
            paddingInlineStart: ref.space.md,
            borderInlineStart: `${ref.border.heavy} solid ${ref.outline.default}`,
            fontSize: ref.size.lg,
            lineHeight: ref.leading.relaxed,
            color: ref.text.subtle,
          }),
        ),
      },
      code: {
        text: variant(
          Style.self({
            padding: `0 ${ref.space['3xs']}`,
            borderRadius: ref.radius.sm,
            background: ref.surface.muted,
            fontSize: ref.size.sm,
          }),
        ),
      },
    },
  },
  defaults: { level: 'body' },
})
