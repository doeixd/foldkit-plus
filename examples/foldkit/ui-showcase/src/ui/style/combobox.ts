import { Slots, Style } from 'foldkit-mixins'

import { forSlots, t } from '../../style.js'
import { backdrop, container, demoSlots, demoStyles, floatingPanel, icon } from './shared.js'

/**
 * The city combobox, which the Dialog page draws too. `foldkit-mixins-ui` has
 * no Combobox adapter: `@foldkit/ui` draws the combobox's elements itself and
 * takes only attributes for its input, button, items, backdrop and wrappers,
 * so those are the page's own Slots. Each option takes only a class name, so
 * the options are styled from their container, by the role and the
 * `data-active`, `data-selected` and `data-disabled` the component writes.
 */
export const comboboxSlots = {
  combobox: container,
  fieldCombobox: container,
  inputWrapper: container,
  input: container,
  button: container,
  chevron: container,
  items: container,
  backdrop: container,
  itemContent: container,
  checkIcon: container,
  itemLabel: container,
} as const

export const comboboxStyles = {
  combobox: Style.self({ position: 'relative', width: '100%', maxWidth: '18rem' }),
  fieldCombobox: Style.self({ position: 'relative', width: '100%' }),
  inputWrapper: Style.self({ position: 'relative' }),
  input: Style.compose(
    Style.self({
      width: '100%',
      padding: `${t.space.xs} 2.5rem ${t.space.xs} ${t.space.sm}`,
      border: `${t.border.thin} solid ${t.outline.default}`,
      borderRadius: t.radius.lg,
      background: t.surface.base,
      font: 'inherit',
      color: t.text.overt,
      outline: 'none',
    }),
    Style.pseudo(':focus', { boxShadow: `0 0 0 ${t.border.thick} ${t.accent.default}` }),
  ),
  button: Style.compose(
    Style.self({
      position: 'absolute',
      insetBlock: '0',
      right: '0',
      display: 'flex',
      alignItems: 'center',
      paddingInline: t.space.md,
      border: '0',
      background: 'transparent',
      color: t.text.muted,
      cursor: 'pointer',
      transition: `color ${t.motion.fast} ${t.motion.ease}`,
    }),
    Style.pseudo(':hover', { color: t.text.overt }),
  ),
  chevron: icon('1rem'),
  items: Style.compose(
    floatingPanel,
    // The anchor writes the width of what the panel hangs from.
    Style.self({ width: 'var(--button-width)', overflow: 'hidden' }),
    Style.nest('[role="option"]', {
      padding: `${t.space.xs} ${t.space.sm}`,
      color: t.text.default,
      cursor: 'pointer',
    }),
    Style.nest('[role="option"][data-active]', { background: t.surface.muted }),
    Style.nest('[role="option"][data-disabled]', { opacity: '0.5', cursor: 'not-allowed' }),
  ),
  backdrop,
  itemContent: Style.self({ display: 'flex', alignItems: 'center', gap: t.space.xs }),
  checkIcon: Style.compose(
    icon('1rem'),
    Style.self({ color: t.text.overt, visibility: 'hidden' }),
    Style.nest('[data-selected] &', { visibility: 'visible' }),
  ),
} as const

export const ComboboxPageSlots = Slots.define({
  ...demoSlots,
  ...comboboxSlots,
  hintedSection: container,
  hint: container,
  tags: container,
  tag: container,
  emptyTag: container,
})

export const ComboboxPageStyle = forSlots(ComboboxPageSlots)(
  {
    ...demoStyles,
    ...comboboxStyles,
    hintedSection: Style.compose(demoStyles.section, Style.self({ marginBottom: t.space.xs })),
    hint: Style.self({ margin: `0 0 ${t.space.md}`, fontSize: t.size.sm, color: t.text.muted }),
    tags: Style.self({
      display: 'flex',
      flexWrap: 'wrap',
      gap: '0.375rem',
      marginBottom: t.space.xs,
    }),
    tag: Style.self({
      display: 'inline-flex',
      alignItems: 'center',
      gap: t.space['2xs'],
      padding: `0.125rem ${t.space.xs}`,
      borderRadius: t.radius.md,
      background: t.surface.default,
      fontSize: t.size.sm,
      color: t.text.default,
    }),
    emptyTag: Style.self({
      paddingBlock: '0.125rem',
      fontSize: t.size.sm,
      color: t.text.muted,
    }),
  },
  { name: 'ComboboxPageStyle' },
)
