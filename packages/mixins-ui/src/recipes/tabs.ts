/**
 * Tabs: the selected tab is `aria-selected`, which `@foldkit/ui` writes.
 * `variant` is an underline under a rule or a pill in a tray; `size` the
 * tabs' step on the size ladder; `overflow: 'scroll'` keeps a long row on
 * one line, scrolled, its edges fading where more lies past them. Drawn with
 * its `indicator` and `highlight`, and given `Tabs.fluid`, the underline or
 * pill glides to the chosen tab and a hover follows the pointer; until
 * `Tabs.fluid` runs, the chosen tab marks itself. A vertical tablist
 * (`aria-orientation`, upstream's `orientation: 'Vertical'`) stacks its tabs
 * and draws its rule and underline at the inline end.
 */
import { Style } from 'foldkit-mixins'
import { ladder, nested, nests } from 'foldkit-mixins/theme'
import { Utilities } from 'foldkit-mixins/utilities'
import { TabsSlots } from '../tabs.js'
import {
  component,
  disabled,
  focusRing,
  glide,
  heldHighlight,
  hover,
  onLadder,
  ref,
  steps,
  transition,
  trimmed,
  unfilledHover,
  variant,
} from './design.js'

const selected = '[aria-selected="true"]'
/** Where `Tabs.fluid` runs; a tablist marks it while its highlight follows the pointer. */
const fluid = ':where([data-fluid-hover]) > &'
/**
 * A chosen tab marks itself until `Tabs.fluid` moves the indicator: the
 * tablist's own child, or its `item`'s, so a closable tab's item does not
 * pass for a tablist without the Mount.
 */
const markedIn = (tablist: string) =>
  `:where(${tablist}) > &${selected}, :where(${tablist}) > * > &${selected}`
const unlit = '[role="tablist"]:not([data-fluid-hover])'
const upright = '[aria-orientation="vertical"]'
const vertical = `:where(${upright})`
/** A vertical tablist right to left, whose inline end is the left. */
const verticalRtl = `:where(${upright}:dir(rtl))`

const hovered = (part: 'x' | 'y' | 'w' | 'h' | 'shown' | 'moving') => `var(--fk-tabs-hover-${part})`
const chosen = (part: 'x' | 'y' | 'w' | 'h' | 'display') =>
  part === 'display' ? 'var(--fk-tabs-chosen-display, none)' : `var(--fk-tabs-chosen-${part})`

const overlay = {
  position: 'absolute',
  // Physical: the Mounts measure from the left, in either direction.
  top: '0',
  left: '0',
  pointerEvents: 'none',
} as const

export const Tabs = Style.recipeFor(TabsSlots)({
  base: {
    tablist: component(
      Style.self({
        position: 'relative',
        display: 'flex',
        gap: ref.space['2xs'],
        isolation: 'isolate',
      }),
      // As wide as its widest tab, so the rule at its end stays beside them.
      Style.pseudo(upright, {
        flexDirection: 'column',
        alignItems: 'stretch',
        inlineSize: 'fit-content',
      }),
    ),
    // A closable tab and its close button, the button over the tab's end; a grid, so the tab fills it.
    item: component(Style.self({ position: 'relative', display: 'grid', flexShrink: '0' })),
    indicator: component(
      Style.self({
        ...overlay,
        display: 'none',
        zIndex: '-1',
        ...glide('moderate', '1'),
      }),
      Style.nest(fluid, { display: chosen('display') }),
    ),
    highlight: component(
      Style.self({
        ...overlay,
        display: 'none',
        zIndex: '-1',
        inlineSize: hovered('w'),
        blockSize: hovered('h'),
        translate: `${hovered('x')} ${hovered('y')}`,
        opacity: hovered('shown'),
        borderRadius: ref.radius.md,
        background: unfilledHover,
        ...glide('fast', hovered('moving')),
      }),
      Style.nest(fluid, { display: 'block' }),
      heldHighlight,
    ),
    tab: component(
      Style.self({
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: '0',
        ...onLadder,
        whiteSpace: 'nowrap',
        border: '0',
        background: 'transparent',
        color: ref.text.muted,
        font: 'inherit',
        fontWeight: ref.weight.medium,
        cursor: 'pointer',
        ...transition('background-color, color, box-shadow'),
      }),
      hover({ color: ref.text.overt }),
      Style.pseudo(selected, { color: ref.text.overt }),
      // Room at its end for the close button laid over it, inside what the indicator marks.
      Style.pseudo('[data-closable]', {
        paddingInlineEnd: `calc(${ladder('pad')} + ${ladder('icon')} + ${ladder('gap')})`,
      }),
      Style.nest(`${vertical} > &, ${vertical} > * > &`, { justifyContent: 'flex-start' }),
      focusRing,
      disabled,
    ),
    // The words trimmed in a block of their own: the tab is a flex row, where a trim does nothing.
    label: component(Style.self({ display: 'block', ...trimmed })),
    icon: component(
      Style.self({
        display: 'inline-flex',
        flexShrink: '0',
        inlineSize: ladder('icon'),
        blockSize: ladder('icon'),
      }),
    ),
    // A cross drawn in CSS: two diagonal bars, so the button's own box and hover stay square.
    close: component(
      Style.self({
        position: 'absolute',
        insetBlock: '0',
        insetInlineEnd: `calc(${ladder('pad')} - ${ref.space['3xs']})`,
        marginBlock: 'auto',
        inlineSize: `calc(${ladder('icon')} + 2 * ${ref.space['3xs']})`,
        blockSize: `calc(${ladder('icon')} + 2 * ${ref.space['3xs']})`,
        padding: '0',
        border: '0',
        borderRadius: ref.radius.sm,
        background: [45, -45]
          .map(
            turn =>
              `linear-gradient(${turn}deg, transparent calc(50% - ${ref.border.thin}), currentColor 0 calc(50% + ${ref.border.thin}), transparent 0) center / 40% 40% no-repeat`,
          )
          .join(', '),
        color: ref.text.muted,
        cursor: 'pointer',
        ...transition('background-color, color'),
      }),
      hover({ backgroundColor: unfilledHover, color: ref.text.overt }),
    ),
    panel: component(Style.self({ paddingBlock: ref.space.md })),
  },
  variants: {
    variant: {
      line: {
        tablist: variant(
          // A background, not an inset shadow: it lies in the padding box,
          // so a scrolling row's bar sits under the rule, not between the
          // rule and the chosen tab's.
          Style.self({
            backgroundImage: `linear-gradient(${ref.outline.default}, ${ref.outline.default})`,
            backgroundSize: `100% ${ref.border.thin}`,
            backgroundPosition: 'bottom',
            backgroundRepeat: 'no-repeat',
          }),
          // Upright, the rule runs down the inline end.
          Style.pseudo(upright, {
            backgroundImage: 'none',
            boxShadow: `inset calc(-1 * ${ref.border.thin}) 0 0 ${ref.outline.default}`,
          }),
          Style.pseudo(`${upright}:dir(rtl)`, {
            boxShadow: `inset ${ref.border.thin} 0 0 ${ref.outline.default}`,
          }),
        ),
        tab: variant(
          Style.nest(markedIn(unlit), {
            boxShadow: `inset 0 calc(-1 * ${ref.border.thick}) 0 ${ref.accent.default}`,
          }),
          Style.nest(markedIn(`${unlit}${upright}`), {
            boxShadow: `inset calc(-1 * ${ref.border.thick}) 0 0 ${ref.accent.default}`,
          }),
          Style.nest(markedIn(`${unlit}${upright}:dir(rtl)`), {
            boxShadow: `inset ${ref.border.thick} 0 0 ${ref.accent.default}`,
          }),
        ),
        // A rule under the chosen tab, at its foot.
        indicator: variant(
          Style.self({
            inlineSize: chosen('w'),
            blockSize: ref.border.thick,
            translate: `${chosen('x')} calc(${chosen('y')} + ${chosen('h')} - ${ref.border.thick})`,
            background: ref.accent.default,
          }),
          // Upright, a rule beside the chosen tab, at its inline end.
          Style.nest(`${vertical} > &`, {
            inlineSize: ref.border.thick,
            blockSize: chosen('h'),
            translate: `calc(${chosen('x')} + ${chosen('w')} - ${ref.border.thick}) ${chosen('y')}`,
          }),
          Style.nest(`${verticalRtl} > &`, { translate: `${chosen('x')} ${chosen('y')}` }),
        ),
      },
      pill: {
        tablist: variant(
          Style.self({
            inlineSize: 'fit-content',
            padding: ref.space['3xs'],
            borderRadius: ref.radius.lg,
            background: ref.surface.muted,
            // The tabs, the chosen pill and the hover take their corners from these.
            ...nests(ref.radius.lg, ref.space['3xs']),
          }),
        ),
        tab: variant(
          // Concentric with the tray's corner, inside its padding.
          Style.self({ borderRadius: nested() }),
          // The accent's tint and ink, as a pressed Segmented option: the base
          // surface on the tray barely differed from it in a dark scheme.
          Style.pseudo(selected, { color: ref.accent.ink }),
          Style.nest(markedIn(unlit), { background: ref.accent.subtle }),
        ),
        // The chosen tab's pill, under it; it dims while another tab is hovered.
        indicator: variant(
          Style.self({
            inlineSize: chosen('w'),
            blockSize: chosen('h'),
            translate: `${chosen('x')} ${chosen('y')}`,
            // The tab's own corner, so the pill meets the tab it marks.
            borderRadius: nested(),
            background: ref.accent.subtle,
            opacity: `calc(1 - 0.15 * ${hovered('shown')})`,
          }),
        ),
        // The hover, in the pill's corner; `surface.hover` chooses its ink (the
        // accent's, for a hover that tries the chosen pill on).
        highlight: variant(
          Style.self({
            borderRadius: nested(),
            background: unfilledHover,
            opacity: hovered('shown'),
          }),
          // Beside the fill it deepens, since a variant's own rule beats the base's held one.
          heldHighlight,
        ),
      },
    },
    size: {
      sm: { tablist: steps.sm },
      md: { tablist: steps.md },
      lg: { tablist: steps.lg },
    },
    overflow: {
      // Past the row's width the tabs scroll, as a browser's tab strip; none shrinks or wraps.
      scroll: {
        tablist: variant(
          Style.self({
            maxInlineSize: '100%',
            overflowX: 'auto',
            overscrollBehaviorInline: 'contain',
            scrollbarWidth: 'none',
          }),
          // A mouse has no swipe to scroll by: a thin bar to drag, its room kept
          // so nothing moves, and its thumb shown only while the row is hovered or focused.
          Style.at(
            '@media (hover: hover) and (pointer: fine)',
            Style.compose(
              Style.self({ scrollbarWidth: 'thin', scrollbarColor: 'transparent transparent' }),
              Style.pseudo(':is(:hover, :focus-within)', {
                scrollbarColor: `${ref.outline.default} transparent`,
              }),
            ),
          ),
          Utilities.scrollFade('inline'),
        ),
      },
    },
  },
  defaults: { variant: 'line' },
})
