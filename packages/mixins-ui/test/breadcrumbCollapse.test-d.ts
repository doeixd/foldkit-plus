/**
 * A folded trail's ellipsis either asks to expand or is drawn by a feature
 * the application passes; one value is never both, and the Menu is the
 * application's `BreadcrumbMenu.make`, not an option of the trail.
 */
import { Menu, Breadcrumb, BreadcrumbMenu } from '../src/index.js'
import { SlotView } from 'foldkit-mixins'

type Message =
  | { readonly _tag: 'Expand' }
  | { readonly _tag: 'GotMenu'; readonly message: Menu.Message }
const h = SlotView.inertBuilder<Message>()
const steps: ReadonlyArray<Breadcrumb.BreadcrumbStep> = [{ label: 'Home', href: '/' }]
const menu = Menu.init('trail', [])
const expand: Message = { _tag: 'Expand' }
const feature = BreadcrumbMenu.make<Message>({
  max: 3,
  menu: { model: menu, onMessage: message => ({ _tag: 'GotMenu', message }), mixins: [] },
})

Breadcrumb.view({ steps, collapse: { max: 3, onExpand: expand } }, h)
Breadcrumb.view({ steps, collapse: feature }, h)
// @ts-expect-error: an ellipsis that expands and one a feature draws are two ways to fold.
Breadcrumb.view({ steps, collapse: { ...feature, onExpand: expand } }, h)
// @ts-expect-error: the Menu is a feature the application passes, not an option of the fold.
Breadcrumb.view({ steps, collapse: { max: 3, menu: feature } }, h)
// @ts-expect-error: the landmark's name is a word, not an option of its own.
Breadcrumb.view({ steps, label: 'Trail' }, h)
