/**
 * A hover card over `@foldkit/ui`'s HoverIntent: a trigger read as a link to
 * something more, and a raised panel two levels above what holds it, as a
 * popover is, fading in on the fast tier as it is drawn. Place the panel
 * with the `Anchor` Mount; this styles it, takes it out of the flow (the
 * Anchor's absolute strategy writes `top` and `left` but no `position`, so
 * an unportaled card stood in the line and moved its trigger), and leaves
 * `top` and `left` alone.
 */
import { Style } from 'foldkit-mixins'
import { raise, raisedSurface, role } from 'foldkit-mixins/theme'
import { HoverIntentSlots } from '../hoverIntent.js'
import { component, focusRing, ref, transition, travelled } from './design.js'

export const HoverCard = Style.recipeFor(HoverIntentSlots)({
  base: {
    trigger: component(
      Style.self({
        padding: '0',
        border: '0',
        background: 'transparent',
        color: ref.text.link,
        font: 'inherit',
        textDecoration: 'underline dotted',
        textUnderlineOffset: '3px',
        cursor: 'pointer',
        ...transition('color'),
      }),
      Style.pseudo(':hover', { color: ref.text['link-hover'] }),
      focusRing,
    ),
    panel: component(
      Style.self({
        position: 'absolute',
        // Out of the flow at the trigger's edge it would shrink to its narrowest word.
        inlineSize: 'max-content',
        maxInlineSize: '20rem',
        padding: ref.space.md,
        border: `${ref.border.thin} solid ${ref.outline.subtle}`,
        borderRadius: ref.radius.lg,
        background: raisedSurface(),
        boxShadow: ref.shadow.lg,
        color: ref.text.default,
        ...role('body'),
        zIndex: '20',
        transitionProperty: 'opacity, translate',
        transitionDuration: `${ref.motion.fast}, ${travelled(ref.motion.fast)}`,
        transitionTimingFunction: ref.motion.ease,
      }),
      // It is drawn when it shows, so it enters from these.
      Style.enter({ opacity: '0', translate: '0 4px' }),
      raise(2),
    ),
  },
})
