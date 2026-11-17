/**
 * The formatting toolbar over a post's body: `foldkit-mixins-richtext`'s, with its one tab stop,
 * marks pressed while the selection carries them, the text style and insert menus, and the
 * shortcut each tool names. It draws from the body editor's Model (the form's control) and sends
 * the editor's own Messages, wrapped as `PressedTool`; the tab stop and the open popup are the
 * posts application's own (`Roving`, `toolsMenu`). A press leaves the focus in the text; from a
 * tool reached by key, Escape returns there (`ReturnedToBody`).
 */
import { Option } from 'effect'
import * as Mount from 'foldkit/mount'
import { Capability, Slot, Slots, SlotView, Style } from 'foldkit-mixins'
import { RovingTabindex } from 'foldkit-primitives/interaction'
import {
  FormattingToolbarSlots,
  formattingToolbar,
  type FormattingItem,
} from 'foldkit-mixins-richtext'
import { Message, Roving, type Model } from '../apps/app.js'
import { PostForm } from '../content/postForm.js'
import { HIGHEST_LEVEL } from '../content/toolsFit.js'
import { barSize, phoneBarSize } from '../styles/adminStyle.js'
import { MeasureBar } from './measureBar.js'
import { app, button, phone, t } from '../styles/style.js'

export const BodyToolsSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
})

type Tool =
  | 'undo'
  | 'redo'
  | 'style'
  | 'insert'
  | 'bulleted-list'
  | 'numbered-list'
  | 'quote'
  | { readonly mark: string }

/**
 * Undo and redo, the text style, the marks a post's Markdown can say, lists and quote, and the
 * insert menu. No link control yet: it opens `linkEditor`, which needs a draft of its own. The
 * number is the level (`toolsFit`) from which the bar moves a tool into its More menu, so a narrow
 * bar fits one row without scrolling and no tool is lost; 0 is a tool that stays in the bar.
 */
const TOOLS: ReadonlyArray<'separator' | readonly [Tool, number]> = [
  ['undo', 1],
  ['redo', 1],
  'separator',
  ['style', 0],
  'separator',
  [{ mark: 'Bold' }, 2],
  [{ mark: 'Italic' }, 2],
  [{ mark: 'Code' }, 1],
  [{ mark: 'Strikethrough' }, 1],
  'separator',
  ['bulleted-list', 1],
  ['numbered-list', 1],
  ['quote', 1],
  'separator',
  ['insert', 0],
]

/** The bar's items at a level: every tool at 0, and at each higher one those that give way in More. */
const itemsAt = (level: number): ReadonlyArray<FormattingItem> =>
  TOOLS.map((entry): FormattingItem => {
    if (entry === 'separator') return entry
    const [tool, from] = entry
    return from > 0 && level >= from ? { low: tool } : tool
  })

/** The bar's own width and scroll width, as its column gives them: what a level needs is learned, not assumed. */
const measured = Mount.mapMessage(MeasureBar(), fact =>
  Message.MeasuredTools({ width: fact.width, scroll: fact.scroll }),
)

const tool = button({ tone: 'neutral', variant: 'ghost', size: 'sm' })

export const BarStyle = Style.forSlots(FormattingToolbarSlots)(
  {
    root: Style.compose(
      Style.self({
        alignItems: 'center',
        display: 'flex',
        gap: t.space['3xs'],
        // Where the tools still do not fit (a wide window with a narrow column), the bar scrolls
        // sideways, with no scrollbar drawn; the arrow keys bring each tool into view.
        overflowX: 'auto',
        padding: t.space['2xs'],
        scrollbarWidth: 'none',
      }),
      // The narrowest phones (a 288px bar) have no room for the bar's own side padding.
      Style.media('(max-width: 26rem)', { paddingInline: '0' }),
    ),
    button: Style.compose(
      tool,
      Style.self({ flexShrink: '0', whiteSpace: 'nowrap' }),
      Style.pseudo('[aria-pressed="true"]', { background: t.accent.subtle, color: t.accent.ink }),
      Style.pseudo('[aria-disabled="true"]', { opacity: '0.45' }),
    ),
    separator: Style.compose(
      Style.self({
        background: t.outline.subtle,
        blockSize: '1.25rem',
        flexShrink: '0',
        inlineSize: '1px',
        marginInline: t.space['2xs'],
      }),
      // The narrowest phones (a 288px bar) have no room for the groups' dividers.
      Style.media('(max-width: 26rem)', { display: 'none' }),
    ),
    anchor: Style.compose(
      Style.self({ flexShrink: '0', position: 'relative' }),
      // The last menu (More, or Insert on a wide bar) opens toward the bar's start, not off the screen.
      Style.nest('&:last-child > [role="menu"]', { insetInline: 'auto 0' }),
    ),
    label: Style.self({ fontSize: t.size.sm }),
    menu: Style.self({
      background: t.surface.base,
      border: `1px solid ${t.outline.default}`,
      borderRadius: t.radius.md,
      boxShadow: t.shadow.md,
      display: 'grid',
      insetBlockStart: 'calc(100% + 6px)',
      insetInlineStart: '0',
      minInlineSize: '14rem',
      padding: t.space['2xs'],
      position: 'absolute',
      zIndex: '20',
    }),
    item: Style.compose(
      tool,
      Style.self({
        columnGap: t.space.sm,
        display: 'grid',
        gridTemplateColumns: 'auto 1fr',
        inlineSize: '100%',
        justifyContent: 'stretch',
        textAlign: 'start',
        whiteSpace: 'normal',
      }),
      Style.pseudo('[aria-checked="true"]', { background: t.accent.subtle, color: t.accent.ink }),
    ),
    itemLabel: Style.self({ fontSize: t.size.sm }),
    itemDescription: Style.self({ color: t.text.muted, fontSize: t.size.xs }),
  },
  { name: 'BodyBarStyle', layer: app },
)

const Bar = formattingToolbar<Message>().pipe(Style.attach(BarStyle))

const body = PostForm.control('body')

export const BodyTools = SlotView.forMessages<Message>()
  .define(BodyToolsSlots, (model: Model, slots, h) => {
    const draft = body.field(model.editor.form).value
    const { level } = model.toolsFit
    return h.div(slots.root.attrs([h.OnMount(measured)]), [
      Bar(
        {
          id: 'body-tools',
          document: draft.document,
          selection: draft.selection,
          storedMarks: draft.storedMarks,
          items: itemsAt(level),
          compact: level > 0,
          wrap: message => Message.PressedTool({ message: body.send(message) }),
          menu: Option.getOrUndefined(model.toolsMenu),
          toggled: (menu, open) => Message.ToggledToolsMenu({ menu, open }),
          returned: Message.ReturnedToBody(),
          roving: model.bodyTools,
          onFocus: id => Roving.wrapper.make(RovingTabindex.Message.Focused({ id })),
        },
        h,
      ),
    ])
  })
  .pipe(
    Style.attach(
      Style.forSlots(BodyToolsSlots)({
        root: Style.compose(
          Style.self({
            background: t.surface.base,
            borderBlockEnd: `1px solid ${t.outline.subtle}`,
            insetBlockStart: barSize,
            marginBlockEnd: t.space.md,
            position: 'sticky',
            zIndex: '1',
          }),
          Style.media(phone, { insetBlockStart: phoneBarSize }),
        ),
      }),
    ),
  )
