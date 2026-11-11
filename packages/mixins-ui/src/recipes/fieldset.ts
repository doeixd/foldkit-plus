/**
 * A fieldset: a legend over a group of fields, with a description under the
 * legend, `@foldkit/ui`'s Fieldset. The legend floats, which takes it out of
 * the border it would otherwise sit across and makes it an item of the
 * group like any other, so a box drawn round the group holds it and the
 * group's gap spaces it. A disabled fieldset is `disabled`, which the
 * browser passes to every control in it (and their recipes dim them); its
 * legend and description dim with them.
 *
 * `variant`: `plain` (the default) a group with no box of its own;
 * `bordered` a hairline box round it; `filled` a muted fill. A boxed group
 * pads its fields, and a control in it takes a corner concentric with the
 * box's.
 */
import { Style } from 'foldkit-mixins'
import { nests, role } from 'foldkit-mixins/theme'
import { FieldsetSlots } from '../fieldset.js'
import { component, ref, variant } from './design.js'

const gap = ref.space.md
const pad = ref.space.lg
const dimmed = Style.nest(':where(:disabled) > &', { opacity: ref.knob['state-disabled'] })

const boxed = (declarations: { readonly [property: string]: string }, border?: string) => ({
  fieldset: variant(
    Style.self({
      padding: pad,
      borderRadius: ref.radius.lg,
      ...nests(ref.radius.lg, pad, border),
      ...declarations,
    }),
  ),
})

export const Fieldset = Style.recipeFor(FieldsetSlots)({
  base: {
    fieldset: component(
      Style.self({
        display: 'flex',
        flexDirection: 'column',
        gap,
        minInlineSize: '0',
        margin: '0',
        padding: '0',
        border: '0',
      }),
    ),
    legend: component(
      Style.self({
        float: 'inline-start',
        inlineSize: '100%',
        margin: '0',
        padding: '0',
        color: ref.text.overt,
        ...role('body'),
        fontWeight: ref.weight.semibold,
      }),
      dimmed,
    ),
    // Under the legend it describes, closer than the gap between fields.
    description: component(
      Style.self({
        marginBlock: `calc(${ref.space['2xs']} - ${gap}) 0`,
        marginInline: '0',
        color: ref.text.muted,
        ...role('body'),
      }),
      dimmed,
    ),
  },
  variants: {
    variant: {
      plain: {},
      bordered: boxed(
        { border: `${ref.border.thin} solid ${ref.outline.subtle}` },
        ref.border.thin,
      ),
      filled: boxed({ background: ref.surface.muted }),
    },
  },
  defaults: { variant: 'plain' },
})
