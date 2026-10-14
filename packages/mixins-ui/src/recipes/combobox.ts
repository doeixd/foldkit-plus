/**
 * A combobox: a text field with a toggle, filtering the shared popup panel.
 * The chosen row is tinted; `size` steps the field and its rows on the size ladder.
 */
import { Style } from 'foldkit-mixins'
import { ComboboxSlots } from '../combobox.js'
import { ladder } from 'foldkit-mixins/theme'
import {
  component,
  disabled,
  focusRing,
  focusWithin,
  hover,
  listScroll,
  onLadder,
  ref,
  steps,
  touchText,
  transition,
} from './design.js'
import {
  backdrop,
  heading,
  highlight,
  indicator,
  item,
  panel,
  rows,
  separator,
  unlit,
} from './popup.js'

export const Combobox = Style.recipeFor(ComboboxSlots)({
  base: {
    wrapper: component(Style.self({ position: 'relative', display: 'inline-block' })),
    inputWrapper: component(
      Style.self({
        display: 'flex',
        alignItems: 'center',
        border: `${ref.border.thin} solid ${ref.outline.default}`,
        borderRadius: ref.radius.md,
        background: ref.surface.base,
        ...transition('border-color, background-color'),
      }),
      Style.pseudo(':hover:not(:focus-within)', { borderColor: ref.outline.overt }),
      focusWithin,
    ),
    input: component(
      Style.self({
        flex: '1',
        minInlineSize: '0',
        ...onLadder,
        // Inside the wrapper's border, so the field as a whole is one rung tall.
        minBlockSize: `calc(${ladder('height')} - 2 * ${ref.border.thin})`,
        border: '0',
        background: 'transparent',
        color: ref.text.default,
        font: 'inherit',
      }),
      Style.pseudo(':focus-visible', { outline: 'none' }),
      Style.pseudo('::placeholder', { color: ref.text.muted }),
      disabled,
      touchText,
    ),
    toggleButton: component(
      Style.self({
        paddingBlock: ref.space.xs,
        paddingInline: ref.space.sm,
        border: '0',
        background: 'transparent',
        color: ref.text.muted,
        font: 'inherit',
        cursor: 'pointer',
      }),
      hover({ color: ref.text.overt }),
      focusRing,
      disabled,
    ),
    backdrop,
    items: panel,
    scroll: listScroll,
    item: component(
      item,
      // The chosen row reads DOM state; its fill is the indicator's once that glides.
      Style.states({ true: { color: ref.accent.ink } }, 'aria-selected'),
      Style.nest(`${unlit}[aria-selected="true"]`, { background: ref.accent.subtle }),
    ),
    heading,
    separator,
    rows,
    highlight,
    indicator,
  },
  variants: {
    size: {
      // On the wrapper, so the trigger and the rows it opens step together.
      sm: { wrapper: steps.sm },
      md: { wrapper: steps.md },
    },
  },
})
