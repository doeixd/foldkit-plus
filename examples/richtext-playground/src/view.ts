/**
 * The playground's page. The editor's Bundle draws its host and nothing else; everything around
 * it is drawn here, from the Model: the toolbars, the block handle beside the hovered block, the
 * toolbar over selected text, the slash menu at the caret, and the discussions beside the page.
 * Each control sends the editor's own Messages (wrapped as `GotEditor`) or the application's.
 */
import { Match, Option } from 'effect'
import type { Document, Html, HtmlBuilder } from 'foldkit/html'
import * as Mount from 'foldkit/mount'
import { SlotView, Style, type SlotBuilders } from 'foldkit-mixins'
import {
  blockStyles,
  codeToolbar,
  editorStatus,
  findReplace,
  linkEditor,
  slashMenu,
  slashMenuView,
  slashMove,
  tableToolbar,
} from 'foldkit-mixins-richtext'
import { richtextDemo } from 'foldkit-example-site/demos'
import { demoGuide } from 'foldkit-example-site/guide'
import * as RichText from 'foldkit-richtext'
import { Message as EditorMessage } from 'foldkit-richtext-dom/editor'
import { editorView as editorHost } from 'foldkit-richtext-dom/editor-bundle'
import { blockAnchor, blockDrag, markActive, selectionAnchor } from 'foldkit-richtext-dom/toolbar'
import {
  editorView,
  hostId,
  Menu,
  Message,
  codeBlockAt,
  openMenu,
  openThreads,
  quoteOf,
  threadAt,
  type Model,
  type Thread,
} from './app.js'
import { canvasEvents, imagePicker } from './canvas.js'
import {
  BlockStyleStyle,
  CodeToolbarStyle,
  FindReplaceStyle,
  LinkEditorStyle,
  Page,
  SlashMenuStyle,
  StatusStyle,
  TableToolbarStyle,
} from './style.js'
import { Blocks, IMAGE_TYPES, LANGUAGES, playgroundSlashEntries } from './vocabulary.js'

type H = HtmlBuilder<Message>
type Slots = SlotBuilders<typeof Page.slots, Message>

const wrap = (message: EditorMessage): Message => Message.GotEditor({ message })
const slashEntries = playgroundSlashEntries.map(entry => ({
  ...entry,
  message: wrap(entry.message),
}))

const SlashMenu = slashMenuView<Message>().pipe(Style.attach(SlashMenuStyle))
const LinkEditor = linkEditor<Message>().pipe(Style.attach(LinkEditorStyle))
const BlockStyles = blockStyles<Message>().pipe(Style.attach(BlockStyleStyle))
const Status = editorStatus<Message>().pipe(Style.attach(StatusStyle))
const TableTools = tableToolbar<Message>().pipe(Style.attach(TableToolbarStyle))
const CodeTools = codeToolbar<Message>().pipe(Style.attach(CodeToolbarStyle))
const FindBar = findReplace<Message>().pipe(Style.attach(FindReplaceStyle))
const DemoGuide = demoGuide<Message>()

/** The text before the caret, which says whether a slash menu is open and what it matches. */
const textBefore = (model: Model): string => {
  const selection = model.editor.selection
  if (selection?.type !== 'Range') return ''
  const start = RichText.rangeStart(model.document, selection)
  return start === undefined ? '' : RichText.textBefore(model.document, start)
}

const MARKS: ReadonlyArray<readonly [mark: string, label: string, title: string]> = [
  ['Bold', 'B', 'Bold (Ctrl+B)'],
  ['Italic', 'I', 'Italic (Ctrl+I)'],
  ['Underline', 'U', 'Underline'],
  ['Strikethrough', 'S', 'Strikethrough'],
  ['Code', '</>', 'Inline code'],
  ['Highlight', '🖍', 'Highlight'],
  ['Kbd', '⌘', 'Keyboard key'],
]

export const PlaygroundView = SlotView.forMessages<Message>()
  .define(Page.slots, (model: Model, slots, h): Html => {
    const state = {
      document: model.document,
      selection: model.editor.selection,
      storedMarks: model.editor.storedMarks,
    }
    const open = openMenu(model)
    const button = (
      label: string,
      title: string,
      message: Message,
      {
        pressed,
        disabled = false,
      }: { readonly pressed?: boolean; readonly disabled?: boolean } = {},
    ) =>
      h.button(
        slots.tool.attrs([
          h.Type('button'),
          h.Title(title),
          h.AriaLabel(title),
          ...(pressed === undefined ? [] : [h.AriaPressed(pressed ? 'true' : 'false')]),
          h.Disabled(disabled),
          ...(disabled ? [] : [h.OnClick(message)]),
        ]),
        [label],
      )
    const separator = () => h.span(slots.separator.attrs([h.AriaHidden(true)]), [])
    const markButtons = () =>
      MARKS.map(([mark, label, title]) =>
        button(label, title, wrap(EditorMessage.ToggledMark({ mark })), {
          pressed: markActive(state, mark),
        }),
      )

    // --- the toolbars ---
    const media = h.div(slots.bar.attrs([h.Role('toolbar'), h.AriaLabel('Add to your document')]), [
      h.span(slots.barLabel.attrs(), ['Add to your document']),
      h.label(slots.tool.attrs([h.Title('Upload an image')]), [
        '🖼 Image',
        h.input(
          slots.file.attrs([
            h.Type('file'),
            h.Attribute('accept', IMAGE_TYPES.join(',')),
            h.OnMount(imagePicker()),
          ]),
        ),
      ]),
      button('▦ Table', 'Insert a table', Message.Inserted({ block: Blocks.table() })),
      button('💡 Callout', 'Insert a callout', Message.Inserted({ block: Blocks.callout() })),
      button('▸ Toggle', 'Insert a toggle', Message.Inserted({ block: Blocks.toggle() })),
      button('― Divider', 'Insert a divider', Message.Inserted({ block: Blocks.divider() })),
    ])
    const insertMenu = h.div(slots.anchor.attrs(), [
      button(
        '+',
        'Insert',
        open.insert ? Message.ClosedMenu() : Message.OpenedMenu({ menu: Menu.Insert() }),
        { pressed: open.insert },
      ),
      ...(open.insert
        ? [
            h.div(
              slots.dropdown.attrs([h.Role('menu')]),
              playgroundSlashEntries
                .filter(entry => entry.message._tag !== 'ToggledMark')
                .map(entry =>
                  h.button(
                    slots.menuItem.attrs([
                      h.Type('button'),
                      h.Role('menuitem'),
                      h.OnClick(
                        // A block the menu inserts goes at the top level, as the toolbar's do.
                        Match.value(entry.message).pipe(
                          Match.tag('InsertedBlock', ({ block }) => Message.Inserted({ block })),
                          Match.orElse(wrap),
                        ),
                      ),
                    ]),
                    [entry.label],
                  ),
                ),
            ),
          ]
        : []),
    ])
    const toolbar = h.div(slots.bar.attrs([h.Role('toolbar'), h.AriaLabel('Formatting')]), [
      button('↶', 'Undo (Ctrl+Z)', wrap(EditorMessage.Undone()), {
        disabled: !RichText.canUndo(model.editor.history),
      }),
      button('↷', 'Redo (Ctrl+Shift+Z)', wrap(EditorMessage.Redone()), {
        disabled: !RichText.canRedo(model.editor.history),
      }),
      separator(),
      ...markButtons(),
      separator(),
      button(
        'H',
        'Heading',
        wrap(EditorMessage.RetypedBlock({ block: { type: 'Heading', level: 2 } })),
      ),
      button('❝', 'Quote', wrap(EditorMessage.WrappedBlock({ containers: [{ kind: 'Quote' }] }))),
      button(
        '☑',
        'Checklist',
        wrap(
          EditorMessage.WrappedBlock({
            containers: [{ kind: 'List' }, { kind: 'TaskItem', props: { checked: false } }],
          }),
        ),
      ),
      button(
        '•',
        'Bulleted list',
        wrap(EditorMessage.WrappedBlock({ containers: [{ kind: 'List' }, { kind: 'ListItem' }] })),
      ),
      separator(),
      insertMenu,
      button('💬', 'Comment on the selection', Message.StartedComment(), {
        disabled: !RichText.coversText(model.editor.selection),
      }),
      button('🔍', 'Find and replace (Ctrl+F)', Message.OpenedFind(), {
        pressed: Option.isSome(model.find),
      }),
    ])
    const findBar = Option.match(model.find, {
      onNone: () => [],
      onSome: find => [
        FindBar(
          {
            document: model.document,
            ...find,
            queried: query => Message.FindQueried({ query }),
            replacementDrafted: replacement => Message.FindReplacementDrafted({ replacement }),
            moved: index => Message.FoundMatch({ index }),
            caseToggled: Message.FindCaseToggled(),
            closed: Message.ClosedFind(),
            wrap,
          },
          h,
        ),
      ],
    })

    // --- what floats over the editor ---
    const slash = slashMenu(slashEntries, textBefore(model), model.editor.menuIndex)
    const floating =
      RichText.coversText(model.editor.selection) &&
      !model.composing &&
      !open.insert &&
      Option.isNone(open.block)
        ? [
            h.div(
              slots.floating.attrs([
                h.Role('toolbar'),
                h.AriaLabel('Selection'),
                h.OnMount(selectionAnchor({ hostId, gap: 8 })),
              ]),
              open.link
                ? [
                    LinkEditor(
                      {
                        document: model.document,
                        selection: model.editor.selection,
                        draft: model.linkDraft,
                        drafted: href => Message.LinkDrafted({ href }),
                        wrap,
                      },
                      h,
                    ),
                    button('✕', 'Close', Message.ClosedMenu()),
                  ]
                : [
                    BlockStyles(
                      { document: model.document, selection: model.editor.selection, wrap },
                      h,
                    ),
                    separator(),
                    ...markButtons(),
                    separator(),
                    button('🔗', 'Link', Message.OpenedMenu({ menu: Menu.Link() }), {
                      pressed:
                        RichText.linkAt(model.document, model.editor.selection) !== undefined,
                    }),
                    button('💬', 'Comment', Message.StartedComment()),
                  ],
            ),
          ]
        : []
    const slashPopup =
      slash === undefined || slash.matches.length === 0
        ? []
        : [
            h.div(
              slots.slash.attrs([h.OnMount(selectionAnchor({ hostId, gap: 6, caret: true }))]),
              [
                SlashMenu(
                  {
                    entries: slashEntries,
                    textBefore: textBefore(model),
                    index: model.editor.menuIndex,
                  },
                  h,
                ),
              ],
            ),
          ]
    const handle = Option.match(model.hovered, {
      onNone: () => [],
      onSome: node =>
        RichText.locateBlock(model.document, node) === undefined
          ? []
          : [blockHandle(model, node, slots, h)],
    })

    // --- the page ---
    return h.main(slots.page.attrs(), [
      h.header(slots.header.attrs(), [
        h.div(
          [],
          [
            h.h1(slots.title.attrs(), ['Rich text playground']),
            h.p(slots.lede.attrs(), [
              'Movable blocks, anchored discussions, images, tables, code and footnotes in one document, edited by foldkit-richtext. Hover beside a block for its handle, select text to format it or start a discussion, or type / to add something.',
            ]),
          ],
        ),
        h.button(slots.primary.attrs([h.Type('button'), h.OnClick(Message.Reset())]), ['Reset']),
      ]),
      h.section(slots.surface.attrs([h.AriaLabel('Editor')]), [
        media,
        toolbar,
        ...findBar,
        ...Option.match(model.notice, {
          onNone: () => [],
          onSome: notice => [
            h.div(slots.notice.attrs([h.Role('alert')]), [
              notice,
              button('✕', 'Dismiss', Message.DismissedNotice()),
            ]),
          ],
        }),
        h.div(slots.body.attrs(), [
          h.div(
            slots.canvas.attrs([
              h.OnMount(canvasEvents()),
              h.OnKeyDownPreventDefault((key, modifiers) => {
                if (key === 'f' && (modifiers.ctrlKey || modifiers.metaKey) && !modifiers.altKey)
                  return Option.some(Message.OpenedFind())
                if (key === 'Escape' && Option.isSome(model.menu))
                  return Option.some(Message.ClosedMenu())
                const index = slashMove(
                  slashEntries,
                  textBefore(model),
                  model.editor.menuIndex,
                  key,
                  modifiers,
                )
                return index === undefined
                  ? Option.none()
                  : Option.some(Message.SlashMoved({ index }))
              }),
            ]),
            [
              h.div(slots.writing.attrs(), [
                h.submodel({
                  slotId: 'playground-editor',
                  model: editorView(model),
                  view: editorHost,
                  toParentMessage: wrap,
                }),
              ]),
              ...handle,
              ...blockTools(model, slots, h),
              ...floating,
              ...slashPopup,
            ],
          ),
          discussions(model, slots, h),
        ]),
        h.footer(slots.footer.attrs(), [
          Status({ document: model.document }, h),
          ...Option.match(model.status, {
            onNone: () => [],
            onSome: status => [h.span(slots.status.attrs([h.Role('status')]), [status])],
          }),
          h.span([], ['Edits and discussions stay in this page; Reset starts over.']),
        ]),
      ]),
      DemoGuide({ demo: richtextDemo }, h),
    ])
  })
  .pipe(Style.attach(Page.style))

// --- block toolbars ------------------------------------------------------------------------------

/**
 * The toolbar of the block the caret is in, above it: a table's rows and columns, or a code
 * block's language and Copy. Keyed by the block, since the anchor reads its args once.
 */
const blockTools = (model: Model, slots: Slots, h: H): ReadonlyArray<Html> => {
  const above = (node: RichText.NodeId, tools: Html) =>
    h.div(
      slots.blockTools.attrs([
        h.Key(`tools-${node}`),
        h.OnMount(blockAnchor({ hostId, node, gap: 6, side: 'above' })),
      ]),
      [tools],
    )
  const table = RichText.tableAt(model.document, model.editor.selection)
  if (table !== undefined) {
    return [
      above(
        table.table.id,
        TableTools({ document: model.document, selection: model.editor.selection, wrap }, h),
      ),
    ]
  }
  return Option.match(codeBlockAt(model), {
    onNone: () => [],
    onSome: node => [
      above(
        node,
        CodeTools(
          {
            document: model.document,
            node,
            languages: LANGUAGES,
            wrap,
            copied: Message.CopiedCode({ node }),
          },
          h,
        ),
      ),
    ],
  })
}

// --- the block handle ------------------------------------------------------------------------

const BlockMenu = (model: Model, node: RichText.NodeId, slots: Slots, h: H): Html => {
  const block = RichText.locateBlock(model.document, node)?.block
  const item = (label: string, message: Message) =>
    h.button(slots.menuItem.attrs([h.Type('button'), h.Role('menuitem'), h.OnClick(message)]), [
      label,
    ])
  const heading = (label: string) => h.p(slots.menuHeading.attrs(), [label])
  const props = block?.type === 'Node' ? block.props : {}
  const set = (changed: Readonly<Record<string, string | number | boolean>>) =>
    wrap(EditorMessage.ChangedProps({ node, props: changed }))
  const siblings = RichText.siblingsOf(model.document, node)
  const kind = block === undefined ? undefined : block.type === 'Node' ? block.kind : block.type
  const ofKind = (() => {
    switch (kind) {
      case 'Paragraph':
      case 'Heading':
        return [
          heading('Turn into'),
          item('Text', Message.RetypedBlock({ node, block: { type: 'Paragraph' } })),
          item('Heading 1', Message.RetypedBlock({ node, block: { type: 'Heading', level: 1 } })),
          item('Heading 2', Message.RetypedBlock({ node, block: { type: 'Heading', level: 2 } })),
          item('Heading 3', Message.RetypedBlock({ node, block: { type: 'Heading', level: 3 } })),
          item('Quote', Message.WrappedBlock({ node, containers: [{ kind: 'Quote' }] })),
          item(
            'Checklist',
            Message.WrappedBlock({
              node,
              containers: [{ kind: 'List' }, { kind: 'TaskItem', props: { checked: false } }],
            }),
          ),
        ]
      case 'Image':
        return [
          heading('Width'),
          h.div(slots.menuRow.attrs(), [
            ...(
              [
                ['S', 320],
                ['M', 480],
                ['L', 640],
                ['Full', 960],
              ] as const
            ).map(([label, width]) =>
              h.button(
                slots.tool.attrs([
                  h.Type('button'),
                  h.AriaPressed(props.width === width ? 'true' : 'false'),
                  h.OnClick(set({ width })),
                ]),
                [label],
              ),
            ),
          ]),
          heading('Align'),
          h.div(slots.menuRow.attrs(), [
            ...(
              [
                ['Left', 'start'],
                ['Center', 'center'],
                ['Right', 'end'],
              ] as const
            ).map(([label, align]) =>
              h.button(
                slots.tool.attrs([
                  h.Type('button'),
                  h.AriaPressed((props.align ?? 'center') === align ? 'true' : 'false'),
                  h.OnClick(set({ align })),
                ]),
                [label],
              ),
            ),
          ]),
          item('Edit caption…', Message.OpenedMenu({ menu: Menu.Caption({ node }) })),
        ]
      case 'Callout':
        return [
          heading('Icon'),
          h.div(
            slots.menuRow.attrs(),
            ['💡', '✦', '⚠️', '✅', '📌'].map(icon =>
              h.button(
                slots.tool.attrs([
                  h.Type('button'),
                  h.AriaPressed(props.icon === icon ? 'true' : 'false'),
                  h.OnClick(set({ icon })),
                ]),
                [icon],
              ),
            ),
          ),
        ]
      case 'Toggle':
        return [
          item(props.open === true ? 'Collapse' : 'Expand', set({ open: props.open !== true })),
        ]
      default:
        return []
    }
  })()
  return h.div(slots.dropdown.attrs([h.Role('menu'), h.AriaLabel('Block')]), [
    ...ofKind,
    heading('Block'),
    ...(siblings.previous === undefined
      ? []
      : [
          item(
            'Move up',
            Message.MenuEdit({
              message: EditorMessage.MovedBlock({ node, to: { before: siblings.previous.id } }),
            }),
          ),
        ]),
    ...(siblings.next === undefined
      ? []
      : [
          item(
            'Move down',
            Message.MenuEdit({
              message: EditorMessage.MovedBlock({ node, to: { after: siblings.next.id } }),
            }),
          ),
        ]),
    item('Duplicate', Message.DuplicatedBlock({ node })),
    item('Delete', Message.MenuEdit({ message: EditorMessage.DeletedBlock({ node }) })),
  ])
}

const CaptionEditor = (model: Model, node: RichText.NodeId, slots: Slots, h: H): Html =>
  h.div(slots.dropdown.attrs([h.Role('group'), h.AriaLabel('Caption')]), [
    h.input(
      slots.field.attrs([
        h.Type('text'),
        h.AriaLabel('Caption'),
        h.Placeholder('Say what the picture shows'),
        h.Value(model.captionDraft),
        h.OnInput(caption => Message.CaptionDrafted({ caption })),
        h.OnKeyDownPreventDefault(key =>
          key === 'Enter' ? Option.some(Message.CaptionSaved({ node })) : Option.none(),
        ),
      ]),
    ),
    h.div(slots.actions.attrs(), [
      h.button(slots.tool.attrs([h.Type('button'), h.OnClick(Message.ClosedMenu())]), ['Cancel']),
      h.button(slots.primary.attrs([h.Type('button'), h.OnClick(Message.CaptionSaved({ node }))]), [
        'Save',
      ]),
    ]),
  ])

/**
 * Where a block's first line sits below its top, which is where the handle lines up: a heading's
 * line is taller than a paragraph's, and a callout, a table or a code block pads its text.
 */
const lineOf = (block: RichText.Block | undefined): string => {
  if (block === undefined) return 'text'
  if (block.type === 'Heading') return `h${Math.min(block.level, 3)}`
  return block.type === 'Node' &&
    ['Callout', 'CodeBlock', 'Table', 'Image', 'ThematicBreak'].includes(block.kind)
    ? block.kind
    : 'text'
}

/**
 * The handle beside the hovered block, one grip as the reference has it: dragged, it moves the
 * block wherever the vocabulary lets it go; clicked, it opens the block's menu. A press that
 * does not move drops nothing, so the click is all it does. Keyed by the block, since its
 * Mounts read their args once.
 */
const blockHandle = (model: Model, node: RichText.NodeId, slots: Slots, h: H): Html => {
  const shown = Option.filter(openMenu(model).block, block => block.node === node)
  const open = Option.isSome(shown)
  return h.div(
    slots.handle.attrs([
      h.Key(`handle-${node}`),
      h.DataAttribute('line', lineOf(RichText.locateBlock(model.document, node)?.block)),
      h.OnMount(blockAnchor({ hostId, node, gap: 4 })),
    ]),
    [
      h.button(
        slots.grip.attrs([
          h.Type('button'),
          h.Title('Drag to move, or click for options'),
          h.AriaLabel('Block handle'),
          h.AriaExpanded(open),
          h.OnMount(Mount.mapMessage(blockDrag({ hostId, node }), wrap)),
          h.OnClick(
            open ? Message.ClosedMenu() : Message.OpenedMenu({ menu: Menu.Block({ node }) }),
          ),
        ]),
        ['⠿'],
      ),
      ...Option.match(shown, {
        onNone: () => [],
        onSome: ({ caption }) => [
          caption ? CaptionEditor(model, node, slots, h) : BlockMenu(model, node, slots, h),
        ],
      }),
    ],
  )
}

// --- discussions -------------------------------------------------------------------------------

const discussions = (model: Model, slots: Slots, h: H): Html => {
  const threads = openThreads(model)
  const active = threadAt(model)
  const field = (placeholder: string, submit: Message) =>
    h.input(
      slots.field.attrs([
        h.Type('text'),
        h.AriaLabel(placeholder),
        h.Placeholder(placeholder),
        h.Value(model.draft),
        h.OnInput(text => Message.Drafted({ text })),
        h.OnKeyDownPreventDefault(key => (key === 'Enter' ? Option.some(submit) : Option.none())),
      ]),
    )
  const card = (thread: Thread): Html => {
    const isActive = thread.id === active
    const remarks = thread.remarks.map(remark =>
      h.div(slots.remark.attrs(), [
        h.span(slots.author.attrs(), [remark.author]),
        h.span([], [remark.body]),
      ]),
    )
    return isActive
      ? h.article(
          slots.card.attrs([h.DataAttribute('active', 'true'), h.AriaLabel('Discussion')]),
          [
            h.blockquote(slots.quote.attrs(), [quoteOf(model.document, thread.id)]),
            ...remarks,
            field('Reply…', Message.Replied({ thread: thread.id })),
            h.div(slots.actions.attrs(), [
              h.button(
                slots.tool.attrs([
                  h.Type('button'),
                  h.OnClick(Message.Resolved({ thread: thread.id })),
                ]),
                ['Resolve'],
              ),
              h.button(
                slots.primary.attrs([
                  h.Type('button'),
                  h.Disabled(model.draft.trim() === ''),
                  h.OnClick(Message.Replied({ thread: thread.id })),
                ]),
                ['Reply'],
              ),
            ]),
          ],
        )
      : h.button(
          slots.card.attrs([
            h.Type('button'),
            h.DataAttribute('active', 'false'),
            h.OnClick(Message.OpenedThread({ thread: thread.id })),
          ]),
          [
            h.blockquote(slots.quote.attrs(), [quoteOf(model.document, thread.id)]),
            ...remarks.slice(0, 1),
            ...(thread.remarks.length > 1
              ? [h.span(slots.author.attrs(), [`${thread.remarks.length - 1} more`])]
              : []),
          ],
        )
  }
  const composer = model.composing
    ? [
        h.article(
          slots.card.attrs([h.DataAttribute('active', 'true'), h.AriaLabel('New discussion')]),
          [
            h.span(slots.author.attrs(), ['New discussion']),
            field('Say something about the selection…', Message.Commented()),
            h.div(slots.actions.attrs(), [
              h.button(
                slots.tool.attrs([h.Type('button'), h.OnClick(Message.CancelledComment())]),
                ['Cancel'],
              ),
              h.button(
                slots.primary.attrs([
                  h.Type('button'),
                  h.Disabled(model.draft.trim() === ''),
                  h.OnClick(Message.Commented()),
                ]),
                ['Comment'],
              ),
            ]),
          ],
        ),
      ]
    : []
  return h.aside(slots.sidebar.attrs([h.AriaLabel('Discussions')]), [
    h.h2(slots.sidebarTitle.attrs(), [`Discussions · ${threads.length}`]),
    ...composer,
    ...(threads.length === 0 && !model.composing
      ? [h.p(slots.empty.attrs(), ['Select some text and press 💬 to start one.'])]
      : threads.map(card)),
  ])
}

export const view = (model: Model, h: H): Document => ({
  title: 'Rich text playground',
  body: PlaygroundView(model, h),
})
