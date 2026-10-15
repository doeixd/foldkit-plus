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
  blockStyleMenu,
  codeToolbar,
  editorStatus,
  findReplace,
  footnotePreview,
  isRichTextIcon,
  linkEditor,
  richTextIcon,
  slashMenu,
  slashMenuView,
  slashMove,
  tableOfContents,
  tableToolbar,
  type RichTextIconName,
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
  ExportFormat,
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
import { canvasEvents, dismissOnOutside, filePicker, findShortcut } from './canvas.js'
import {
  BlockStyleMenuStyle,
  CodeToolbarStyle,
  FindReplaceStyle,
  FootnotePreviewStyle,
  LinkEditorStyle,
  Page,
  SlashMenuStyle,
  StatusStyle,
  TableOfContentsStyle,
  TableToolbarStyle,
} from './style.js'
import { LANGUAGES, playgroundSlashEntries } from './vocabulary.js'

type H = HtmlBuilder<Message>
type Slots = SlotBuilders<typeof Page.slots, Message>

const wrap = (message: EditorMessage): Message => Message.GotEditor({ message })
const slashEntries = playgroundSlashEntries.map(entry => ({
  ...entry,
  message: wrap(entry.message),
}))

const SlashMenu = slashMenuView<Message>().pipe(Style.attach(SlashMenuStyle))
const LinkEditor = linkEditor<Message>().pipe(Style.attach(LinkEditorStyle))
const StyleMenu = blockStyleMenu<Message>().pipe(Style.attach(BlockStyleMenuStyle))
const Status = editorStatus<Message>().pipe(Style.attach(StatusStyle))
const TableTools = tableToolbar<Message>().pipe(Style.attach(TableToolbarStyle))
const CodeTools = codeToolbar<Message>().pipe(Style.attach(CodeToolbarStyle))
const Contents = tableOfContents<Message>().pipe(Style.attach(TableOfContentsStyle))
const NotePreview = footnotePreview<Message>().pipe(Style.attach(FootnotePreviewStyle))
const FindBar = findReplace<Message>().pipe(Style.attach(FindReplaceStyle))
const DemoGuide = demoGuide<Message>()

/** The text before the caret, which says whether a slash menu is open and what it matches. */
const textBefore = (model: Model): string => {
  const selection = model.editor.selection
  if (selection?.type !== 'Range') return ''
  const start = RichText.rangeStart(model.document, selection)
  return start === undefined ? '' : RichText.textBefore(model.document, start)
}

/** The marks the toolbars offer; the less used ones step aside on a phone. */
const MARKS: ReadonlyArray<
  readonly [mark: string, icon: RichTextIconName, title: string, priority: 'high' | 'low']
> = [
  ['Bold', 'bold', 'Bold (Ctrl+B)', 'high'],
  ['Italic', 'italic', 'Italic (Ctrl+I)', 'high'],
  ['Underline', 'underline', 'Underline', 'low'],
  ['Strikethrough', 'strikethrough', 'Strikethrough', 'low'],
  ['Code', 'code', 'Inline code', 'low'],
  ['Highlight', 'highlight', 'Highlight', 'low'],
]

/** What the insert menu offers after a file, by slash entry id, in this order. */
const INSERTS = ['table', 'callout', 'toggle', 'divider', 'footnote'] as const

const EXPORTS: ReadonlyArray<readonly [format: ExportFormat, description: string]> = [
  ['Markdown', 'Plain text, with # and *'],
  ['HTML', 'For a web page'],
  ['JSON', 'The document itself'],
]

/** The id of the one file field, which the insert menu's File entry is a label for. */
const FILE_INPUT = 'playground-file'

/** A slash entry's icon, where the set has one. */
const iconOf = (name: string | undefined): RichTextIconName =>
  name !== undefined && isRichTextIcon(name) ? name : 'plus'

export const PlaygroundView = SlotView.forMessages<Message>()
  .define(Page.slots, (model: Model, slots, h): Html => {
    const state = {
      document: model.document,
      selection: model.editor.selection,
      storedMarks: model.editor.storedMarks,
    }
    const open = openMenu(model)
    const covers = RichText.coversText(model.editor.selection)
    const tool = (
      name: RichTextIconName,
      title: string,
      message: Message,
      {
        pressed,
        disabled = false,
        label,
        priority = 'high',
      }: {
        readonly pressed?: boolean
        readonly disabled?: boolean
        readonly label?: string
        /** A low one is left out on a phone, where the slash menu still offers it. */
        readonly priority?: 'high' | 'low'
      } = {},
    ) =>
      h.button(
        slots.tool.attrs([
          h.Type('button'),
          h.Title(title),
          // Named by its label, or by its title without the shortcut; a phone hides the label.
          h.AriaLabel(label ?? title.replace(/ \(.*\)$/, '')),
          h.DataAttribute('priority', priority),
          ...(pressed === undefined ? [] : [h.AriaPressed(pressed ? 'true' : 'false')]),
          h.Disabled(disabled),
          ...(disabled ? [] : [h.OnClick(message)]),
        ]),
        [
          richTextIcon(h, name),
          ...(label === undefined ? [] : [h.span(slots.toolLabel.attrs(), [label])]),
        ],
      )
    const separator = (priority: 'high' | 'low' = 'high') =>
      h.span(slots.separator.attrs([h.AriaHidden(true), h.DataAttribute('priority', priority)]), [])
    const markTools = () =>
      MARKS.map(([mark, name, title, priority]) =>
        tool(name, title, wrap(EditorMessage.ToggledMark({ mark })), {
          pressed: markActive(state, mark),
          priority,
        }),
      )
    const toggleMenu = (menu: Menu, isOpen: boolean): Message =>
      isOpen ? Message.ClosedMenu() : Message.OpenedMenu({ menu })
    // While a menu is open, a marker beside it closes it on a press outside or on Escape.
    const dismiss = () => h.span(slots.dismiss.attrs([h.OnMount(dismissOnOutside())]), [])
    /** A menu's trigger and, while it is open, what it shows: a menu, or a question. */
    const anchored = (
      trigger: Html,
      shown: ReadonlyArray<Html> | undefined,
      {
        align = 'start',
        role = 'menu',
        label,
      }: {
        readonly align?: 'start' | 'end'
        readonly role?: 'menu' | 'dialog'
        readonly label: string
      },
    ) =>
      h.div(slots.anchor.attrs(), [
        trigger,
        ...(shown === undefined
          ? []
          : [
              h.div(
                slots.dropdown.attrs([
                  h.Role(role),
                  h.AriaLabel(label),
                  h.DataAttribute('align', align),
                ]),
                shown,
              ),
              dismiss(),
            ]),
      ])
    const menuEntry = (
      name: RichTextIconName,
      label: string,
      description: string,
      message: Message,
    ) =>
      h.button(slots.menuItem.attrs([h.Type('button'), h.Role('menuitem'), h.OnClick(message)]), [
        richTextIcon(h, name),
        h.span(slots.menuLabel.attrs(), [label]),
        h.span(slots.menuDescription.attrs(), [description]),
      ])
    const styleMenu = (place: 'toolbar' | 'floating') => {
      const isOpen = open.style === place
      // Over selected text on a phone, the marks are room enough; the toolbar's menu remains.
      return h.div(
        slots.anchor.attrs([h.DataAttribute('priority', place === 'floating' ? 'low' : 'high')]),
        [
          StyleMenu(
            {
              document: model.document,
              selection: model.editor.selection,
              open: isOpen,
              toggled: toggleMenu(Menu.Style({ place }), isOpen),
              // A choice closes the menu as it retypes the block.
              wrap: message => Message.MenuEdit({ message }),
            },
            h,
          ),
          ...(isOpen ? [dismiss()] : []),
        ],
      )
    }

    // --- the toolbar ---
    const insertMenu = anchored(
      tool('plus', 'Insert a block', toggleMenu(Menu.Insert(), open.insert), {
        pressed: open.insert,
        label: 'Insert',
      }),
      open.insert
        ? [
            h.label(slots.menuItem.attrs([h.Role('menuitem'), h.For(FILE_INPUT)]), [
              richTextIcon(h, 'file'),
              h.span(slots.menuLabel.attrs(), ['Image, video or file']),
              h.span(slots.menuDescription.attrs(), ['From your device, up to 8 MB']),
            ]),
            ...INSERTS.flatMap(id => {
              const entry = playgroundSlashEntries.find(each => each.id === id)
              return entry === undefined
                ? []
                : [
                    menuEntry(
                      iconOf(entry.icon),
                      entry.label,
                      entry.description ?? '',
                      // A block goes at the top level, beside the caret's; the rest are edits.
                      Match.value(entry.message).pipe(
                        Match.tag('InsertedBlock', ({ block }) => Message.Inserted({ block })),
                        Match.orElse(message => Message.MenuEdit({ message })),
                      ),
                    ),
                  ]
            }),
          ]
        : undefined,
      { label: 'Insert' },
    )
    const exportMenu = anchored(
      tool(
        'download',
        'Copy the document in another format',
        toggleMenu(Menu.Export(), open.export),
        {
          pressed: open.export,
          label: 'Export',
        },
      ),
      open.export
        ? EXPORTS.map(([format, description]) =>
            menuEntry('copy', `Copy as ${format}`, description, Message.Exported({ format })),
          )
        : undefined,
      { align: 'end', label: 'Export' },
    )
    const toolbar = h.div(slots.bar.attrs([h.Role('toolbar'), h.AriaLabel('Editor')]), [
      tool('undo', 'Undo (Ctrl+Z)', wrap(EditorMessage.Undone()), {
        disabled: !RichText.canUndo(model.editor.history),
      }),
      tool('redo', 'Redo (Ctrl+Shift+Z)', wrap(EditorMessage.Redone()), {
        disabled: !RichText.canRedo(model.editor.history),
      }),
      separator(),
      styleMenu('toolbar'),
      separator(),
      ...markTools(),
      tool('link', 'Link', toggleMenu(Menu.Link(), open.link), {
        pressed: open.link || RichText.linkAt(model.document, model.editor.selection) !== undefined,
        disabled: !covers,
      }),
      separator(),
      tool(
        'bulleted-list',
        'Bulleted list',
        wrap(EditorMessage.WrappedBlock({ containers: [{ kind: 'List' }, { kind: 'ListItem' }] })),
        { priority: 'low' },
      ),
      tool(
        'numbered-list',
        'Numbered list',
        wrap(
          EditorMessage.WrappedBlock({
            containers: [{ kind: 'List', props: { ordered: true } }, { kind: 'ListItem' }],
          }),
        ),
        { priority: 'low' },
      ),
      tool(
        'checklist',
        'Checklist',
        wrap(
          EditorMessage.WrappedBlock({
            containers: [{ kind: 'List' }, { kind: 'TaskItem', props: { checked: false } }],
          }),
        ),
        { priority: 'low' },
      ),
      tool(
        'quote',
        'Quote',
        wrap(EditorMessage.WrappedBlock({ containers: [{ kind: 'Quote' }] })),
        { priority: 'low' },
      ),
      separator('low'),
      insertMenu,
      tool('comment', 'Comment on the selection', Message.StartedComment(), {
        disabled: !covers,
        priority: 'low',
      }),
      h.span(slots.spacer.attrs(), []),
      tool('search', 'Find and replace (Ctrl+F)', Message.OpenedFind(), {
        pressed: Option.isSome(model.find),
      }),
      exportMenu,
      h.input(slots.file.attrs([h.Id(FILE_INPUT), h.Type('file'), h.OnMount(filePicker())])),
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
            stepped: step => Message.SteppedMatch({ step }),
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
                        wrap: message => Message.LinkEdited({ message }),
                        closed: Message.ClosedMenu(),
                        submitted: Message.LinkSubmitted(),
                      },
                      h,
                    ),
                    tool('close', 'Close', Message.ClosedMenu()),
                  ]
                : [
                    styleMenu('floating'),
                    separator('low'),
                    ...markTools(),
                    separator(),
                    tool('link', 'Link', Message.OpenedMenu({ menu: Menu.Link() }), {
                      pressed:
                        RichText.linkAt(model.document, model.editor.selection) !== undefined,
                    }),
                    tool('comment', 'Comment', Message.StartedComment()),
                  ],
            ),
          ]
        : []
    // A collapsed caret in a footnote reference: its note, beside the caret.
    const notePopup =
      RichText.coversText(model.editor.selection) ||
      RichText.footnoteAt(model.document, model.editor.selection) === undefined
        ? []
        : [
            h.div(
              slots.notePreview.attrs([
                h.OnMount(selectionAnchor({ hostId, gap: 8, caret: true })),
              ]),
              [
                NotePreview(
                  {
                    document: model.document,
                    selection: model.editor.selection,
                    opened: node => Message.JumpedTo({ node }),
                    wrap,
                  },
                  h,
                ),
              ],
            ),
          ]
    // Open while a query is: one that matches nothing says so.
    const slashPopup =
      slash === undefined
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
    return h.main(slots.page.attrs([h.OnMount(findShortcut())]), [
      h.header(slots.header.attrs(), [
        h.div(
          [],
          [
            h.h1(slots.title.attrs(), ['Rich text playground']),
            h.p(slots.lede.attrs(), [
              'One document to try foldkit-richtext on: blocks to move, text to discuss, tables, code, media and footnotes. Type / to add anything.',
            ]),
          ],
        ),
        anchored(
          tool(
            'reset',
            'Start over with the sample document',
            toggleMenu(Menu.Reset(), open.reset),
            {
              pressed: open.reset,
              label: 'Start over',
            },
          ),
          open.reset
            ? [
                h.p(slots.confirmText.attrs(), [
                  'Start over with the sample document? Your edits and discussions will be lost.',
                ]),
                h.div(slots.actions.attrs(), [
                  h.button(slots.tool.attrs([h.Type('button'), h.OnClick(Message.ClosedMenu())]), [
                    'Cancel',
                  ]),
                  h.button(slots.danger.attrs([h.Type('button'), h.OnClick(Message.Reset())]), [
                    'Start over',
                  ]),
                ]),
              ]
            : undefined,
          { align: 'end', role: 'dialog', label: 'Start over' },
        ),
      ]),
      h.section(slots.surface.attrs([h.AriaLabel('Editor')]), [
        toolbar,
        ...findBar,
        ...Option.match(model.notice, {
          onNone: () => [],
          onSome: notice => [
            h.div(slots.notice.attrs([h.Role('alert')]), [
              notice,
              tool('close', 'Dismiss', Message.DismissedNotice()),
            ]),
          ],
        }),
        h.div(slots.body.attrs(), [
          h.div(
            slots.canvas.attrs([
              h.OnMount(canvasEvents()),
              h.OnKeyDownPreventDefault((key, modifiers) => {
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
              ...notePopup,
            ],
          ),
          discussions(model, slots, h),
        ]),
        h.footer(slots.footer.attrs(), [
          Status({ document: model.document }, h),

          h.span([], ['Edits and discussions stay in this page; Reset starts over.']),
        ]),
      ]),
      // What a copy did, said where it is seen and gone by itself (`ExpireStatus`).
      h.div(
        slots.toasts.attrs([h.Role('status'), h.AriaLive('polite')]),
        Option.match(model.status, {
          onNone: () => [],
          onSome: status => [
            h.div(
              slots.toast.attrs([
                h.Key(status.text),
                h.DataAttribute('failed', String(status.failed)),
              ]),
              [richTextIcon(h, status.failed ? 'close' : 'check'), status.text],
            ),
          ],
        }),
      ),
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
  // A table's tools sit above it; a code block's in its own top corner, over its header, so
  // they cover none of the text around it.
  const placed = (node: RichText.NodeId, side: 'above' | 'inside-end', tools: Html) =>
    h.div(
      slots.blockTools.attrs([
        h.Key(`tools-${node}`),
        h.OnMount(blockAnchor({ hostId, node, gap: 6, side })),
      ]),
      [tools],
    )
  const table = RichText.tableAt(model.document, model.editor.selection)
  if (table !== undefined) {
    return [
      placed(
        table.table.id,
        'above',
        TableTools({ document: model.document, selection: model.editor.selection, wrap }, h),
      ),
    ]
  }
  return Option.match(codeBlockAt(model), {
    onNone: () => [],
    onSome: node => [
      placed(
        node,
        'inside-end',
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
  const item = (
    name: RichTextIconName,
    label: string,
    message: Message,
    { danger = false }: { readonly danger?: boolean } = {},
  ) =>
    h.button(
      slots.action.attrs([
        h.Type('button'),
        h.Role('menuitem'),
        ...(danger ? [h.DataAttribute('danger', 'true')] : []),
        h.OnClick(message),
      ]),
      [richTextIcon(h, name), label],
    )
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
          item('paragraph', 'Text', Message.RetypedBlock({ node, block: { type: 'Paragraph' } })),
          item(
            'heading-1',
            'Heading 1',
            Message.RetypedBlock({ node, block: { type: 'Heading', level: 1 } }),
          ),
          item(
            'heading-2',
            'Heading 2',
            Message.RetypedBlock({ node, block: { type: 'Heading', level: 2 } }),
          ),
          item(
            'heading-3',
            'Heading 3',
            Message.RetypedBlock({ node, block: { type: 'Heading', level: 3 } }),
          ),
          item('quote', 'Quote', Message.WrappedBlock({ node, containers: [{ kind: 'Quote' }] })),
          item(
            'checklist',
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
          item('image', 'Edit caption…', Message.OpenedMenu({ menu: Menu.Caption({ node }) })),
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
          item(
            'toggle',
            props.open === true ? 'Collapse' : 'Expand',
            set({ open: props.open !== true }),
          ),
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
            'chevron-up',
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
            'chevron-down',
            'Move down',
            Message.MenuEdit({
              message: EditorMessage.MovedBlock({ node, to: { after: siblings.next.id } }),
            }),
          ),
        ]),
    item('copy', 'Duplicate', Message.DuplicatedBlock({ node })),
    item('trash', 'Delete', Message.MenuEdit({ message: EditorMessage.DeletedBlock({ node }) }), {
      danger: true,
    }),
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
        [richTextIcon(h, 'grip')],
      ),
      ...Option.match(shown, {
        onNone: () => [],
        onSome: ({ caption }) => [
          caption ? CaptionEditor(model, node, slots, h) : BlockMenu(model, node, slots, h),
          h.span(slots.dismiss.attrs([h.OnMount(dismissOnOutside())]), []),
        ],
      }),
    ],
  )
}

// --- discussions -------------------------------------------------------------------------------

/** A person's initials, for the mark beside what they said: "Noor Patel" is NP. */
const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter(word => word.length > 0)
    .slice(0, 2)
    .map(word => word[0]!.toUpperCase())
    .join('')

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
        h.span(slots.avatar.attrs([h.AriaHidden(true)]), [initialsOf(remark.author)]),
        h.span(slots.author.attrs(), [remark.author]),
        h.span(slots.remarkBody.attrs(), [remark.body]),
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
  const contents =
    RichText.outlineOf(model.document).length === 0
      ? []
      : [
          h.section(slots.panel.attrs([h.AriaLabel('Contents')]), [
            h.h2(slots.sidebarTitle.attrs(), ['Contents']),
            Contents(
              {
                document: model.document,
                selection: model.editor.selection,
                chosen: node => Message.JumpedTo({ node }),
              },
              h,
            ),
          ]),
        ]
  return h.aside(slots.sidebar.attrs(), [
    ...contents,
    h.section(slots.panel.attrs([h.AriaLabel('Discussions')]), [
      h.h2(slots.sidebarTitle.attrs(), [`Discussions · ${threads.length}`]),
      ...composer,
      ...(threads.length === 0 && !model.composing
        ? [h.p(slots.empty.attrs(), ['Select some text and press 💬 to start one.'])]
        : threads.map(card)),
    ]),
  ])
}

export const view = (model: Model, h: H): Document => ({
  title: 'Rich text playground',
  body: PlaygroundView(model, h),
})
