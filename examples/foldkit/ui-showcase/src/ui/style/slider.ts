import { Slots, Style } from 'foldkit-mixins'
import { SliderSlots } from 'foldkit-mixins-ui'

import { forSlots, t } from '../../style.js'
import { container, demoSlots, demoStyles, shadow } from './shared.js'

export const SliderPageSlots = Slots.define({
  ...demoSlots,
  row: container,
  header: container,
  value: container,
})

export const SliderPageStyle = forSlots(SliderPageSlots)(
  {
    ...demoStyles,
    row: Style.self({
      display: 'flex',
      flexDirection: 'column',
      gap: t.space.xs,
      width: '100%',
      maxWidth: '24rem',
    }),
    header: Style.self({
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      fontSize: t.size.sm,
      color: t.text.overt,
    }),
    value: Style.self({ fontVariantNumeric: 'tabular-nums', color: t.text.muted }),
  },
  { name: 'SliderPageStyle' },
)

/**
 * `foldkit-mixins-ui` ships no Slider recipe; this is upstream's accent track
 * and round thumb. `@foldkit/ui` places the filled track and the thumb with
 * inline style, marks the thumb `data-dragging` while it is held, and marks
 * the root and the track `data-vertical` when the slider stands upright.
 */
export const DemoSliderStyle = forSlots(SliderSlots)(
  {
    root: Style.compose(
      Style.self({
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        height: '1.5rem',
        userSelect: 'none',
        touchAction: 'none',
      }),
      Style.pseudo('[data-vertical]', {
        flexDirection: 'column',
        justifyContent: 'center',
        width: '1.5rem',
        height: '10rem',
      }),
    ),
    track: Style.compose(
      Style.self({
        width: '100%',
        height: '0.375rem',
        borderRadius: t.radius.full,
        background: t.surface.default,
      }),
      Style.pseudo('[data-vertical]', { width: '0.375rem', height: '100%' }),
    ),
    filledTrack: Style.self({ borderRadius: t.radius.full, background: t.accent.default }),
    thumb: Style.compose(
      Style.self({
        width: '1.25rem',
        height: '1.25rem',
        border: `${t.border.thick} solid ${t.accent.default}`,
        borderRadius: t.radius.full,
        background: t.surface.base,
        boxShadow: shadow.sm,
        cursor: 'grab',
      }),
      Style.pseudo(':focus', { outline: 'none' }),
      Style.pseudo(':focus-visible', {
        outline: `${t.border.thick} solid ${t.accent.default}`,
        outlineOffset: '2px',
      }),
      Style.pseudo('[data-dragging]', { cursor: 'grabbing' }),
    ),
    label: Style.self({ fontWeight: t.weight.medium, cursor: 'pointer', userSelect: 'none' }),
  },
  { name: 'DemoSliderStyle' },
)
