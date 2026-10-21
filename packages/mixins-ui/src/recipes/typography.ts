/**
 * Set type: headings stepping down the scale, body copy at the base size,
 * and quieter voices for asides, for reading; and the interface's roles
 * (`display`, `title`, `subtitle`, `caption`, `micro`), each a size and a
 * leading that step with the size ladder. The recipe sets each level
 * outright; it does not inherit a prose container, so one voice reads the
 * same anywhere.
 */
import { Style } from 'foldkit-mixins'
import { role } from 'foldkit-mixins/theme'
import { TypographySlots } from '../typography.js'
import { component, ref, variant } from './design.js'

const heading = (size: string): ReturnType<typeof variant> =>
  variant(
    Style.self({
      margin: '0',
      fontFamily: ref.font.heading,
      fontSize: size,
      fontWeight: ref.weight.heading,
      lineHeight: ref.leading.tight,
      letterSpacing: ref.tracking.heading,
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
        textAlign: ref.reading.align,
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
            maxInlineSize: ref.reading.measure,
          }),
        ),
      },
      body: { text: variant(Style.self({ maxInlineSize: ref.reading.measure })) },
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
            maxInlineSize: ref.reading.measure,
          }),
        ),
      },
      // The interface's headings are set as the reading ones are: the heading
      // font, its weight (display a step bolder) and its tracking.
      display: {
        text: variant(
          Style.self({
            ...role('display', { fluid: true }),
            fontFamily: ref.font.heading,
            fontWeight: `calc(${ref.weight.heading} + 100)`,
            letterSpacing: ref.tracking.heading,
          }),
        ),
      },
      title: {
        text: variant(
          Style.self({
            ...role('title', { fluid: true }),
            fontFamily: ref.font.heading,
            fontWeight: ref.weight.heading,
          }),
        ),
      },
      subtitle: {
        text: variant(
          Style.self({
            ...role('subtitle', { fluid: true }),
            fontFamily: ref.font.heading,
            fontWeight: ref.weight.heading,
          }),
        ),
      },
      caption: { text: variant(Style.self({ ...role('caption'), color: ref.text.muted })) },
      micro: { text: variant(Style.self(role('micro'))) },
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
