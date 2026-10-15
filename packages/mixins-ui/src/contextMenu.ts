import { Option } from 'effect'
import type { Attribute, Html, HtmlBuilder } from 'foldkit/html'
import { toView as menuToView, type ResolvedMenu } from './menu.js'
import type { MenuRenderInfo } from './menuView.js'
import { drawMenu } from './popupView.js'
import type { MixinList, ResolveContext } from './resolve.js'

/**
 * A context menu, shadcn's and Zag's: `@foldkit/ui`'s Menu, opened where a
 * right press landed instead of under a button, so its keys, typeahead,
 * dismissal and rows stay the Menu's. `target` goes on the area that opens
 * it: a right press records its point, and the `contextmenu` that follows
 * (a right press, Shift+F10 or the ContextMenu key, the browser's own menu
 * kept shut) opens the menu, `update` folding the Menu's own `Opened`
 * Message (`@foldkit/ui` exports no `open` for it). `toView` draws
 * the Menu with its button turned into that point, a mark of no size the
 * Menu's own anchor places the rows against; with no point, a menu opened
 * from the keyboard, the mark stands at the start of the area.
 */
export interface Point {
  readonly x: number
  readonly y: number
}

export interface TargetOptions<Message> {
  /** The Message that records a right press's point, in viewport pixels. */
  readonly onPoint: (point: Point) => Message
  /** The Message that opens the menu; `update` folds `Menu.Message.Opened` into it. */
  readonly onOpen: Message
}

/** The attributes of the area a context menu opens in. */
export const target = <Message>(
  options: TargetOptions<Message>,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Attribute<Message>> => [
  h.OnPointerDown((_type, button, _screenX, _screenY, _time, clientX, clientY) =>
    button === 2 ? Option.some(options.onPoint({ x: clientX, y: clientY })) : Option.none(),
  ),
  h.OnContextMenu(options.onOpen),
]

/** The menu's button as a mark of no size, at `point` or where it is drawn. */
const mark = (point: Option.Option<Point>) => ({
  ...Option.match(point, {
    onNone: () => ({}),
    onSome: ({ x, y }) => ({ position: 'fixed', left: `${x}px`, top: `${y}px` }),
  }),
  inlineSize: '0',
  blockSize: '0',
  padding: '0',
  border: '0',
  overflow: 'hidden',
  opacity: '0',
})

/** The Menu's `toView`, its rows placed at `point`. */
export const toView = <Message>(
  mixins: MixinList<Message>,
  context: ResolveContext<unknown, Message>,
  point: Option.Option<Point>,
): ((render: MenuRenderInfo) => Html) =>
  menuToView(mixins, context, (resolved: ResolvedMenu<Message>): Html =>
    drawMenu(
      { ...resolved, button: [...resolved.button, context.h.Style(mark(point))] },
      context.h,
    ),
  )
