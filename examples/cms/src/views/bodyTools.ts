/**
 * The formatting toolbar over a post's body: one tab stop, the arrows between tools, each
 * mark pressed while the selection carries it, and the shortcut written beside the tool
 * that has one. It draws from the body editor's Model (the form's control) and sends
 * the editor's own Messages, wrapped as `PressedTool`; the one tab stop is the posts
 * application's own (`Roving`).
 */
import { Option } from 'effect'
import { Capability, Slot, Slots, SlotView, Style } from 'foldkit-mixins'
import {
  Button,
  ButtonSlots,
  Recipes,
  Toolbar,
  ToolbarSlots as UiToolbarSlots,
} from 'foldkit-mixins-ui'
import { RovingTabindex } from 'foldkit-primitives/interaction'
import { formatHotkey, ariaKeyshortcuts } from 'foldkit-primitives/events'
import { platformFromUA, type Platform } from 'foldkit-primitives/media'
import * as RichText from 'foldkit-richtext'
import { Message as EditorMessage, slashEntries } from 'foldkit-richtext-dom/editor'
import { markActive } from 'foldkit-richtext-dom/toolbar'
import { Message, Roving, type Model } from '../apps/app.js'
import { PostForm } from '../content/domain.js'
import { t } from '../styles/style.js'

export const BodyToolsSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
})

const platform: Platform = platformFromUA(navigator.userAgent)

interface Tool {
  readonly id: string
  readonly label: string
  readonly message: typeof EditorMessage.Type
  /** The editor's own shortcut, shown beside the tool. */
  readonly hotkey?: string
  readonly pressed: (state: Parameters<typeof markActive>[0]) => boolean
}

const entry = (id: string): typeof EditorMessage.Type => {
  const found = slashEntries.find(candidate => candidate.id === id)
  if (found === undefined) throw new Error(`the editor offers no "${id}" entry`)
  return found.message
}

const mark = (name: string, hotkey: string): Tool => ({
  id: name.toLowerCase(),
  label: name,
  message: EditorMessage.ToggledMark({ mark: name }),
  hotkey,
  pressed: state => markActive(state, name),
})

const block = (id: string, label: string, heading = false): Tool => ({
  id,
  label,
  message: entry(id),
  pressed: state =>
    heading && RichText.textBlockAt(state.document, state.selection)?.type === 'Heading',
})

/** In bar order; a group is set apart from the next by a separator. */
const GROUPS: ReadonlyArray<ReadonlyArray<Tool>> = [
  [mark('Bold', 'mod+b'), mark('Italic', 'mod+i'), mark('Code', 'mod+e')],
  [
    block('heading-2', 'Heading', true),
    block('quote', 'Quote'),
    block('bulleted-list', 'Bulleted list'),
    block('numbered-list', 'Numbered list'),
    block('code-block', 'Code block'),
  ],
  [
    {
      id: 'undo',
      label: 'Undo',
      message: EditorMessage.Undone(),
      hotkey: 'mod+z',
      pressed: () => false,
    },
    {
      id: 'redo',
      label: 'Redo',
      message: EditorMessage.Redone(),
      hotkey: 'mod+shift+z',
      pressed: () => false,
    },
  ],
]

export const BarStyle = Style.forSlots(UiToolbarSlots)(Recipes.Toolbar({}))
export const ToolStyle = Style.forSlots(ButtonSlots)(
  Recipes.Button({ tone: 'neutral', variant: 'ghost', size: 'sm' }),
)

const body = PostForm.control('body')

export const BodyTools = SlotView.forMessages<Message>()
  .define(BodyToolsSlots, (model: Model, slots, h) => {
    const draft = body.field(model.editor.form).value
    const state = {
      document: draft.document,
      selection: draft.selection,
      storedMarks: draft.storedMarks,
    }
    const control = (tool: Tool): Toolbar.ToolbarControl<Message> => ({
      id: tool.id,
      draw: stop =>
        Button.view(
          {
            label: tool.label,
            disabled: stop.disabled,
            pressed: tool.pressed(state),
            onClick: Message.PressedTool({ message: body.send(tool.message) }),
            attributes: {
              button: [
                ...stop.attributes,
                ...Option.match(
                  Option.flatMap(Option.fromUndefinedOr(tool.hotkey), key =>
                    ariaKeyshortcuts(key, platform),
                  ),
                  { onNone: () => [], onSome: keys => [h.Attribute('aria-keyshortcuts', keys)] },
                ),
                ...Option.match(
                  Option.flatMap(Option.fromUndefinedOr(tool.hotkey), key =>
                    formatHotkey(key, platform),
                  ),
                  { onNone: () => [], onSome: text => [h.Title(`${tool.label} (${text})`)] },
                ),
              ],
            },
            style: ToolStyle,
          },
          h,
        ),
    })
    return h.div(slots.root.attrs(), [
      Toolbar.view(
        {
          id: 'body-tools',
          label: 'Formatting',
          items: GROUPS.flatMap((group, index) => [
            ...(index === 0 ? [] : ['separator' as const]),
            ...group.map(control),
          ]),
          roving: model.bodyTools,
          onFocus: id => Roving.wrapper.make(RovingTabindex.Message.Focused({ id })),
          style: BarStyle,
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
            background: t.surface.default,
            borderBlockEnd: `1px solid ${t.outline.subtle}`,
            insetBlockStart: '0',
            marginBlockEnd: t.space.md,
            // A phone's bar scrolls sideways rather than wrapping its tools onto a second row.
            overflowX: 'auto',
            paddingBlock: t.space['2xs'],
            position: 'sticky',
            zIndex: '1',
          }),
          Style.nest('button', { whiteSpace: 'nowrap' }),
        ),
      }),
    ),
  )
