/**
 * The page. The editor's Bundle draws its host and nothing else; everything around it is drawn
 * here, from the Model: the sidebar of pages, who else is here, the toolbar, the block handle
 * beside the hovered block, the toolbar over selected text, and the slash menu at the caret.
 * Each control sends the editor's own Messages (wrapped as `GotEditor`) or the application's.
 */
import { Option } from 'effect'
import type { Document, Html, HtmlBuilder } from 'foldkit/html'
import * as Mount from 'foldkit/mount'
import { SlotView, Style, type SlotBuilders } from 'foldkit-mixins'
import {
  blockStyleMenu,
  isRichTextIcon,
  linkEditor,
  richTextIcon,
  slashMenu,
  slashMenuView,
  slashMove,
  tableToolbar,
  type RichTextIconName,
} from 'foldkit-mixins-richtext'
import { pagesDemo } from 'foldkit-example-site/demos'
import { demoGuide } from 'foldkit-example-site/guide'
import * as RichText from 'foldkit-richtext'
import { Message as EditorMessage } from 'foldkit-richtext-dom/editor'
import { editorView, menuTextOf, type EditorView } from 'foldkit-richtext-dom/editor-bundle'
import { blockAnchor, blockDrag, markActive, selectionAnchor } from 'foldkit-richtext-dom/toolbar'
import { print } from 'foldkit-richtext-markdown'
import {
  editorViewOf,
  hostId,
  Menu,
  Message,
  pageOf,
  type Model,
  type Page as PageState,
  type Peer,
} from './app.js'
import { dismissOnOutside, hoverTracking } from './canvas.js'
import {
  BlockStyleMenuStyle,
  LinkEditorStyle,
  Page,
  SlashMenuStyle,
  TableToolbarStyle,
} from './style.js'
import { CALLOUT_ICONS, pageSlashEntries } from './vocabulary.js'

type H = HtmlBuilder<Message>
type Slots = SlotBuilders<typeof Page.slots, Message>

const wrap = (message: EditorMessage): Message => Message.GotEditor({ message })
const slashEntries = pageSlashEntries.map(entry => ({ ...entry, message: wrap(entry.message) }))

const SlashMenu = slashMenuView<Message>().pipe(Style.attach(SlashMenuStyle))
const LinkEditor = linkEditor<Message>().pipe(Style.attach(LinkEditorStyle))
const StyleMenu = blockStyleMenu<Message>().pipe(Style.attach(BlockStyleMenuStyle))
const TableTools = tableToolbar<Message>().pipe(Style.attach(TableToolbarStyle))
const DemoGuide = demoGuide<Message>()

/** The marks the toolbars offer; the less used ones step aside on a phone. */
const MARKS: ReadonlyArray<
  readonly [mark: string, icon: RichTextIconName, title: string, priority: 'high' | 'low']
> = [
  ['Bold', 'bold', 'Bold (Ctrl+B)', 'high'],
  ['Italic', 'italic', 'Italic (Ctrl+I)', 'high'],
  ['Underline', 'underline', 'Underline (Ctrl+U)', 'low'],
  ['Strikethrough', 'strikethrough', 'Strikethrough (Ctrl+Shift+S)', 'low'],
  ['Code', 'code', 'Inline code (Ctrl+E)', 'low'],
  ['Highlight', 'highlight', 'Highlight (Ctrl+Shift+H)', 'low'],
]

/** What the toolbar's insert menu offers, by slash entry id, in this order. */
const INSERTS = ['callout', 'table', 'divider', 'code-block'] as const

const iconOf = (name: string | undefined): RichTextIconName =>
  name !== undefined && isRichTextIcon(name) ? name : 'plus'

const titleOf = (page: PageState): string => (page.title === '' ? 'Untitled' : page.title)

/** A person's initials, for the circle that stands for them: "Guest 3f2a" is G3. */
const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter(word => word.length > 0)
    .slice(0, 2)
    .map(word => word[0]!.toUpperCase())
    .join('')

const peerAvatar = (peer: Peer, slots: Slots, h: H): Html =>
  h.span(slots.peerAvatar.attrs([h.Key(peer.id), h.Title(peer.name)]), [initialsOf(peer.name)])

export const PagesView = SlotView.forMessages<Message>()
  .define(Page.slots, (model: Model, slots, h): Html => {
    const open = pageOf(model, model.open)
    return h.div(slots.shell.attrs(), [
      sidebar(model, slots, h),
      h.main(
        slots.main.attrs(),
        open === undefined
          ? [
              h.div(slots.empty.attrs(), [
                h.p(slots.emptyTitle.attrs(), ['No page open']),
                h.p(slots.hint.attrs(), ['Choose one from the list, or start a new one.']),
                h.button(
                  slots.primary.attrs([
                    h.Type('button'),
                    h.OnClick(Message.AddedPage({ title: 'Untitled' })),
                  ]),
                  ['New page'],
                ),
              ]),
            ]
          : openPage(model, open, slots, h),
      ),
      DemoGuide({ demo: pagesDemo }, h),
    ])
  })
  .pipe(Style.attach(Page.style))

// --- the sidebar ---------------------------------------------------------------------------

const sidebar = (model: Model, slots: Slots, h: H): Html => {
  const trash = model.pages.filter(page => page.trashed === true)
  const here = (page: string) => model.peers.filter(peer => peer.page === page).length
  return h.nav(slots.sidebar.attrs([h.AriaLabel('Pages')]), [
    h.p(slots.brand.attrs(), [h.span(slots.logo.attrs([h.AriaHidden(true)]), ['P']), 'Pages']),
    h.button(
      slots.newPage.attrs([
        h.Id('new-page'),
        h.Type('button'),
        h.OnClick(Message.AddedPage({ title: 'Untitled' })),
      ]),
      [richTextIcon(h, 'plus'), 'New page'],
    ),
    h.div(slots.section.attrs(), [
      h.p(slots.sectionTitle.attrs(), ['Pages']),
      h.ul(
        slots.pageList.attrs(),
        model.pages
          .filter(page => page.trashed !== true)
          .map(page => {
            const others = here(page.id)
            return h.li(
              [h.Key(page.id)],
              [
                h.button(
                  slots.pageLink.attrs([
                    h.Type('button'),
                    ...(page.id === model.open ? [h.AriaCurrent('page')] : []),
                    h.OnClick(Message.OpenedPage({ id: page.id })),
                  ]),
                  [
                    h.span(slots.pageName.attrs(), [titleOf(page)]),
                    ...(others === 0
                      ? []
                      : [
                          h.span(
                            slots.pageCount.attrs([
                              h.Title(`${others} ${others === 1 ? 'other' : 'others'} here`),
                            ]),
                            [String(others)],
                          ),
                        ]),
                  ],
                ),
              ],
            )
          }),
      ),
    ]),
    ...(trash.length === 0
      ? []
      : [
          h.details(slots.trash.attrs(), [
            h.summary([], [`Trash (${trash.length})`]),
            h.ul(
              slots.pageList.attrs(),
              trash.map(page =>
                h.li(slots.trashed.attrs([h.Key(page.id)]), [
                  titleOf(page),
                  h.button(
                    slots.restore.attrs([
                      h.Type('button'),
                      h.AriaLabel(`Restore ${titleOf(page)}`),
                      h.OnClick(Message.RestoredPage({ id: page.id })),
                    ]),
                    ['Restore'],
                  ),
                ]),
              ),
            ),
          ]),
        ]),
    h.div(slots.online.attrs([h.AriaLive('polite')]), [
      ...model.peers.slice(0, 5).map(peer => peerAvatar(peer, slots, h)),
      model.peers.length === 0
        ? 'Only you here. Open another tab to edit together.'
        : `${model.peers.length} ${model.peers.length === 1 ? 'other' : 'others'} online`,
    ]),
  ])
}

// --- the open page -------------------------------------------------------------------------

const openPage = (model: Model, open: PageState, slots: Slots, h: H): ReadonlyArray<Html> => {
  const view = editorViewOf(model, open)
  const others = model.peers.filter(peer => peer.page === open.id)
  return [
    h.div(slots.topbar.attrs(), [
      h.span(slots.crumb.attrs(), [`Pages / ${titleOf(open)}`]),
      h.div(slots.people.attrs(), [
        ...others.map(peer => peerAvatar(peer, slots, h)),
        h.button(
          slots.danger.attrs([
            h.Id('delete-page'),
            h.Type('button'),
            h.Title('Move this page to the trash'),
            h.OnClick(Message.TrashedPage({ id: open.id })),
          ]),
          [richTextIcon(h, 'trash'), h.span(slots.toolLabel.attrs(), ['Delete'])],
        ),
      ]),
    ]),
    h.article(slots.document.attrs(), [
      h.input(
        slots.title.attrs([
          h.Id('page-title'),
          h.AriaLabel('Page title'),
          h.Placeholder('Untitled'),
          h.Value(open.title),
          h.OnInput(title => Message.RenamedPage({ id: open.id, title })),
        ]),
      ),
      toolbar(model, open, view, slots, h),
      canvas(model, view, slots, h),
      h.details(slots.markdown.attrs(), [
        h.summary([], ['Markdown']),
        h.pre([], [print(view.document).markdown]),
      ]),
    ]),
  ]
}

/** One tool: an icon, named by its label or by its title without the shortcut. */
const toolOf =
  (slots: Slots, h: H) =>
  (
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
  ): Html =>
    h.button(
      slots.tool.attrs([
        h.Type('button'),
        h.Title(title),
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

const toggleMenu = (menu: Menu, isOpen: boolean): Message =>
  isOpen ? Message.ClosedMenu() : Message.OpenedMenu({ menu })

/** What is open, read once so the view asks plain questions of it. */
const openMenu = (
  model: Model,
): {
  readonly style: 'toolbar' | 'floating' | undefined
  readonly insert: boolean
  readonly link: boolean
  /** The block whose handle menu is open. */
  readonly block: RichText.NodeId | undefined
} =>
  Option.match(model.menu, {
    onNone: () => ({ style: undefined, insert: false, link: false, block: undefined }),
    onSome: menu =>
      Menu.match(menu, {
        Style: ({ place }) => ({ style: place, insert: false, link: false, block: undefined }),
        Insert: () => ({ style: undefined, insert: true, link: false, block: undefined }),
        Link: () => ({ style: undefined, insert: false, link: true, block: undefined }),
        Block: ({ node }) => ({ style: undefined, insert: false, link: false, block: node }),
      }),
  })

/** While a menu is open, a marker beside it closes it on a press outside or on Escape. */
const dismiss = (slots: Slots, h: H): Html =>
  h.span(slots.dismiss.attrs([h.OnMount(dismissOnOutside())]), [])

const markTools = (model: Model, view: EditorView, slots: Slots, h: H): ReadonlyArray<Html> => {
  const state = {
    document: view.document,
    selection: view.selection,
    storedMarks: model.storedMarks,
  }
  return MARKS.map(([mark, name, title, priority]) =>
    toolOf(slots, h)(name, title, wrap(EditorMessage.ToggledMark({ mark })), {
      pressed: markActive(state, mark),
      priority,
    }),
  )
}

const styleMenu = (
  model: Model,
  view: EditorView,
  place: 'toolbar' | 'floating',
  slots: Slots,
  h: H,
): Html => {
  const isOpen = openMenu(model).style === place
  return h.div(slots.anchor.attrs(), [
    StyleMenu(
      {
        document: view.document,
        selection: view.selection,
        open: isOpen,
        toggled: toggleMenu(Menu.Style({ place }), isOpen),
        // A choice closes the menu as it retypes the block.
        wrap: message => Message.MenuEdit({ message }),
      },
      h,
    ),
    ...(isOpen ? [dismiss(slots, h)] : []),
  ])
}

const toolbar = (model: Model, open: PageState, view: EditorView, slots: Slots, h: H): Html => {
  const tool = toolOf(slots, h)
  const menus = openMenu(model)
  const separator = (priority: 'high' | 'low' = 'high') =>
    h.span(slots.separator.attrs([h.AriaHidden(true), h.DataAttribute('priority', priority)]), [])
  // Undo takes back this tab's own edits on this page, so it is offered while there are some.
  const has = (steps: Model['undo']) => steps.some(step => step.page === open.id)
  const insert = h.div(slots.anchor.attrs(), [
    tool('plus', 'Insert a block', toggleMenu(Menu.Insert(), menus.insert), {
      pressed: menus.insert,
      label: 'Insert',
    }),
    ...(menus.insert
      ? [
          h.div(
            slots.dropdown.attrs([
              h.Role('menu'),
              h.AriaLabel('Insert'),
              h.DataAttribute('align', 'end'),
            ]),
            INSERTS.flatMap(id => {
              const entry = pageSlashEntries.find(each => each.id === id)
              return entry === undefined
                ? []
                : [
                    h.button(
                      slots.menuItem.attrs([
                        h.Type('button'),
                        h.Role('menuitem'),
                        h.OnClick(Message.MenuEdit({ message: entry.message })),
                      ]),
                      [
                        richTextIcon(h, iconOf(entry.icon)),
                        h.span(slots.menuLabel.attrs(), [entry.label]),
                        h.span(slots.menuDescription.attrs(), [entry.description ?? '']),
                      ],
                    ),
                  ]
            }),
          ),
          dismiss(slots, h),
        ]
      : []),
  ])
  const wrapIn = (containers: ReadonlyArray<RichText.Container>) =>
    wrap(EditorMessage.WrappedBlock({ containers }))
  return h.div(slots.bar.attrs([h.Role('toolbar'), h.AriaLabel('Formatting')]), [
    tool('undo', 'Undo (Ctrl+Z)', wrap(EditorMessage.Undone()), { disabled: !has(model.undo) }),
    tool('redo', 'Redo (Ctrl+Shift+Z)', wrap(EditorMessage.Redone()), {
      disabled: !has(model.redo),
    }),
    separator(),
    styleMenu(model, view, 'toolbar', slots, h),
    separator(),
    ...markTools(model, view, slots, h),
    tool('link', 'Link (Ctrl+K)', toggleMenu(Menu.Link(), menus.link), {
      pressed: menus.link || RichText.linkAt(view.document, view.selection) !== undefined,
      disabled: !RichText.coversText(view.selection),
    }),
    separator('low'),
    tool('bulleted-list', 'Bulleted list', wrapIn([{ kind: 'List' }, { kind: 'ListItem' }]), {
      priority: 'low',
    }),
    tool(
      'numbered-list',
      'Numbered list',
      wrapIn([{ kind: 'List', props: { ordered: true } }, { kind: 'ListItem' }]),
      { priority: 'low' },
    ),
    tool(
      'checklist',
      'Checklist',
      wrapIn([{ kind: 'List' }, { kind: 'TaskItem', props: { checked: false } }]),
    ),
    tool('quote', 'Quote', wrapIn([{ kind: 'Quote' }]), { priority: 'low' }),
    h.span(slots.spacer.attrs(), []),
    insert,
  ])
}

// --- over the editor -----------------------------------------------------------------------

const canvas = (model: Model, view: EditorView, slots: Slots, h: H): Html => {
  const menus = openMenu(model)
  const menuText = menuTextOf(view)
  const slash = slashMenu(slashEntries, menuText, model.menuIndex)
  const tool = toolOf(slots, h)
  const floating =
    RichText.coversText(view.selection) && !menus.insert && menus.block === undefined
      ? [
          h.div(
            slots.floating.attrs([
              h.Role('toolbar'),
              h.AriaLabel('Selection'),
              h.OnMount(selectionAnchor({ hostId, gap: 8 })),
            ]),
            menus.link
              ? [
                  LinkEditor(
                    {
                      document: view.document,
                      selection: view.selection,
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
                  styleMenu(model, view, 'floating', slots, h),
                  ...markTools(model, view, slots, h),
                  tool('link', 'Link (Ctrl+K)', Message.OpenedMenu({ menu: Menu.Link() }), {
                    pressed: RichText.linkAt(view.document, view.selection) !== undefined,
                  }),
                ],
          ),
        ]
      : []
  // Open while a query is: one that matches nothing says so.
  const slashPopup =
    slash === undefined
      ? []
      : [
          h.div(slots.slash.attrs([h.OnMount(selectionAnchor({ hostId, gap: 6, caret: true }))]), [
            SlashMenu({ entries: slashEntries, textBefore: menuText, index: model.menuIndex }, h),
          ]),
        ]
  // A table's rows and columns, above the table the caret is in. Keyed by the table, since the
  // anchor reads its args once.
  const table = RichText.tableAt(view.document, view.selection)
  const tableTools =
    table === undefined
      ? []
      : [
          h.div(
            slots.blockTools.attrs([
              h.Key(`tools-${table.table.id}`),
              h.OnMount(blockAnchor({ hostId, node: table.table.id, gap: 6, side: 'above' })),
            ]),
            [TableTools({ document: view.document, selection: view.selection, wrap }, h)],
          ),
        ]
  const handle = Option.match(model.hovered, {
    onNone: () => [],
    onSome: node =>
      RichText.locateBlock(view.document, node) === undefined
        ? []
        : [blockHandle(model, view, node, slots, h)],
  })
  return h.div(
    slots.canvas.attrs([
      h.OnMount(hoverTracking()),
      h.OnKeyDownPreventDefault((key, modifiers) => {
        if (key === 'Escape' && Option.isSome(model.menu)) return Option.some(Message.ClosedMenu())
        if (key === 'Escape' && slash !== undefined)
          return Option.some(wrap(EditorMessage.DismissedSlash()))
        // Ctrl+K edits the link the selection covers or the caret is in, as the toolbar's Link
        // does; elsewhere it is the browser's.
        if (
          key.toLowerCase() === 'k' &&
          (modifiers.ctrlKey || modifiers.metaKey) &&
          !modifiers.altKey &&
          (RichText.coversText(view.selection) ||
            RichText.linkAt(view.document, view.selection) !== undefined)
        )
          return Option.some(Message.OpenedMenu({ menu: Menu.Link() }))
        const index = slashMove(slashEntries, menuText, model.menuIndex, key, modifiers)
        return index === undefined ? Option.none() : Option.some(Message.SlashMoved({ index }))
      }),
    ]),
    [
      h.div(slots.writing.attrs(), [
        h.submodel({ slotId: 'editor', model: view, view: editorView, toParentMessage: wrap }),
      ]),
      ...handle,
      ...tableTools,
      ...floating,
      ...slashPopup,
    ],
  )
}

// --- the block handle ----------------------------------------------------------------------

const blockMenu = (view: EditorView, node: RichText.NodeId, slots: Slots, h: H): Html => {
  const block = RichText.locateBlock(view.document, node)?.block
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
  const retype = (block: RichText.TextBlock) => Message.RetypedBlock({ node, block })
  const siblings = RichText.siblingsOf(view.document, node)
  const kind = block === undefined ? undefined : block.type === 'Node' ? block.kind : block.type
  const ofKind =
    kind === 'Paragraph' || kind === 'Heading'
      ? [
          heading('Turn into'),
          item('paragraph', 'Text', retype({ type: 'Paragraph' })),
          item('heading-1', 'Heading 1', retype({ type: 'Heading', level: 1 })),
          item('heading-2', 'Heading 2', retype({ type: 'Heading', level: 2 })),
          item('heading-3', 'Heading 3', retype({ type: 'Heading', level: 3 })),
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
      : kind === 'Callout' && block?.type === 'Node'
        ? [
            heading('Icon'),
            h.div(
              slots.menuRow.attrs(),
              CALLOUT_ICONS.map(icon =>
                h.button(
                  slots.tool.attrs([
                    h.Type('button'),
                    h.AriaPressed(block.props.icon === icon ? 'true' : 'false'),
                    h.OnClick(
                      Message.MenuEdit({
                        message: EditorMessage.ChangedProps({ node, props: { icon } }),
                      }),
                    ),
                  ]),
                  [icon],
                ),
              ),
            ),
          ]
        : []
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

/**
 * Where a block's first line sits below its top, which is where the handle lines up: a heading's
 * line is taller than a paragraph's, and a callout, a table or a code block pads its text.
 */
const lineOf = (block: RichText.Block | undefined): string => {
  if (block === undefined) return 'text'
  if (block.type === 'Heading') return `h${Math.min(block.level, 3)}`
  return block.type === 'Node' && ['Callout', 'CodeBlock', 'Table'].includes(block.kind)
    ? block.kind
    : 'text'
}

/**
 * The handle beside the hovered block: dragged, it moves the block wherever the vocabulary lets it
 * go; clicked, it opens the block's menu. Keyed by the block, since its Mounts read their args
 * once.
 */
const blockHandle = (
  model: Model,
  view: EditorView,
  node: RichText.NodeId,
  slots: Slots,
  h: H,
): Html => {
  const open = openMenu(model).block === node
  return h.div(
    slots.handle.attrs([
      h.Key(`handle-${node}`),
      h.DataAttribute('line', lineOf(RichText.locateBlock(view.document, node)?.block)),
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
      ...(open ? [blockMenu(view, node, slots, h), dismiss(slots, h)] : []),
    ],
  )
}

export const view = (model: Model, h: H): Document => {
  const open = pageOf(model, model.open)
  return {
    title: open === undefined ? 'Pages' : `${titleOf(open)} · Pages`,
    body: PagesView(model, h),
  }
}
