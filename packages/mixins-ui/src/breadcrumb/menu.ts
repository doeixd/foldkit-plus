import { Behavior, Capability } from 'foldkit-mixins'
import { hiddenRows, type CollapseFeature } from '../breadcrumb.js'
import * as Menu from '../menu.js'
import { MenuSlots } from '../menu.js'
import type { MixinList } from '../resolve.js'

/**
 * A folded trail whose ellipsis opens a Menu of the steps it hides, one row
 * each (`Breadcrumb.menuRows`). The Menu's Model is the application's, made
 * with `Menu.init` and folded with `Menu.update`; a row chosen comes out as
 * `Menu.OutMessage.Selected`, whose step `Breadcrumb.chosen` finds, for the
 * application to go to. It lives in a module of its own so a trail that never
 * opens a Menu never loads Menu.
 */
export interface MenuCollapse<Message> {
  /** The most steps drawn, the ellipsis not counted; at least 2: the first and the last. */
  readonly max: number
  readonly menu: {
    readonly model: Menu.Model
    readonly onMessage: (message: Menu.Message) => Message
    /** The Menu's style (`Recipes.Menu`) and mixins, as `Menu.view` takes them. */
    readonly mixins: MixinList<Message>
    readonly direction?: 'ltr' | 'rtl' | undefined
  }
}

/**
 * The Menu draws its own button, so the ellipsis slot's look and the accessible
 * name reach it as a Behavior on the Menu's `button`; the breadcrumb recipe puts
 * the ellipsis's look in the variants layer, over the Menu style's trigger.
 */
export const make = <Message>({ max, menu }: MenuCollapse<Message>): CollapseFeature<Message> => ({
  max,
  draw: ({ label, ellipsis, hidden, builders }, h) => {
    const asEllipsis = Behavior.forSlots(MenuSlots)<unknown, Message>(
      {
        button: Behavior.slot({
          requires: { capability: Capability.Interactive },
          attributes: () => builders.ellipsis.attrs([h.AriaLabel(label)]),
        }),
      },
      { name: 'BreadcrumbEllipsis' },
    ).mixin
    return Menu.view(
      {
        model: menu.model,
        rows: hiddenRows(hidden),
        buttonContent: h.span(builders.dots.attrs([h.AriaHidden(true)]), [ellipsis]),
        onMessage: menu.onMessage,
        mixins: [...menu.mixins, asEllipsis],
        ...(menu.direction === undefined ? {} : { direction: menu.direction }),
      },
      h,
    )
  },
})
