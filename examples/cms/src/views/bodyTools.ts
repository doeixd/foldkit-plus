/**
 * The formatting toolbar over a post's body: `foldkit-mixins-richtext`'s, with its one tab stop,
 * marks pressed while the selection carries them, the text style and insert menus, and the
 * shortcut each tool names. It draws from the body editor's Model (the form's control) and sends
 * the editor's own Messages, wrapped as `PressedTool`; the tab stop and the open popup are the
 * posts application's own (`Roving`, `toolsMenu`).
 */
import { Option } from 'effect'
import { Capability, Slot, Slots, SlotView, Style } from 'foldkit-mixins'
import { RovingTabindex } from 'foldkit-primitives/interaction'
import {
  FormattingToolbarSlots,
  formattingToolbar,
  type FormattingItem,
} from 'foldkit-mixins-richtext'
import { Message, Roving, type Model } from '../apps/app.js'
import { PostForm } from '../content/postForm.js'
import { app, button, t } from '../styles/style.js'

export const BodyToolsSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
})

/**
 * Undo and redo, the text style, the marks a post's Markdown can say, lists and quote, and the
 * insert menu. No link control yet: it opens `linkEditor`, which needs a draft of its own.
 */
const ITEMS: ReadonlyArray<FormattingItem> = [
  'undo',
  'redo',
  'separator',
  'style',
  'separator',
  { mark: 'Bold' },
  { mark: 'Italic' },
  { mark: 'Code' },
  { mark: 'Strikethrough' },
  'separator',
  'bulleted-list',
  'numbered-list',
  'quote',
  'separator',
  'insert',
]

const tool = button({ tone: 'neutral', variant: 'ghost', size: 'sm' })

export const BarStyle = Style.forSlots(FormattingToolbarSlots)(
  {
    root: Style.self({
      alignItems: 'center',
      display: 'flex',
      gap: t.space['3xs'],
      // A phone's bar scrolls sideways rather than wrapping its tools onto a second row.
      overflowX: 'auto',
      padding: t.space['2xs'],
    }),
    button: Style.compose(
      tool,
      Style.self({ flexShrink: '0', whiteSpace: 'nowrap' }),
      Style.pseudo('[aria-pressed="true"]', { background: t.accent.subtle, color: t.accent.ink }),
      Style.pseudo('[aria-disabled="true"]', { opacity: '0.45' }),
    ),
    separator: Style.self({
      background: t.outline.subtle,
      blockSize: '1.25rem',
      flexShrink: '0',
      inlineSize: '1px',
      marginInline: t.space['2xs'],
    }),
    anchor: Style.self({ flexShrink: '0', position: 'relative' }),
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
    return h.div(slots.root.attrs(), [
      Bar(
        {
          id: 'body-tools',
          document: draft.document,
          selection: draft.selection,
          storedMarks: draft.storedMarks,
          items: ITEMS,
          wrap: message => Message.PressedTool({ message: body.send(message) }),
          menu: Option.getOrUndefined(model.toolsMenu),
          toggled: (menu, open) => Message.ToggledToolsMenu({ menu, open }),
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
        root: Style.self({
          background: t.surface.base,
          borderBlockEnd: `1px solid ${t.outline.subtle}`,
          insetBlockStart: '0',
          marginBlockEnd: t.space.md,
          position: 'sticky',
          zIndex: '1',
        }),
      }),
    ),
  )
