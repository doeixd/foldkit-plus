import { Slots, Style } from 'foldkit-mixins'

import { forSlots, t } from '../../style.js'
import { container, demoSlots, demoStyles, icon, triggerLook } from './shared.js'

/**
 * `foldkit-mixins-ui` has no Toast adapter, and `@foldkit/ui` draws each
 * entry's wrapper itself, taking only a class name for it. The entry's own
 * content takes the page's Slots; the wrapper's swipe transitions are styled
 * from the page, by the `data-swipe` phase the component writes.
 */
export const ToastPageSlots = Slots.define({
  ...demoSlots,
  intro: container,
  buttons: container,
  demoButton: container,
  code: container,
  toast: container,
  toastTitle: container,
  toastDescription: container,
  swipeIgnore: container,
  dismissButton: container,
  dismissIcon: container,
})

export const ToastPageStyle = forSlots(ToastPageSlots)(
  {
    ...demoStyles,
    page: Style.at(
      '@media (prefers-reduced-motion: no-preference)',
      Style.compose(
        Style.nest('[data-swipe="settling"]', {
          transition: 'translate 150ms ease-out',
        }),
        Style.nest('[data-swipe="end"]', { transition: 'translate 240ms ease-in' }),
      ),
    ),
    title: Style.compose(demoStyles.title, Style.self({ marginBottom: t.space.xs })),
    intro: Style.self({ maxWidth: '65ch', margin: `0 0 ${t.space.lg}`, color: t.text.muted }),
    buttons: Style.self({ display: 'flex', flexWrap: 'wrap', gap: t.space.xs }),
    demoButton: Style.compose(
      triggerLook,
      Style.self({ fontSize: t.size.sm, fontWeight: t.weight.medium }),
    ),
    code: Style.self({
      padding: `0 ${t.space['2xs']}`,
      borderRadius: t.radius.sm,
      background: t.surface.muted,
      fontFamily: t.font.mono,
      fontSize: t.size.sm,
    }),
    toast: Style.compose(
      Style.self({
        position: 'relative',
        width: '20rem',
        padding: `${t.space.sm} 2.25rem ${t.space.sm} ${t.space.sm}`,
        border: `${t.border.thin} solid ${t.outline.default}`,
        borderRadius: t.radius.lg,
        background: t.surface.base,
        color: t.text.overt,
        boxShadow: '0 1px 2px rgb(0 0 0 / 5%)',
      }),
      Style.states(
        {
          Success: {
            borderColor: t.success.outline,
            background: t.success.subtle,
            color: t.success.ink,
          },
          Warning: {
            borderColor: t.warning.outline,
            background: t.warning.subtle,
            color: t.warning.ink,
          },
          Error: { borderColor: t.error.outline, background: t.error.subtle, color: t.error.ink },
        },
        'data-variant',
      ),
    ),
    toastTitle: Style.self({ margin: '0', fontSize: t.size.sm, fontWeight: t.weight.semibold }),
    toastDescription: Style.self({
      margin: `0.125rem 0 0`,
      fontSize: t.size.sm,
      color: t.text.default,
    }),
    dismissButton: Style.compose(
      Style.self({
        position: 'absolute',
        top: t.space.xs,
        right: t.space.xs,
        display: 'flex',
        padding: '0.25rem',
        border: '0',
        borderRadius: t.radius.md,
        background: 'transparent',
        color: t.text.muted,
        cursor: 'pointer',
        transition: `color ${t.motion.fast} ${t.motion.ease}`,
      }),
      Style.pseudo(':hover', { color: t.text.overt }),
    ),
    dismissIcon: icon('1rem'),
  },
  { name: 'ToastPageStyle' },
)
