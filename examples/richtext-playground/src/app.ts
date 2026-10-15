/**
 * The playground's state and transitions. The document is the Model's, as everywhere in
 * `foldkit-richtext`: the editor reads it and reports each edit, and `update` writes the edit
 * back in the same transition. Around it the application owns what only it knows: who said what
 * in each discussion, which menu is open, and the block the pointer is over.
 *
 * A discussion is two halves, each with one owner. The document holds a `Comment` mark on the
 * text, so the anchor travels with the text through every edit and undo; the Model holds the
 * thread. Which thread is open is not stored either: it is the one the caret is in.
 */
import { Effect, Match, Option, Schema } from 'effect'
import * as Command from 'foldkit/command'
import * as Dom from 'foldkit/dom'
import { defineMessageUnion } from 'foldkit/message'
import { defineTaggedUnion } from 'foldkit/schema'
import { modifyFields } from 'foldkit/struct'
import type * as Update from 'foldkit/update'
import * as RichText from 'foldkit-richtext'
import { Message as EditorMessage } from 'foldkit-richtext-dom/editor'
import {
  Editor,
  EditorState,
  focus,
  overlay,
  placeEditor,
  type EditorView,
} from 'foldkit-richtext-dom/editor-bundle'
import { markdownInputRules, print } from 'foldkit-richtext-markdown'
import { linkEdit, stepMatch } from 'foldkit-mixins-richtext'
import { ClipboardMessage, copyText } from 'foldkit-primitives/dom'
import { firstThread, initialDocument } from './document.js'
import {
  Blocks,
  decorate,
  playgroundSlashEntries,
  rendering,
  RETURN_TO_REFERENCE,
  vocabulary,
} from './vocabulary.js'

export const hostId = 'playground-editor'

placeEditor(hostId, {
  rendering,
  vocabulary,
  inputRules: markdownInputRules,
  decorate,
  placeholder: 'Type / for blocks, or start writing…',
  lineHint: 'Type / for blocks',
  slashEntries: playgroundSlashEntries,
  // The playground's own marks, beside the editor's chords for the standard ones.
  keymap: [
    { chord: 'Mod-u', command: { type: 'ToggleMark', mark: 'Underline' } },
    { chord: 'Mod-Shift-h', command: { type: 'ToggleMark', mark: 'Highlight' } },
  ],
})

/** The person using this page; the seeded discussion is someone else's. */
export const viewer = 'Alex Morgan'

export const Remark = Schema.Struct({ author: Schema.String, body: Schema.String })
export type Remark = typeof Remark.Type

/**
 * A discussion: what was said, in order. Its text is wherever its `Comment` mark is, and it is
 * open exactly while some text carries that mark, so resolving it is taking the mark away and
 * undoing that brings the whole discussion back.
 */
export const Thread = Schema.Struct({
  id: Schema.String,
  remarks: Schema.Array(Remark),
})
export type Thread = typeof Thread.Type

/** The one popover open at a time. */
export const Menu = defineTaggedUnion({
  /** A block handle's menu, for the block it stands for. */
  Block: { node: RichText.NodeId },
  /** The toolbar's insert menu. */
  Insert: {},
  /** The toolbar's export menu. */
  Export: {},
  /** A text style menu: the toolbar's, or the one over selected text. */
  Style: { place: Schema.Literals(['toolbar', 'floating']) },
  /** Starting over, asked before the document is thrown away. */
  Reset: {},
  /** The link editor over the selection. */
  Link: {},
  /** An image's caption, being written. */
  Caption: { node: RichText.NodeId },
})
export type Menu = typeof Menu.Type

/** The find bar, while it is open: what it looks for, what replaces it, and the match it is on. */
export const Find = Schema.Struct({
  query: Schema.String,
  replacement: Schema.String,
  current: Schema.Number,
  caseSensitive: Schema.Boolean,
})
export type Find = typeof Find.Type

/** What the document can be copied as. */
export const ExportFormat = Schema.Literals(['Markdown', 'HTML', 'JSON'])
export type ExportFormat = typeof ExportFormat.Type

/** What the last copy did, said for a moment: what it says, and whether it failed. */
export const Status = Schema.Struct({ text: Schema.String, failed: Schema.Boolean })
export type Status = typeof Status.Type

export const Model = Schema.Struct({
  document: RichText.Document,
  editor: EditorState,
  threads: Schema.Array(Thread),
  /** The `n` of the next thread's id, `thread-n`. */
  nextThread: Schema.Number,
  /** A new discussion on the selection, being written. */
  composing: Schema.Boolean,
  /** What is typed in the open discussion's field, a reply or a first remark. */
  draft: Schema.String,
  menu: Schema.Option(Menu),
  linkDraft: Schema.String,
  captionDraft: Schema.String,
  /** The top-level block under the pointer, which the block handle stands beside. */
  hovered: Schema.Option(RichText.NodeId),
  /** Why the last file was not added. */
  notice: Schema.Option(Schema.String),
  /** What the last copy did, shown in the footer. */
  status: Schema.Option(Status),
  find: Schema.Option(Find),
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  GotEditor: { message: EditorMessage },
  /** An edit chosen from the block menu, which closes as the edit is made. */
  MenuEdit: { message: EditorMessage },
  HoveredBlock: { node: RichText.NodeId },
  OpenedMenu: { menu: Menu },
  ClosedMenu: {},
  /** A handle's Turn into: the block, retyped as a text block. */
  RetypedBlock: { node: RichText.NodeId, block: RichText.TextBlock },
  /** A handle's Turn into, for a container: the block, wrapped. */
  WrappedBlock: { node: RichText.NodeId, containers: Schema.Array(RichText.Container) },
  DuplicatedBlock: { node: RichText.NodeId },
  LinkDrafted: { href: Schema.String },
  CaptionDrafted: { caption: Schema.String },
  CaptionSaved: { node: RichText.NodeId },
  StartedComment: {},
  Drafted: { text: Schema.String },
  Commented: {},
  Replied: { thread: Schema.String },
  Resolved: { thread: Schema.String },
  /** A discussion's card was chosen: the caret goes to its text, which opens it. */
  OpenedThread: { thread: Schema.String },
  CancelledComment: {},
  /** A block from the toolbar, put beside the caret's top-level block. */
  Inserted: { block: RichText.Block },
  ImageRead: { src: Schema.String, alt: Schema.String, width: Schema.Number },
  /** Any other file: a video, a sound, or an attachment, as its type says. */
  FileRead: { src: Schema.String, name: Schema.String, type: Schema.String, size: Schema.Number },
  /** A code block's text, to the clipboard: its toolbar's Copy. */
  CopiedCode: { node: RichText.NodeId },
  /** The whole document, to the clipboard: the export menu's choice. */
  Exported: { format: ExportFormat },
  /** What a copy did, with what it copied, for the footer. */
  GotClipboard: { message: ClipboardMessage, what: Schema.String },
  /** A status's time is up: it goes, unless a newer one took its place. */
  StatusExpired: { status: Schema.String },
  FileRefused: { reason: Schema.String },
  DismissedNotice: {},
  SlashMoved: { index: Schema.Number },
  /** Ctrl+F: the find bar opens, on what is selected when that is short text. */
  OpenedFind: {},
  FindQueried: { query: Schema.String },
  FindReplacementDrafted: { replacement: Schema.String },
  /** The find bar went to the next match (1) or the previous one (-1), which is selected. */
  SteppedMatch: { step: Schema.Literals([1, -1]) },
  FindCaseToggled: {},
  ClosedFind: {},
  /** A field a control opened has the focus: the find bar's, or the link editor's. */
  FocusedField: {},
  /** The link editor's edit: the link applied or removed, the editor closed, the text focused. */
  LinkEdited: { message: EditorMessage },
  /** Enter in the link editor: the draft, as the Model holds it, applied. */
  LinkSubmitted: {},
  /**
   * A heading chosen from the contents, or a note from a footnote's preview: the caret goes to
   * the block's start, and the editor's focus with it.
   */
  JumpedTo: { node: RichText.NodeId },
  Reset: {},
})
export type Message = typeof Message.Type
type Return = Update.Return<Model, Message>

export const init = (): Return => ({
  model: {
    document: initialDocument(),
    editor: {
      selection: null,
      nextId: 0,
      history: RichText.emptyHistory,
      storedMarks: null,
      menuIndex: 0,
      slashDismissed: Option.none(),
      hostId,
    },
    threads: [
      {
        id: firstThread,
        remarks: [
          {
            author: 'Noor Patel',
            body: 'I love this direction. Could we add one concrete next step before sharing it?',
          },
        ],
      },
    ],
    nextThread: 2,
    composing: false,
    draft: '',
    menu: Option.none(),
    linkDraft: '',
    captionDraft: '',
    hovered: Option.none(),
    notice: Option.none(),
    status: Option.none(),
    find: Option.none(),
  },
})

// --- reads ---------------------------------------------------------------------------------

export const editorView = (model: Model): EditorView => ({
  document: model.document,
  ...model.editor,
})

const threadOf = (run: RichText.Text): string | undefined => {
  const mark = run.marks.find(candidate => RichText.markName(candidate) === 'Comment')
  const thread = mark === undefined ? undefined : RichText.markProps(mark)?.thread
  return typeof thread === 'string' ? thread : undefined
}

/** The discussion the caret is in: the `Comment` mark on the run the selection starts in. */
export const threadAt = (model: Model): string | undefined => {
  const selection = model.editor.selection
  if (selection?.type !== 'Range') return undefined
  const start = RichText.rangeStart(model.document, selection)
  const run = start === undefined ? undefined : RichText.locateRun(model.document, start.node)
  return run === undefined ? undefined : threadOf(run.run)
}

/** The text a discussion is anchored to, as a range over its marked runs, in document order. */
export const threadRange = (
  document: RichText.Document,
  thread: string,
): Extract<RichText.Selection, { readonly type: 'Range' }> | undefined => {
  const runs: Array<RichText.Text> = []
  RichText.eachBlock(document.children, block => {
    for (const run of block.children) if (threadOf(run) === thread) runs.push(run)
  })
  const first = runs[0]
  const last = runs[runs.length - 1]
  return first === undefined || last === undefined
    ? undefined
    : {
        type: 'Range',
        anchor: { node: first.id, offset: 0, affinity: 'after' },
        focus: { node: last.id, offset: last.text.length, affinity: 'before' },
      }
}

const quotes = new WeakMap<RichText.Document, ReadonlyMap<string, string>>()

/**
 * Each discussion the document anchors, in document order, with the text it is about. One walk
 * per document, kept by its identity: every card and every render reads the same answer.
 */
const anchored = (document: RichText.Document): ReadonlyMap<string, string> => {
  const kept = quotes.get(document)
  if (kept !== undefined) return kept
  const found = new Map<string, string>()
  RichText.eachBlock(document.children, block => {
    for (const run of block.children) {
      const thread = threadOf(run)
      if (thread !== undefined) found.set(thread, (found.get(thread) ?? '') + run.text)
    }
  })
  quotes.set(document, found)
  return found
}

/** The text a discussion is about, for its card. */
export const quoteOf = (document: RichText.Document, thread: string): string =>
  anchored(document).get(thread) ?? ''

/** The discussions whose text is still in the document, in document order. */
export const openThreads = (model: Model): ReadonlyArray<Thread> => {
  const byId = new Map(model.threads.map(thread => [thread.id, thread]))
  return [...anchored(model.document).keys()].flatMap(id => {
    const thread = byId.get(id)
    return thread === undefined ? [] : [thread]
  })
}

/**
 * Where the toolbar's inserts go: beside the top-level block the caret is in, before it when
 * it is an empty line (the line stays to type on) and after it otherwise, so a table or an
 * image never lands inside a table cell or a list item. With no caret, at the end.
 */
export const topLevelPlace = (model: Model): RichText.Beside => {
  const children = model.document.children
  const last = children[children.length - 1]!
  const selection = model.editor.selection
  const start =
    selection?.type === 'Range' ? RichText.rangeStart(model.document, selection) : undefined
  const run = start === undefined ? undefined : RichText.locateRun(model.document, start.node)
  const top = run === undefined ? undefined : children[run.path[0]!]
  if (top === undefined) return { after: last.id }
  const blank = top.type === 'Paragraph' && top.children.every(child => child.text === '')
  return blank ? { before: top.id } : { after: top.id }
}

/** The code block the caret is in, whose toolbar is drawn above it. */
export const codeBlockAt = (model: Model): Option.Option<RichText.NodeId> => {
  const selection = model.editor.selection
  if (selection?.type !== 'Range') return Option.none()
  const start = RichText.rangeStart(model.document, selection)
  const run = start === undefined ? undefined : RichText.locateRun(model.document, start.node)
  const block = run === undefined ? undefined : RichText.blockAtPath(model.document, run.path)
  return block?.type === 'Node' && block.kind === 'CodeBlock'
    ? Option.some(block.id)
    : Option.none()
}

/** The closed toggle whose title the caret is in, if it is in one. */
const closedToggleTitled = (model: Model): RichText.NodeId | undefined => {
  const selection = model.editor.selection
  if (selection?.type !== 'Range') return undefined
  const start = RichText.rangeStart(model.document, selection)
  const run = start === undefined ? undefined : RichText.locateRun(model.document, start.node)
  if (run === undefined || run.path.length < 2 || run.path[run.path.length - 1] !== 0)
    return undefined
  const parent = RichText.blockAtPath(model.document, run.path.slice(0, -1))
  return parent?.type === 'Node' && parent.kind === 'Toggle' && parent.props.open !== true
    ? parent.id
    : undefined
}

const caretAtStart = (block: RichText.Block): RichText.Selection | undefined => {
  let first: RichText.Text | undefined
  RichText.eachBlock([block], inner => {
    first ??= inner.children[0]
  })
  return first === undefined
    ? undefined
    : {
        type: 'Range',
        anchor: { node: first.id, offset: 0, affinity: 'after' },
        focus: { node: first.id, offset: 0, affinity: 'after' },
      }
}

// --- export ------------------------------------------------------------------------------

/**
 * The document as text in `format`, and what to call it once copied. Markdown has no syntax
 * for some of what the playground holds (a callout, an image's caption), and says so.
 */
export const exported = (
  document: RichText.Document,
  format: ExportFormat,
): { readonly text: string; readonly what: string } => {
  switch (format) {
    case 'Markdown': {
      const { markdown, diagnostics } = print(document)
      const lost = diagnostics.length
      return {
        text: markdown,
        what:
          lost === 0
            ? 'the document as Markdown'
            : `the document as Markdown, without ${lost} ${lost === 1 ? 'part' : 'parts'} it has no syntax for`,
      }
    }
    case 'HTML':
      return { text: RichText.toHtml(document.children, rendering), what: 'the document as HTML' }
    case 'JSON':
      return {
        text: JSON.stringify(Schema.encodeSync(RichText.Document)(document), null, 2),
        what: 'the document as JSON',
      }
  }
}

// --- the editor ----------------------------------------------------------------------------

/** Every field of the editor's state; the check below fails to compile when one is missing. */
const editorFields = [
  'selection',
  'nextId',
  'history',
  'storedMarks',
  'menuIndex',
  'slashDismissed',
  'hostId',
] as const satisfies ReadonlyArray<keyof EditorState>
const everyField: [Exclude<keyof EditorState, (typeof editorFields)[number]>] extends [never]
  ? true
  : never = true
void everyField

const sameEditor = (left: EditorState, right: EditorState): boolean =>
  editorFields.every(key => left[key] === right[key])

/**
 * One editor Message through the editor's `update`: the document it commits and the
 * interaction state it keeps are written back together, and its patch Command runs after.
 */
const edit = (model: Model, message: EditorMessage): Return => {
  const result = Editor.update(editorView(model), message, { hostId })
  const { document: _document, ...editor } = result.model
  const commands = Command.mapMessages(result.commands ?? [], message =>
    Message.GotEditor({ message }),
  )
  const committed = (state: RichText.EditorState): Return => ({
    model: modifyFields(model, {
      document: () => state.document,
      editor: () => ({ ...editor, selection: state.selection }),
    }),
    commands,
  })
  // Nothing committed: only the interaction state can have moved.
  const kept: Return = {
    model: sameEditor(model.editor, editor) ? model : modifyFields(model, { editor: () => editor }),
    commands,
  }
  return result.outMessage === undefined
    ? kept
    : Match.value(result.outMessage).pipe(
        Match.tagsExhaustive({
          Edited: ({ state }) => committed(state),
          Replaced: ({ state }) => committed(state),
          Rejected: () => kept,
        }),
      )
}

/** Editor Messages in order, as one transition: a caret placed, then what acts on it. */
const edits = (model: Model, messages: ReadonlyArray<EditorMessage>): Return =>
  messages.reduce<Return>(
    (done, message) => {
      const next = edit(done.model, message)
      return { model: next.model, commands: [...(done.commands ?? []), ...(next.commands ?? [])] }
    },
    { model },
  )

/** What is open, read once from the Model so a view asks plain questions of it. */
export const openMenu = (
  model: Model,
): {
  readonly insert: boolean
  readonly export: boolean
  readonly link: boolean
  /** Where a text style menu is open, if one is. */
  readonly style: 'toolbar' | 'floating' | undefined
  readonly reset: boolean
  /** The block whose handle menu is open, and whether it shows the caption field. */
  readonly block: Option.Option<{ readonly node: RichText.NodeId; readonly caption: boolean }>
} => {
  const none = {
    insert: false,
    export: false,
    link: false,
    style: undefined,
    reset: false,
    block: Option.none(),
  }
  return Option.match(model.menu, {
    onNone: () => none,
    onSome: menu =>
      Menu.match(menu, {
        Insert: () => ({ ...none, insert: true }),
        Export: () => ({ ...none, export: true }),
        Style: ({ place }) => ({ ...none, style: place }),
        Reset: () => ({ ...none, reset: true }),
        Link: () => ({ ...none, link: true }),
        Block: ({ node }) => ({ ...none, block: Option.some({ node, caption: false }) }),
        Caption: ({ node }) => ({ ...none, block: Option.some({ node, caption: true }) }),
      }),
  })
}

const closed = (model: Model): Model =>
  Option.isNone(model.menu) ? model : modifyFields(model, { menu: () => Option.none() })

/** The document's block with this identity, if it still holds one. */
const blockOf = (model: Model, node: RichText.NodeId) =>
  RichText.locateBlock(model.document, node)?.block

// --- find ----------------------------------------------------------------------------------

const found = new WeakMap<RichText.Document, Map<string, ReadonlyArray<RichText.SearchMatch>>>()

/**
 * The bar's matches, kept by the document's identity: every transition while the bar is open
 * reads them, and most leave the document as it was.
 */
const matchesOf = (model: Model, find: Find): ReadonlyArray<RichText.SearchMatch> => {
  const byQuery = found.get(model.document) ?? new Map()
  found.set(model.document, byQuery)
  const key = `${find.caseSensitive ? 'case' : 'any'}:${find.query}`
  const kept = byQuery.get(key)
  if (kept !== undefined) return kept
  const matches = RichText.findMatches(model.document, find.query, find)
  byQuery.set(key, matches)
  return matches
}

const withFind = (model: Model, change: (find: Find) => Find): Model =>
  Option.match(model.find, {
    onNone: () => model,
    onSome: find => modifyFields(model, { find: () => Option.some(change(find)) }),
  })

/** Where Ctrl+F starts: the selected text, when it is a short piece of one line. */
const selectedQuery = (model: Model): string => {
  if (!RichText.coversText(model.editor.selection)) return ''
  const slice = RichText.sliceOf(model.document, model.editor.selection)
  const text = slice === undefined ? '' : RichText.toText(slice.blocks)
  return text.length <= 80 && !/[\r\n]/.test(text) ? text : ''
}

/** How long a status shows before it goes by itself. */
const STATUS_LASTS = '3 seconds'

/** Takes a status away once it has been shown long enough to read. */
const ExpireStatus = Command.define('ExpireStatus', {
  args: { status: Schema.String },
  messages: [Message.StatusExpired],
  execute: ({ status }) =>
    Effect.sleep(STATUS_LASTS).pipe(Effect.as(Message.StatusExpired({ status }))),
})

/** Gives the focus to the field a control just opened, so its keys go there at once. */
const FocusField = Command.define('FocusField', {
  args: { selector: Schema.String },
  messages: [Message.FocusedField],
  execute: ({ selector }) =>
    Dom.focus(selector).pipe(Effect.ignore, Effect.as(Message.FocusedField())),
})

/**
 * The find bar's matches drawn over the editor, the current one brought into view; none once
 * the bar is closed. An overlay names positions in the document shown, so it is drawn again
 * whenever the document or the bar changes.
 */
const showMatches = (model: Model): Command.Command<Message> => {
  const decorations = Option.match(model.find, {
    onNone: () => [],
    onSome: find => RichText.searchDecorations(model.document, find.query, find),
  })
  const drawn = overlay(hostId, decorations)
  return Command.mapMessage(
    {
      ...drawn,
      effect: Effect.tap(drawn.effect, () =>
        Effect.sync(() =>
          document
            .getElementById(hostId)
            ?.querySelector(`[data-decoration="${RichText.SEARCH_CURRENT_DECORATION}"]`)
            ?.scrollIntoView({ block: 'nearest' }),
        ),
      ),
    },
    message => Message.GotEditor({ message }),
  )
}

/**
 * After every transition: the current match kept among the matches there are, and the matches
 * drawn again when what they are read from changed.
 */
const followFind = (before: Model, result: Return): Return => {
  const model = Option.match(result.model.find, {
    onNone: () => result.model,
    onSome: find => {
      const last = Math.max(0, matchesOf(result.model, find).length - 1)
      return find.current > last
        ? withFind(result.model, () => ({ ...find, current: last }))
        : result.model
    },
  })
  const changed = model.find !== before.find || model.document !== before.document
  const shown = Option.isSome(model.find) || Option.isSome(before.find)
  return changed && shown
    ? { model, commands: [...(result.commands ?? []), showMatches(model)] }
    : { ...result, model }
}

/** A match made current and selected; the find field keeps the focus. */
const goToMatch = (model: Model, index: number): Return =>
  Option.match(model.find, {
    onNone: () => ({ model }),
    onSome: find => {
      const match = matchesOf(model, find)[index]
      const kept = withFind(model, () => ({ ...find, current: index }))
      return match === undefined
        ? { model: kept }
        : edit(
            kept,
            EditorMessage.Selected({
              selection: { type: 'Range', anchor: match.from, focus: match.to },
            }),
          )
    },
  })

// --- going somewhere ------------------------------------------------------------------------

/** The caret placed, and the editor given the focus there: for a control outside the editor. */
const focusOn = (model: Model, caret: RichText.Selection): Return => {
  const placed = edit(closed(model), EditorMessage.Selected({ selection: caret }))
  return {
    ...placed,
    commands: [
      ...(placed.commands ?? []),
      Command.mapMessage(focus(hostId, caret), message => Message.GotEditor({ message })),
    ],
  }
}

/** A note's ↩: the caret after the first reference to its footnote, with the editor's focus. */
const backToReference = (model: Model, definition: RichText.NodeId): Return => {
  const block = blockOf(model, definition)
  const label = block?.type === 'Node' ? block.props.label : undefined
  const reference = RichText.footnotesOf(model.document).find(note => note.label === label)
    ?.references[0]
  const run = reference === undefined ? undefined : RichText.locateRun(model.document, reference)
  if (run === undefined) return { model }
  const after = { node: run.run.id, offset: run.run.text.length, affinity: 'after' as const }
  return focusOn(model, { type: 'Range', anchor: after, focus: after })
}

// --- update --------------------------------------------------------------------------------

export const update = (model: Model, message: Message): Return =>
  followFind(model, step(model, message))

const step = (model: Model, message: Message): Return =>
  Message.match<Return>(message, {
    GotEditor: ({ message }) => {
      if (message._tag === 'ActivatedAdornment' && message.action === RETURN_TO_REFERENCE) {
        return backToReference(model, message.node)
      }
      // Enter in a closed toggle's title adds a line inside it, which a closed toggle hides;
      // it opens first, in the same transition, so the new line is there to type on.
      const toggle = message._tag === 'Entered' ? closedToggleTitled(model) : undefined
      const result =
        toggle === undefined
          ? edit(model, message)
          : edits(model, [
              EditorMessage.ChangedProps({ node: toggle, props: { open: true } }),
              message,
            ])
      // A caret moved elsewhere ends a discussion being started, as clicking away does.
      return message._tag === 'Selected' &&
        model.composing &&
        !RichText.coversText(result.model.editor.selection)
        ? { ...result, model: modifyFields(result.model, { composing: () => false }) }
        : result
    },
    MenuEdit: ({ message }) => edit(closed(model), message),
    HoveredBlock: ({ node }) =>
      Option.getOrUndefined(model.hovered) === node
        ? { model }
        : { model: modifyFields(model, { hovered: () => Option.some(node) }) },
    OpenedMenu: ({ menu }) => {
      const opened = modifyFields(model, { menu: () => Option.some(menu) })
      return Menu.match<Return>(menu, {
        Block: () => ({ model: opened }),
        Insert: () => ({ model: opened }),
        Export: () => ({ model: opened }),
        Style: () => ({ model: opened }),
        Reset: () => ({ model: opened }),
        Link: () => ({
          model: modifyFields(opened, {
            linkDraft: () => RichText.linkAt(model.document, model.editor.selection)?.href ?? '',
          }),
          commands: [FocusField({ selector: '[data-link="address"]' })],
        }),
        Caption: ({ node }) => {
          const block = blockOf(model, node)
          const caption = block?.type === 'Node' ? block.props.caption : undefined
          return {
            model: modifyFields(opened, {
              captionDraft: () => (typeof caption === 'string' ? caption : ''),
            }),
          }
        },
      })
    },
    ClosedMenu: () => ({ model: closed(model) }),
    RetypedBlock: ({ node, block }) => {
      const found = blockOf(model, node)
      const caret = found === undefined ? undefined : caretAtStart(found)
      return caret === undefined
        ? { model: closed(model) }
        : edits(closed(model), [
            EditorMessage.Selected({ selection: caret }),
            EditorMessage.RetypedBlock({ block }),
          ])
    },
    WrappedBlock: ({ node, containers }) => {
      const found = blockOf(model, node)
      const caret = found === undefined ? undefined : caretAtStart(found)
      return caret === undefined
        ? { model: closed(model) }
        : edits(closed(model), [
            EditorMessage.Selected({ selection: caret }),
            EditorMessage.WrappedBlock({ containers }),
          ])
    },
    DuplicatedBlock: ({ node }) => {
      const block = blockOf(model, node)
      return block === undefined
        ? { model: closed(model) }
        : edit(closed(model), EditorMessage.InsertedBlock({ block, to: { after: node } }))
    },
    LinkDrafted: ({ href }) => ({ model: modifyFields(model, { linkDraft: () => href }) }),
    CaptionDrafted: ({ caption }) => ({
      model: modifyFields(model, { captionDraft: () => caption }),
    }),
    CaptionSaved: ({ node }) =>
      edit(
        closed(model),
        EditorMessage.ChangedProps({ node, props: { caption: model.captionDraft.trim() } }),
      ),
    StartedComment: () =>
      RichText.coversText(model.editor.selection)
        ? { model: modifyFields(closed(model), { composing: () => true, draft: () => '' }) }
        : { model },
    Drafted: ({ text }) => ({ model: modifyFields(model, { draft: () => text }) }),
    Commented: () => {
      const body = model.draft.trim()
      if (body === '' || !RichText.coversText(model.editor.selection)) return { model }
      const thread = `thread-${model.nextThread}`
      const marked = edit(
        model,
        EditorMessage.AppliedMark({ mark: { name: 'Comment', props: { thread } } }),
      )
      // The mark is refused over text it cannot carry, a code block's, and then there is no thread.
      if (marked.model.document === model.document) return { model }
      return {
        ...marked,
        model: modifyFields(marked.model, {
          threads: threads => [...threads, { id: thread, remarks: [{ author: viewer, body }] }],
          nextThread: next => next + 1,
          composing: () => false,
          draft: () => '',
        }),
      }
    },
    Replied: ({ thread }) => {
      const body = model.draft.trim()
      return body === ''
        ? { model }
        : {
            model: modifyFields(model, {
              threads: threads =>
                threads.map(candidate =>
                  candidate.id === thread
                    ? { ...candidate, remarks: [...candidate.remarks, { author: viewer, body }] }
                    : candidate,
                ),
              draft: () => '',
            }),
          }
    },
    Resolved: ({ thread }) => {
      const range = threadRange(model.document, thread)
      // Only this discussion's mark: another one started inside its text keeps its own.
      return range === undefined
        ? { model }
        : edits(modifyFields(model, { draft: () => '' }), [
            EditorMessage.Selected({ selection: range }),
            EditorMessage.ClearedMark({ mark: { name: 'Comment', props: { thread } } }),
            EditorMessage.Selected({ selection: { ...range, anchor: range.focus } }),
          ])
    },
    OpenedThread: ({ thread }) => {
      const range = threadRange(model.document, thread)
      if (range === undefined || threadAt(model) === thread) return { model }
      return edit(
        modifyFields(model, { draft: () => '', composing: () => false }),
        EditorMessage.Selected({ selection: { ...range, focus: range.anchor } }),
      )
    },
    CancelledComment: () => ({
      model: modifyFields(model, { composing: () => false, draft: () => '' }),
    }),
    Inserted: ({ block }) =>
      edit(closed(model), EditorMessage.InsertedBlock({ block, to: topLevelPlace(model) })),
    ImageRead: ({ src, alt, width }) =>
      edit(
        modifyFields(closed(model), { notice: () => Option.none() }),
        EditorMessage.InsertedBlock({
          block: Blocks.image(src, alt, width),
          to: topLevelPlace(model),
        }),
      ),
    FileRead: file =>
      edit(
        modifyFields(closed(model), { notice: () => Option.none() }),
        EditorMessage.InsertedBlock({
          block: RichText.mediaBlock(file),
          to: topLevelPlace(model),
        }),
      ),
    CopiedCode: ({ node }) => {
      const block = blockOf(model, node)
      return block === undefined
        ? { model }
        : {
            model,
            commands: [
              Command.mapMessage(copyText(RichText.toText([block])), message =>
                Message.GotClipboard({ message, what: 'the code' }),
              ),
            ],
          }
    },
    Exported: ({ format }) => {
      const { text, what } = exported(model.document, format)
      return {
        model: closed(model),
        commands: [
          Command.mapMessage(copyText(text), message => Message.GotClipboard({ message, what })),
        ],
      }
    },
    GotClipboard: ({ message, what }) => {
      // The browser's reason is for a developer; a reader is told what did not happen.
      const status = ClipboardMessage.match(message, {
        Copied: () => ({ text: `Copied ${what}.`, failed: false }),
        CopyFailed: () => ({
          text: `Could not copy ${what}: this browser did not allow it.`,
          failed: true,
        }),
      })
      return {
        model: modifyFields(model, { status: () => Option.some(status) }),
        commands: [ExpireStatus({ status: status.text })],
      }
    },
    StatusExpired: ({ status }) =>
      Option.getOrUndefined(model.status)?.text === status
        ? { model: modifyFields(model, { status: () => Option.none() }) }
        : { model },
    FileRefused: ({ reason }) => ({
      model: modifyFields(model, { notice: () => Option.some(reason) }),
    }),
    DismissedNotice: () => ({ model: modifyFields(model, { notice: () => Option.none() }) }),
    SlashMoved: ({ index }) =>
      index === model.editor.menuIndex
        ? { model }
        : { model: modifyFields(model, { editor: editor => ({ ...editor, menuIndex: index }) }) },
    OpenedFind: () => {
      const selected = selectedQuery(model)
      const open = Option.getOrElse(model.find, (): Find => ({
        query: '',
        replacement: '',
        current: 0,
        caseSensitive: false,
      }))
      return {
        model: modifyFields(closed(model), {
          find: () =>
            Option.some({ ...open, query: selected === '' ? open.query : selected, current: 0 }),
        }),
        commands: [FocusField({ selector: '[data-find="query"]' })],
      }
    },
    FindQueried: ({ query }) => ({
      model: withFind(model, find => ({ ...find, query, current: 0 })),
    }),
    FindReplacementDrafted: ({ replacement }) => ({
      model: withFind(model, find => ({ ...find, replacement })),
    }),
    SteppedMatch: ({ step }) =>
      Option.match(model.find, {
        onNone: () => ({ model }),
        onSome: find =>
          goToMatch(model, stepMatch(find.current, matchesOf(model, find).length, step)),
      }),
    FindCaseToggled: () => ({
      model: withFind(model, find => ({ ...find, caseSensitive: !find.caseSensitive, current: 0 })),
    }),
    ClosedFind: () => ({ model: modifyFields(model, { find: () => Option.none() }) }),
    FocusedField: () => ({ model }),
    LinkSubmitted: () =>
      Option.match(linkEdit(model.document, model.editor.selection, model.linkDraft), {
        onNone: () => ({ model }),
        onSome: message => step(model, Message.LinkEdited({ message })),
      }),
    LinkEdited: ({ message }) => {
      const result = edit(closed(model), message)
      const selection = result.model.editor.selection
      return selection === null
        ? result
        : {
            ...result,
            commands: [
              ...(result.commands ?? []),
              Command.mapMessage(focus(hostId, selection), message =>
                Message.GotEditor({ message }),
              ),
            ],
          }
    },
    JumpedTo: ({ node }) => {
      const block = blockOf(model, node)
      const caret = block === undefined ? undefined : caretAtStart(block)
      return caret === undefined ? { model } : focusOn(model, caret)
    },
    Reset: () => init(),
  })
