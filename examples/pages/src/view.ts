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
  formattingToolbar,
  InsertEntry,
  type FormattingItem,
  type FormattingMenu,
  type RichTextIconName,
  linkEditor,
  richTextIcon,
  slashMenu,
  slashMenuView,
  slashMove,
  tableToolbar,
} from 'foldkit-mixins-richtext'
import { pagesDemo } from 'foldkit-example-site/demos'
import { demoGuide } from 'foldkit-example-site/guide'
import * as RichText from 'foldkit-richtext'
import { Message as EditorMessage } from 'foldkit-richtext-dom/editor'
import { editorView, menuTextOf, type EditorView } from 'foldkit-richtext-dom/editor-bundle'
import { blockAnchor, blockDrag, selectionAnchor } from 'foldkit-richtext-dom/toolbar'
import { print } from 'foldkit-richtext-markdown'
import {
  editorViewOf,
  hostId,
  Menu,
  Message,
  pageInEditor,
  savedOf,
  type Model,
  type Page as PageState,
  type Peer,
} from './app.js'
import { dismissOnOutside, hoverTracking } from './canvas.js'
import {
  FormattingBarStyle,
  LinkEditorStyle,
  Page,
  SelectionBarStyle,
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
const TableTools = tableToolbar<Message>().pipe(Style.attach(TableToolbarStyle))
const Bar = formattingToolbar<Message>().pipe(Style.attach(FormattingBarStyle))
const SelectionBar = formattingToolbar<Message>().pipe(Style.attach(SelectionBarStyle))
const DemoGuide = demoGuide<Message>()

/** What the toolbar's insert menu offers, by slash entry id, in this order. */
const INSERTS = ['callout', 'table', 'divider', 'code-block'] as const

const inserts = INSERTS.flatMap(id => pageSlashEntries.filter(entry => entry.id === id)).map(
  entry => InsertEntry.Editor({ entry }),
)

/** This vocabulary's marks beside the editor's own, in the order a bar draws them. */
const MARKS = ['Bold', 'Italic', 'Underline', 'Strikethrough', 'Code', 'Highlight'] as const

/** The chords this page's keymap binds beyond the editor's own, shown on their controls. */
const SHORTCUTS = {
  'mark-Underline': 'mod+u',
  'mark-Highlight': 'mod+shift+h',
  link: 'mod+k',
}

const BAR_ITEMS: ReadonlyArray<FormattingItem> = [
  'undo',
  'redo',
  'separator',
  'style',
  'separator',
  ...MARKS.map((mark): FormattingItem => ({ mark })),
  'link',
  'separator',
  'bulleted-list',
  'numbered-list',
  'checklist',
  'quote',
  'insert',
]

const SELECTION_ITEMS: ReadonlyArray<FormattingItem> = [
  'style',
  'separator',
  ...MARKS.map((mark): FormattingItem => ({ mark })),
  'link',
]

/** The page with this id, when it is in the trash. */
const trashedPage = (model: Model, id: string): Option.Option<PageState> =>
  Option.fromUndefinedOr(model.pages.find(page => page.id === id && page.trashed === true))

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
    return h.div(slots.shell.attrs(), [
      sidebar(model, slots, h),
      h.main(
        slots.main.attrs(),
        Option.match(pageInEditor(model), {
          onNone: () => [
            h.div(slots.empty.attrs(), [
              ...Option.match(
                Option.flatMap(model.justTrashed, id => trashedPage(model, id)),
                {
                  onNone: () => [],
                  onSome: page => [
                    h.p(slots.notice.attrs([h.Role('status')]), [
                      `${titleOf(page)} moved to the trash. `,
                      h.button(
                        slots.restore.attrs([
                          h.Id('undo-trash'),
                          h.Type('button'),
                          h.OnClick(Message.UndidTrash({ id: page.id })),
                        ]),
                        ['Undo'],
                      ),
                    ]),
                  ],
                },
              ),
              h.p(slots.emptyTitle.attrs(), ['No page open']),
              h.p(slots.hint.attrs(), ['Choose one from the list, or start a new one.']),
              h.button(
                slots.primary.attrs([
                  h.Type('button'),
                  h.OnClick(Message.AddedPage({ title: '' })),
                ]),
                ['New page'],
              ),
            ]),
          ],
          onSome: open => openPage(model, open, slots, h),
        }),
      ),
      DemoGuide({ demo: pagesDemo }, h),
    ])
  })
  .pipe(Style.attach(Page.style))

// --- the sidebar ---------------------------------------------------------------------------

const sidebar = (model: Model, slots: Slots, h: H): Html => {
  const trash = model.pages.filter(page => page.trashed === true)
  const here = (page: string) => model.peers.filter(peer => peer.page === page).length
  const saved = savedOf(model)
  return h.nav(slots.sidebar.attrs([h.AriaLabel('Pages')]), [
    h.p(slots.brand.attrs(), [h.span(slots.logo.attrs([h.AriaHidden(true)]), ['P']), 'Pages']),
    h.button(
      slots.newPage.attrs([
        h.Id('new-page'),
        h.Type('button'),
        h.OnClick(Message.AddedPage({ title: '' })),
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
                    ...(Option.contains(model.open, page.id) ? [h.AriaCurrent('page')] : []),
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
        ? 'Only you here.'
        : `${model.peers.length} ${model.peers.length === 1 ? 'other' : 'others'} online`,
    ]),
    // A visitor sees the collaboration without arranging it: the tab opens on the same
    // journal, shared by every tab of this browser.
    h.a(
      slots.secondTab.attrs([
        h.Id('second-tab'),
        h.Href(''),
        h.Target('_blank'),
        h.Rel('noopener'),
      ]),
      ['Open a second tab to edit together'],
    ),
    h.p(
      slots.saved.attrs([h.Id('saved'), h.Role('status'), h.DataAttribute('state', saved.state)]),
      [saved.text],
    ),
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
          h.OnKeyDownPreventDefault(key =>
            key === 'Enter' ? Option.some(Message.EnteredTitle()) : Option.none(),
          ),
        ]),
      ),
      toolbar(model, open, view, slots, h),
      canvas(model, open, view, slots, h),
      h.details(slots.markdown.attrs(), [
        h.summary([], ['Markdown']),
        h.pre([], [print(view.document).markdown]),
      ]),
    ]),
  ]
}

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

/** The formatting bar over the open page, or the one over selected text. */
const formatting = (
  model: Model,
  open: PageState,
  view: EditorView,
  place: 'toolbar' | 'floating',
  h: H,
): Html => {
  const menus = openMenu(model)
  const has = (steps: Model['undo']) => steps.some(step => step.page === open.id)
  const menu: FormattingMenu | undefined =
    menus.style === place ? 'style' : menus.link ? 'link' : menus.insert ? 'insert' : undefined
  const onToolbar = place === 'toolbar'
  return (onToolbar ? Bar : SelectionBar)(
    {
      id: onToolbar ? 'bar' : 'selection',
      document: view.document,
      selection: view.selection,
      storedMarks: model.storedMarks,
      // A choice closes the menu it was made in, as the edit is made.
      wrap: message => Message.MenuEdit({ message }),
      items: onToolbar ? BAR_ITEMS : SELECTION_ITEMS,
      // Undo takes back this tab's own edits on this page, so it is offered while there are some.
      history: { undo: has(model.undo), redo: has(model.redo) },
      menu,
      toggled: (which, isOpen) =>
        isOpen ? Message.OpenedMenu({ menu: menuOf(which, place) }) : Message.ClosedMenu(),
      inserts,
      roving: { current: Option.getOrNull(model.tabStop) },
      onFocus: id => Message.FocusedControl({ id }),
      shortcuts: SHORTCUTS,
      words: onToolbar ? undefined : { toolbar: 'Selection' },
    },
    h,
  )
}

const menuOf = (which: FormattingMenu, place: 'toolbar' | 'floating'): Menu =>
  which === 'style' ? Menu.Style({ place }) : which === 'insert' ? Menu.Insert() : Menu.Link()

/** The bar, with a marker that closes an open menu on a press outside the bar or on Escape. */
const toolbar = (model: Model, open: PageState, view: EditorView, slots: Slots, h: H): Html => {
  const menus = openMenu(model)
  return h.div(slots.barRegion.attrs(), [
    formatting(model, open, view, 'toolbar', h),
    ...(menus.style === 'toolbar' || menus.insert ? [dismiss(slots, h)] : []),
  ])
}

// --- over the editor -----------------------------------------------------------------------

const canvas = (model: Model, open: PageState, view: EditorView, slots: Slots, h: H): Html => {
  const menus = openMenu(model)
  const menuText = menuTextOf(view)
  const slash = slashMenu(slashEntries, menuText, model.menuIndex)
  const floating =
    RichText.coversText(view.selection) && !menus.insert && menus.block === undefined
      ? [
          h.div(
            slots.floating.attrs([h.OnMount(selectionAnchor({ hostId, gap: 8 }))]),
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
                  h.button(
                    slots.tool.attrs([
                      h.Type('button'),
                      h.AriaLabel('Close'),
                      h.OnClick(Message.ClosedMenu()),
                    ]),
                    [richTextIcon(h, 'close')],
                  ),
                ]
              : [
                  formatting(model, open, view, 'floating', h),
                  ...(menus.style === 'floating' ? [dismiss(slots, h)] : []),
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
  // The block under the pointer, or else the one holding the caret, so that a keyboard user
  // reaches a handle too: it comes right after the text in the tab order.
  const handle = Option.match(
    Option.orElse(model.hovered, () => caretBlock(view)),
    {
      onNone: () => [],
      onSome: node =>
        RichText.locateBlock(view.document, node) === undefined
          ? []
          : [blockHandle(model, view, node, slots, h)],
    },
  )
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

/** The top-level block the caret is in. */
const caretBlock = ({ document, selection }: EditorView): Option.Option<RichText.NodeId> => {
  if (selection?.type !== 'Range') return Option.none()
  const caret = selection.focus.node
  return Option.fromUndefinedOr(
    document.children.find(top => {
      let holds = false
      RichText.eachBlock([top], inner => {
        holds ||= inner.children.some(run => run.id === caret)
      })
      return holds
    })?.id,
  )
}

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
  return {
    title: Option.match(pageInEditor(model), {
      onNone: () => 'Pages',
      onSome: open => `${titleOf(open)} · Pages`,
    }),
    body: PagesView(model, h),
  }
}
