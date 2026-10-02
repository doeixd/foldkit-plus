import { Slots, Style, type StyleValue } from 'foldkit-mixins'
import { RadioGroupSlots } from 'foldkit-mixins-ui'

import { breakpoints, forSlots, t } from '../../style.js'
import { container, demoSlots, demoStyles } from './shared.js'

export const RadioGroupPageSlots = Slots.define({
  ...demoSlots,
  optionBody: container,
  optionText: container,
  meta: container,
  price: container,
  cardPrice: container,
  checkIcon: container,
  checkPlaceholder: container,
})

const price = Style.self({
  fontSize: t.size.sm,
  fontWeight: t.weight.semibold,
  color: t.accent.ink,
})

const check = Style.self({ width: '1.25rem', height: '1.25rem', flexShrink: '0' })

export const RadioGroupPageStyle = forSlots(RadioGroupPageSlots)(
  {
    ...demoStyles,
    optionBody: Style.self({
      display: 'flex',
      width: '100%',
      alignItems: 'center',
      justifyContent: 'space-between',
    }),
    meta: Style.self({ display: 'flex', alignItems: 'center', gap: t.space.sm }),
    price,
    cardPrice: Style.compose(price, Style.self({ marginTop: t.space.xs })),
    checkIcon: Style.compose(check, Style.self({ color: t.accent.default })),
    checkPlaceholder: check,
  },
  { name: 'RadioGroupPageStyle' },
)

/** `foldkit-mixins-ui` ships no RadioGroup recipe; these are upstream's plan cards. */
const card: StyleValue = Style.compose(
  Style.self({
    position: 'relative',
    display: 'flex',
    padding: t.space.md,
    border: `${t.border.thin} solid ${t.outline.subtle}`,
    borderRadius: t.radius.lg,
    cursor: 'pointer',
    outline: 'none',
    transition: `background-color ${t.motion.fast} ${t.motion.ease}`,
  }),
  Style.pseudo(':hover', { background: t.surface.subtle }),
  Style.pseudo('[data-checked]', { borderColor: t.accent.default }),
  Style.pseudo('[data-disabled]', { opacity: '0.5', cursor: 'not-allowed' }),
  Style.pseudo(':focus-visible', {
    outline: `${t.border.thick} solid ${t.accent.default}`,
    outlineOffset: '2px',
  }),
)

const plan = {
  label: Style.self({ fontSize: t.size.sm, fontWeight: t.weight.medium, color: t.text.overt }),
  description: Style.self({ margin: '0', fontSize: t.size.sm, color: t.text.muted }),
} as const

export const VerticalRadioGroupStyle = forSlots(RadioGroupSlots)(
  {
    ...plan,
    group: Style.self({ display: 'flex', flexDirection: 'column', gap: t.space.sm, width: '100%' }),
    option: card,
  },
  { name: 'VerticalRadioGroupStyle' },
)

export const HorizontalRadioGroupStyle = forSlots(RadioGroupSlots)(
  {
    ...plan,
    group: Style.compose(
      Style.self({ display: 'flex', flexDirection: 'column', gap: t.space.sm, width: '100%' }),
      Style.responsive(breakpoints, { sm: { flexDirection: 'row' } }),
    ),
    option: Style.compose(card, Style.self({ flex: '1' })),
  },
  { name: 'HorizontalRadioGroupStyle' },
)
