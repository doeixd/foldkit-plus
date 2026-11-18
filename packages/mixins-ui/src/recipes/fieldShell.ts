/**
 * The shell around a control: a label (medium weight, with a quiet mark for a
 * required or an optional field), the control, a muted description and the
 * errors in the error ink. `orientation` is the view's (`data-orientation`):
 * vertical stacks the label over the control, horizontal puts the label in a
 * column of its own beside it, the description and errors under the control.
 */
import { Style } from 'foldkit-mixins'
import { role } from 'foldkit-mixins/theme'
import { FieldSlots } from '../fieldShell.js'
import { component, ref } from './design.js'

const label = component(
  Style.self({ color: ref.text.overt, ...role('body'), fontWeight: ref.weight.medium }),
  Style.nest('[data-invalid] &', { color: ref.error.ink }),
)

export const Field = Style.recipeFor(FieldSlots)({
  base: {
    root: component(
      Style.self({ display: 'grid', gap: ref.space['2xs'], minInlineSize: '0' }),
      Style.nest('&[data-orientation="horizontal"]', {
        gridTemplateColumns: 'minmax(6rem, 12rem) minmax(0, 1fr)',
        columnGap: ref.space.md,
        alignItems: 'start',
      }),
    ),
    header: component(
      Style.self({
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: ref.space.sm,
      }),
      Style.nest('[data-orientation="horizontal"] > &', { gridColumn: '1', gridRow: '1' }),
    ),
    label: Style.compose(
      label,
      component(
        Style.nest('[data-orientation="horizontal"] > &', { gridColumn: '1', gridRow: '1' }),
      ),
    ),
    marker: component(
      Style.self({ color: ref.text.muted, fontWeight: ref.weight.normal }),
      Style.nest('&[data-kind="required"]', { color: ref.error.ink }),
    ),
    labelAside: component(Style.self({ color: ref.text.muted, ...role('caption') })),
    control: component(
      Style.self({ minInlineSize: '0' }),
      Style.nest('[data-orientation="horizontal"] > &', { gridColumn: '2', gridRow: '1' }),
    ),
    description: component(
      Style.self({ margin: '0', color: ref.text.muted, ...role('caption') }),
      Style.nest('[data-orientation="horizontal"] > &', { gridColumn: '2' }),
    ),
    errors: component(
      Style.self({
        display: 'grid',
        gap: ref.space['3xs'],
        margin: '0',
        padding: '0',
        listStyle: 'none',
        color: ref.error.ink,
        ...role('caption'),
      }),
      Style.nest('[data-orientation="horizontal"] > &', { gridColumn: '2' }),
    ),
    error: component(Style.self({ margin: '0' })),
  },
})
