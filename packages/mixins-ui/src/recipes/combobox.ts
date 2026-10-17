/**
 * A combobox: a text field with a toggle, filtering the shared popup panel.
 * The chosen row is tinted; `size` steps the field and its rows on the size
 * ladder. The field wraps the chosen values' chips (TagsInput's) before the
 * input, and a quiet clear button after it; an option is Listbox's parts,
 * the typed text in its label in the semibold weight, its check at `check`;
 * with no items, the panel's look holds the empty line in the muted ink.
 */
import { Style } from 'foldkit-mixins'
import { ComboboxSlots } from '../combobox.js'
import { ladder, role } from 'foldkit-mixins/theme'
import {
  component,
  disabled,
  focusRing,
  focusWithin,
  hover,
  onLadder,
  ref,
  steps,
  touchText,
  transition,
  unfilledHover,
} from './design.js'
import {
  backdrop,
  heading,
  highlight,
  indicator,
  item,
  mergedChoice,
  panel,
  rows,
  scroll,
  separator,
  triggerWidth,
  unlit,
} from './popup.js'
import { bar, thumb } from './scrollBars.js'
import { checkAt, optionParts } from './listbox.js'
import { chip, chipList, chipRemove } from './tagsInput.js'

export const Combobox = Style.recipeFor(ComboboxSlots)({
  base: {
    wrapper: component(Style.self({ position: 'relative', display: 'inline-block' })),
    inputWrapper: component(
      Style.self({
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: ref.space['2xs'],
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
        flex: '1 1 8ch',
        minInlineSize: '8ch',
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
    scroll,
    item: component(
      item,
      // The chosen row reads DOM state; its fill is the indicator's once that glides.
      Style.states({ true: { color: ref.accent.ink } }, 'aria-selected'),
      Style.nest(`${unlit}[aria-selected="true"]`, { background: ref.accent.subtle }),
      mergedChoice,
    ),
    heading,
    separator,
    rows,
    highlight,
    indicator,
    scrollBar: bar,
    scrollThumb: thumb,
    chips: component(chipList, Style.self({ paddingInlineStart: ref.space['2xs'] })),
    chip,
    chipRemove,
    clearButton: component(
      Style.self({
        display: 'grid',
        placeItems: 'center',
        inlineSize: '1.5em',
        blockSize: '1.5em',
        padding: '0',
        border: '0',
        borderRadius: ref.radius.full,
        background: 'transparent',
        color: ref.text.muted,
        font: 'inherit',
        lineHeight: '1',
        cursor: 'pointer',
        ...transition('background-color, color'),
      }),
      hover({ background: unfilledHover, color: ref.text.overt }),
      focusRing,
    ),
    // The panel's look, holding one quiet line rather than rows.
    empty: component(
      panel,
      Style.self({
        paddingBlock: ref.space.sm,
        paddingInline: ref.space.sm,
        color: `color-mix(in oklab, ${ref.popup.ink} 62%, transparent)`,
        ...role('body'),
      }),
    ),
    ...optionParts,
    match: component(
      Style.self({ background: 'transparent', color: 'inherit', fontWeight: ref.weight.semibold }),
    ),
  },
  variants: {
    size: {
      // On the wrapper, so the trigger and the rows it opens step together,
      // and on the panel too, which upstream portals out of the wrapper by default.
      sm: { wrapper: steps.sm, items: steps.sm, empty: steps.sm },
      md: { wrapper: steps.md, items: steps.md, empty: steps.md },
    },
    check: checkAt,
    width: {
      /** The panel at least as wide as the trigger, never narrower beside it. */
      trigger: { items: triggerWidth, empty: triggerWidth },
      auto: {},
    },
  },
  defaults: { width: 'trigger', check: 'end' },
})
