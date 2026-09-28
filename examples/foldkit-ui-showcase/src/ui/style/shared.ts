/**
 * What every component page shares: its heading, section headings, the
 * label above a trigger, and the looks of the buttons and floating panels it
 * draws itself. A page contract spreads `demoSlots` and its Style spreads
 * `demoStyles`, so the shared pieces keep one name and one look everywhere.
 */
import { Capability, Slot, Style, type StyleValue } from 'foldkit-mixins'
import { Recipes } from 'foldkit-mixins-ui'

import { t } from '../../style.js'

export const container = Slot.make({ capability: Capability.Container })

export const demoSlots = {
  page: container,
  title: container,
  section: container,
  fieldLabel: container,
  anchor: container,
} as const

export const demoStyles = {
  title: Style.self({
    margin: `0 0 ${t.space.lg}`,
    fontSize: t.size['2xl'],
    fontWeight: t.weight.bold,
    lineHeight: t.leading.tight,
    color: t.text.overt,
  }),
  section: Style.self({
    margin: `${t.space.xl} 0 ${t.space.md}`,
    fontSize: t.size.lg,
    fontWeight: t.weight.semibold,
    color: t.text.overt,
  }),
  fieldLabel: Style.self({
    display: 'block',
    marginBottom: '0.375rem',
    fontSize: t.size.sm,
    fontWeight: t.weight.medium,
    color: t.text.overt,
  }),
  anchor: Style.self({ position: 'relative' }),
} as const

/**
 * A plain `h.button` the page draws for itself takes the look the shipped
 * Button recipe gives an `@foldkit/ui` Button, so every button on the page is
 * one family. Every selection defines `button`; `StylePieces` types each slot
 * optional, hence the fallback.
 */
const buttonLook = (selection: Parameters<typeof Recipes.Button>[0]): StyleValue =>
  Recipes.Button(selection).button ?? Style.empty

/** Upstream's white trigger with a gray border. */
export const triggerLook: StyleValue = Style.compose(
  buttonLook({ tone: 'neutral', variant: 'outline' }),
  Style.self({
    borderColor: t.outline.default,
    borderRadius: t.radius.lg,
    fontWeight: t.weight.normal,
    userSelect: 'none',
  }),
)

export const primaryLook: StyleValue = Style.compose(
  buttonLook({ tone: 'accent', variant: 'solid' }),
  Style.self({ borderRadius: t.radius.lg, fontWeight: t.weight.normal }),
)

export const dangerLook: StyleValue = Style.compose(
  buttonLook({ tone: 'danger', variant: 'solid' }),
  Style.self({ borderRadius: t.radius.lg, fontWeight: t.weight.normal }),
)

/** A square icon, `1rem` for upstream's `w-4 h-4`. */
export const icon = (size: string): StyleValue =>
  Style.self({ width: size, height: size, flexShrink: '0' })

const shadowLg = '0 10px 15px -3px rgb(0 0 0 / 10%), 0 4px 6px -4px rgb(0 0 0 / 10%)'

/** A floating panel: a menu's items, a popover, a listbox. */
export const floatingPanel: StyleValue = Style.self({
  zIndex: '10',
  border: `${t.border.thin} solid ${t.outline.subtle}`,
  borderRadius: t.radius.lg,
  background: t.surface.base,
  boxShadow: shadowLg,
  outline: 'none',
})

/**
 * Upstream's `data-[closed]:scale-95 data-[closed]:opacity-0` enter and leave:
 * `@foldkit/ui` writes `data-closed` while the element animates.
 */
export const fadeScale: StyleValue = Style.compose(
  Style.self({
    transitionProperty: 'opacity, scale, translate',
    transitionDuration: '200ms',
    transitionTimingFunction: t.motion.ease,
  }),
  Style.pseudo('[data-closed]', { opacity: '0', scale: '0.95' }),
)

/** The invisible layer behind an open panel that closes it on a click. */
export const backdrop: StyleValue = Style.self({ position: 'fixed', inset: '0', zIndex: '0' })

export const shadow = { lg: shadowLg, sm: '0 1px 2px rgb(0 0 0 / 5%)' } as const
