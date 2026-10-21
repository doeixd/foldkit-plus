/**
 * A command menu: a raised panel with the search field across its top, led
 * by a magnifier (`Icons.glyph`; set `--icon` on the `search` slot for
 * another), the crumbs of the page it is on before the field, a hairline
 * under it, and the rows below in their groups, a hairline between two,
 * each a rung of the size ladder: a picture at the icon size, the words
 * with a quieter description under them, the shortcut muted at the end and
 * a chevron for a row that opens a page; the highlighted row lit as a
 * menu's is. The list scrolls past a cap, fading at an edge with more
 * beyond, under the overlay bar of `scrollBars.ts` where
 * `Command.overlayBars` runs. A footer strip names the keys. `frame: 'bare'`
 * drops the panel's own edge and shadow, for a Dialog's panel to hold it.
 */
import { Style } from 'foldkit-mixins'
import { ladder, nested, nests, raise, raisedSurface, role } from 'foldkit-mixins/theme'
import { Utilities } from 'foldkit-mixins/utilities'
import { CommandSlots } from '../command.js'
import { glyph } from '../icons.js'
import { component, cornerSides, ref, rowOnLadder, touchText, variant } from './design.js'
import { bar, overlaid, thumb } from './scrollBars.js'

export const Command = Style.recipeFor(CommandSlots)({
  base: {
    root: component(
      Style.self({
        display: 'flex',
        flexDirection: 'column',
        // A width of its own, which a narrower parent caps: a parent that
        // shrinks to its content would otherwise squeeze it to its longest row.
        // The border inside it, or a capped card runs past its parent.
        boxSizing: 'border-box',
        inlineSize: '32rem',
        maxInlineSize: '100%',
        overflow: 'hidden',
        border: `${ref.border.thin} solid ${ref.outline.subtle}`,
        borderRadius: ref.radius.xl,
        background: raisedSurface(),
        boxShadow: ref.shadow.lg,
        color: ref.text.default,
      }),
      raise(2),
    ),
    search: component(
      Style.self({
        display: 'flex',
        alignItems: 'center',
        gap: ladder('gap'),
        paddingInlineStart: ladder('pad'),
        borderBlockEnd: `${ref.border.thin} solid ${ref.outline.subtle}`,
        color: ref.text.muted,
        '--icon': ref.icon.search,
      }),
      glyph(ladder('icon')),
    ),
    crumbs: component(Style.self({ display: 'flex', flex: 'none', gap: ref.space['2xs'] })),
    crumb: component(
      Style.self({
        paddingBlock: ref.space['3xs'],
        paddingInline: ref.space.xs,
        borderRadius: ref.radius.sm,
        background: ref.surface.muted,
        color: ref.text.default,
        ...role('caption'),
        whiteSpace: 'nowrap',
      }),
    ),
    input: component(
      Style.self({
        flex: '1',
        minInlineSize: '0',
        blockSize: `calc(${ladder('height')} + ${ladder('pad')})`,
        paddingInlineEnd: ladder('pad'),
        border: '0',
        background: 'transparent',
        color: ref.text.overt,
        font: 'inherit',
        ...role('body'),
        outline: 'none',
      }),
      Style.pseudo('::placeholder', { color: ref.text.muted }),
      touchText,
    ),
    // Its rows meet the panel's lower corners, inside its border.
    list: Style.compose(
      component(
        Style.self({
          maxBlockSize: '20rem',
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          padding: ref.space['2xs'],
          ...nests(ref.radius.xl, ref.space['2xs'], ref.border.thin),
        }),
        Utilities.scrollFade('block'),
      ),
      overlaid,
    ),
    // The list's box, which its bar lies over.
    frame: component(Style.self({ position: 'relative', display: 'grid', minBlockSize: '0' })),
    bar,
    thumb,
    // A hairline between two groups, across the list's padding to its edges.
    group: component(
      Style.self({}),
      Style.pseudo(':not(:first-child)', {
        marginBlockStart: ref.space['2xs'],
        marginInline: `calc(-1 * ${ref.space['2xs']})`,
        paddingBlockStart: ref.space['2xs'],
        paddingInline: ref.space['2xs'],
        borderBlockStart: `${ref.border.thin} solid ${ref.outline.divider}`,
      }),
    ),
    heading: component(
      Style.self({
        paddingBlockStart: ref.space.xs,
        paddingBlockEnd: ref.space['2xs'],
        paddingInline: ladder('row-pad'),
        color: ref.text.muted,
        ...role('caption'),
        fontWeight: ref.weight.medium,
      }),
    ),
    item: component(
      Style.self({
        display: 'flex',
        alignItems: 'center',
        gap: ref.space.xs,
        ...rowOnLadder,
        borderRadius: nested(),
        cursor: 'pointer',
      }),
      Style.pseudo('[data-active]', {
        background: ref.popup.highlight,
        color: ref.popup['highlight-ink'],
      }),
      Style.pseudo('[aria-disabled="true"]', {
        opacity: ref.knob['state-disabled'],
        cursor: 'not-allowed',
      }),
    ),
    // A drawing given at any size takes the ladder's icon size.
    icon: component(
      Style.self({ display: 'inline-flex', flex: 'none', color: ref.text.muted }),
      Style.nest('& > svg', { inlineSize: ladder('icon'), blockSize: ladder('icon') }),
    ),
    text: component(
      Style.self({ display: 'grid', flex: '1', minInlineSize: '0', gap: ref.space['3xs'] }),
    ),
    label: component(
      Style.self({ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }),
    ),
    description: component(
      Style.self({
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        color: ref.text.muted,
        ...role('caption'),
      }),
    ),
    // A key combination reads left to right in every language: without a
    // direction of its own, a right to left row draws "⌘N" as "N⌘". On the
    // keys, so the slot keeps its place at the row's end.
    shortcut: component(
      Style.self({
        flex: 'none',
        color: ref.text.muted,
        ...role('caption'),
        fontVariantNumeric: 'tabular-nums',
      }),
      Style.nest('& > *', { direction: 'ltr', unicodeBidi: 'isolate' }),
    ),
    // Two sides of a box, turned to point along the row.
    chevron: component(
      Style.self({
        flex: 'none',
        inlineSize: '0.4em',
        blockSize: '0.4em',
        ...cornerSides(ref.border.glyph, 'currentColor'),
        color: ref.text.muted,
        rotate: '-45deg',
      }),
      Style.pseudo(':dir(rtl)', { rotate: '135deg' }),
    ),
    empty: component(
      Style.self({
        paddingBlock: ref.space.lg,
        textAlign: 'center',
        color: ref.text.muted,
        ...role('body'),
      }),
    ),
    loading: component(
      Style.self({
        paddingBlock: ref.space.sm,
        paddingInline: ladder('pad'),
        color: ref.text.muted,
        ...role('caption'),
      }),
    ),
    footer: component(
      Style.self({
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: ref.space.md,
        paddingBlock: ref.space.xs,
        paddingInline: ladder('pad'),
        borderBlockStart: `${ref.border.thin} solid ${ref.outline.subtle}`,
        color: ref.text.muted,
        ...role('caption'),
      }),
    ),
    hint: component(
      Style.self({ display: 'inline-flex', alignItems: 'center', gap: ref.space['2xs'] }),
    ),
  },
  variants: {
    frame: {
      card: {},
      // Inside a Dialog's panel, which draws the edge, the corners and the shadow.
      bare: {
        root: variant(
          Style.self({
            inlineSize: '100%',
            border: '0',
            borderRadius: '0',
            background: 'transparent',
            boxShadow: 'none',
          }),
        ),
      },
    },
  },
  defaults: { frame: 'card' },
})
