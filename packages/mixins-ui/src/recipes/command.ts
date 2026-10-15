/**
 * A command menu: a raised panel with the search field across its top, a
 * line under it, and the rows below in their groups, each a rung of the size
 * ladder, the highlighted one lit as a menu's row is, its shortcut at the
 * end in the caption role. The list scrolls past a cap, fading at an edge
 * with more beyond, under the overlay bar of `scrollBars.ts` where the view
 * draws one (`overlayBars`).
 */
import { Style } from 'foldkit-mixins'
import { ladder, nested, nests, raise, raisedSurface, role } from 'foldkit-mixins/theme'
import { Utilities } from 'foldkit-mixins/utilities'
import { CommandSlots } from '../command.js'
import { component, ref, rowOnLadder, touchText } from './design.js'
import { bar, overlaid, thumb } from './scrollBars.js'

export const Command = Style.recipeFor(CommandSlots)({
  base: {
    root: component(
      Style.self({
        display: 'flex',
        flexDirection: 'column',
        inlineSize: 'min(32rem, 100%)',
        overflow: 'hidden',
        border: `${ref.border.thin} solid ${ref.outline.subtle}`,
        borderRadius: ref.radius.xl,
        background: raisedSurface(),
        boxShadow: ref.shadow.lg,
        color: ref.text.default,
      }),
      raise(2),
    ),
    input: component(
      Style.self({
        blockSize: `calc(${ladder('height')} + ${ladder('pad')})`,
        paddingInline: ladder('pad'),
        border: '0',
        borderBlockEnd: `${ref.border.thin} solid ${ref.outline.subtle}`,
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
          padding: ref.space['2xs'],
          ...nests(ref.radius.xl, ref.space['2xs'], ref.border.thin),
        }),
        Utilities.scrollFade('block'),
      ),
      overlaid,
    ),
    // With `overlayBars`: the list's box, which its bar lies over.
    frame: component(Style.self({ position: 'relative', display: 'grid', minBlockSize: '0' })),
    bar,
    thumb,
    group: component(Style.self({})),
    heading: component(
      Style.self({
        paddingBlock: ref.space['2xs'],
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
        justifyContent: 'space-between',
        ...rowOnLadder,
        borderRadius: nested(),
        cursor: 'pointer',
      }),
      Style.pseudo('[data-active]', {
        background: ref.popup.highlight,
        color: ref.popup['highlight-ink'],
      }),
      Style.pseudo('[aria-disabled="true"]', { opacity: '0.5', cursor: 'not-allowed' }),
    ),
    shortcut: component(
      Style.self({
        color: ref.text.muted,
        ...role('caption'),
        fontVariantNumeric: 'tabular-nums',
      }),
    ),
    empty: component(
      Style.self({
        paddingBlock: ref.space.lg,
        textAlign: 'center',
        color: ref.text.muted,
        ...role('body'),
      }),
    ),
  },
})
