/**
 * The editor's Message vocabulary and the mount that produces it (§§31, 118).
 *
 * The DOM adapter reports what the browser asked for as commands, a caret, and a
 * history chord. This is what those mean to an editor's `update`, so one set of
 * Messages arrives whether a person typed, pasted, or moved the caret. The Bundle
 * proof in `controlled.ts` consumed these by hand; `events` is where the browser
 * produces them.
 */
import { Effect, Queue, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import * as Mount from 'foldkit/mount'
import * as RichText from 'foldkit-richtext'
import {
  attachmentIn,
  decorationsFor,
  mountInto,
  placeholdersFor,
  releaseMount,
  renderingFor,
  vocabularyFor,
} from './host.js'
import type { Decorate } from './events.js'

export const Message = defineMessageUnion({
  Typed: { text: Schema.String },
  Backspace: {},
  DeletedForward: {},
  Entered: {},
  ToggledMark: { mark: Schema.String },
  /** Exactly this mark over the selection, or over the mark's extent at a caret: a link's new `href`. */
  AppliedMark: { mark: RichText.RunMark },
  /**
   * The named mark off the selection, or off the mark's extent at a caret: unlinking. A mark
   * value clears only the runs carrying exactly it.
   */
  ClearedMark: { mark: RichText.RunMark },
  RetypedBlock: { block: RichText.TextBlock },
  /** The caret's block, wrapped in containers listed outermost first: a quote, a list item. */
  WrappedBlock: { containers: Schema.Array(RichText.Container) },
  /** The caret's paragraph or heading, replaced by a kind that holds text: a code block. */
  ConvertedBlock: { to: RichText.Container },
  /** The caret's block, lifted out of its container: the inverse of a wrap. */
  LiftedBlock: {},
  /** A block moved before or after a sibling in its container: a block handle's up and down. */
  MovedBlock: { node: RichText.NodeId, to: RichText.Beside },
  /** A block put beside another, under fresh identities: an insert menu's choice, a Duplicate. */
  InsertedBlock: { block: RichText.Block, to: Schema.optionalKey(RichText.Beside) },
  /** A block and what it holds, deleted: a block handle's Delete. */
  DeletedBlock: { node: RichText.NodeId },
  /** A row above or below the caret's table cell. */
  InsertedRow: { where: Schema.Literals(['before', 'after']) },
  /** A column before or after the caret's table cell. */
  InsertedColumn: { where: Schema.Literals(['before', 'after']) },
  /** The caret's table row, deleted. */
  DeletedRow: {},
  /** The caret's table column, deleted. */
  DeletedColumn: {},
  /** Tab: indentation in code, the next cell in a table. */
  Indented: {},
  /**
   * Find and replace: the match at index `at` of `query`, or every match when `at` is absent,
   * becomes `replacement`, as one undo step.
   */
  ReplacedText: {
    query: Schema.String,
    replacement: Schema.String,
    caseSensitive: Schema.optionalKey(Schema.Boolean),
    at: Schema.optionalKey(Schema.Number),
  },
  /** `InsertFootnote`: a reference at the caret, its definition last, the caret in it. */
  InsertedFootnote: { text: Schema.optionalKey(Schema.String) },
  /** `RenameFootnote`: a footnote's label, on its definition and every reference. */
  RenamedFootnote: { from: Schema.String, to: Schema.String },
  /** Shift+Tab: less indentation in code, the previous cell in a table. */
  Outdented: {},
  /**
   * An adornment with an `action` was clicked: a code block's Copy, say. Not an edit, so the
   * editor changes nothing; it is the application's to act on.
   */
  ActivatedAdornment: { node: RichText.NodeId, action: Schema.String },
  /** Escape over a slash menu: it closes until its query ends, and Enter splits again. */
  DismissedSlash: {},
  /** Props of a node block, set: a task's checkbox, a toggle's arrow, an image's caption. */
  ChangedProps: { node: RichText.NodeId, props: Schema.JsonObject },
  Selected: { selection: Schema.NullOr(RichText.Selection) },
  Pasted: { slice: RichText.Slice },
  Undone: {},
  Redone: {},
  /** The patch Command's completion: Foldkit Commands report a Message, and a
   *  render has nothing to say beyond that it happened. */
  Patched: {},
})
export type Message = typeof Message.Type

/**
 * What the DOM can ask for: the vocabulary without the patch acknowledgement, which only the
 * Command produces, and a slash menu's dismissal, which the application's menu sends. The adapter's stream is typed by this, so a
 * mount's result union names every Message it can actually emit.
 */
export type EditorEvent = Exclude<Message, { readonly _tag: 'Patched' | 'DismissedSlash' }>

/**
 * What a browser intent means to an editor. The adapter reports only plain
 * insertions, so an insertion carrying marks is refused rather than quietly
 * losing them: what a marked insertion means is the editor's decision, not the
 * adapter's, and the adapter never has one to report.
 */
export const toMessage = (command: RichText.Command): EditorEvent | undefined => {
  switch (command.type) {
    case 'InsertText':
      return command.marks === undefined ? Message.Typed({ text: command.text }) : undefined
    case 'DeleteBackward':
      return Message.Backspace()
    case 'DeleteForward':
      return Message.DeletedForward()
    case 'SplitBlock':
      return Message.Entered()
    case 'ToggleMark':
      // The adapter toggles by name; a mark value carrying props is not
      // expressible as a toggle, so it is refused rather than stripped.
      return typeof command.mark === 'string'
        ? Message.ToggledMark({ mark: command.mark })
        : undefined
    case 'Paste':
      return Message.Pasted({ slice: command.slice })
    case 'SetProps':
      return Message.ChangedProps({ node: command.node, props: command.props })
    case 'Indent':
      return Message.Indented()
    case 'Outdent':
      return Message.Outdented()
    default:
      return undefined
  }
}

/**
 * The slash menu's vocabulary (§123, §124 §11): what opens a menu, what it offers,
 * what a query matches, and what a chosen entry sends. An entry carries one of this
 * module's Messages, not a command, so the Bundle resolves Enter by handling the chosen
 * entry as the Message a click would send — which is also what makes a mark entry update
 * the caret's stored marks rather than run a collapsed toggle the command layer treats as
 * a no-op.
 *
 * Whether a caret is in a query is a read of the document (`RichText.textBefore`),
 * not a flag. Nothing here holds state.
 */
export interface SlashEntry<Payload> {
  /** Stable id, not the label: how a list keys the entry and moves by it. */
  readonly id: string
  /** What the menu shows. */
  readonly label: string
  /** Words a query may match besides the label. */
  readonly keywords: ReadonlyArray<string>
  /** What choosing this entry sends: an editor Message here, a caller's in a view. */
  readonly message: Payload
  /** A line under the label saying what the entry makes. */
  readonly description?: string | undefined
  /** The heading the entry is listed under while no query narrows the menu. */
  readonly group?: string | undefined
  /** The icon a menu draws for it, by name; a view's own set says what names it knows. */
  readonly icon?: string | undefined
}

/**
 * The query the caret is in, or `undefined` when the text before it is not a slash
 * command. A command opens at a block's start or after whitespace — `see /head` opens,
 * `see/head` is text — and reads letters, digits, and `-`, so the query is a word
 * rather than everything typed since the slash.
 */
export const slashQuery = (textBefore: string): string | undefined =>
  /(?:^|\s)\/([\p{L}\p{N}-]*)$/u.exec(textBefore)?.[1]

const HEADINGS: ReadonlyArray<{
  readonly level: 1 | 2 | 3
  readonly label: string
  readonly keywords: ReadonlyArray<string>
  readonly description: string
}> = [
  { level: 1, label: 'Heading 1', keywords: ['h1', 'title'], description: 'A title' },
  { level: 2, label: 'Heading 2', keywords: ['h2', 'subtitle'], description: 'A section' },
  { level: 3, label: 'Heading 3', keywords: ['h3', 'section'], description: 'A subsection' },
]

/** What a mark is also searched by, and what its entry says it does. */
const MARK_ENTRIES: Readonly<
  Record<string, { readonly keywords: ReadonlyArray<string>; readonly description: string }>
> = {
  Bold: { keywords: ['strong', 'b'], description: 'Strong emphasis' },
  Italic: { keywords: ['em', 'i'], description: 'Emphasis' },
  Code: { keywords: ['monospace'], description: 'Code within a line' },
}

/**
 * The entries the editor offers, in menu order: the text blocks a caret can become, the
 * standard vocabulary's quote, lists, and code block, then the marks it can carry. Each is a
 * Message this module already defines, so a chosen entry needs no editing vocabulary of its
 * own. The standard kinds are named, not required: a placement whose vocabulary lacks them
 * refuses the entry's edit, as it refuses any edit it does not declare.
 */
export const slashEntries: ReadonlyArray<SlashEntry<EditorEvent>> = [
  {
    id: 'paragraph',
    label: 'Paragraph',
    keywords: ['text', 'body'],
    message: Message.RetypedBlock({ block: { type: 'Paragraph' } }),
    description: 'Plain text',
    group: 'Text',
    icon: 'paragraph',
  },
  ...HEADINGS.map(heading => ({
    id: `heading-${heading.level}`,
    label: heading.label,
    keywords: heading.keywords,
    message: Message.RetypedBlock({ block: { type: 'Heading', level: heading.level } }),
    description: heading.description,
    group: 'Text',
    icon: `heading-${heading.level}`,
  })),
  {
    id: 'quote',
    label: 'Quote',
    keywords: ['blockquote', 'citation'],
    message: Message.WrappedBlock({ containers: [{ kind: 'Quote' }] }),
    description: 'Words set apart',
    group: 'Text',
    icon: 'quote',
  },
  {
    id: 'bulleted-list',
    label: 'Bulleted list',
    keywords: ['ul', 'unordered', 'bullet'],
    message: Message.WrappedBlock({ containers: [{ kind: 'List' }, { kind: 'ListItem' }] }),
    description: 'Points in no order',
    group: 'Lists',
    icon: 'bulleted-list',
  },
  {
    id: 'numbered-list',
    label: 'Numbered list',
    keywords: ['ol', 'ordered'],
    message: Message.WrappedBlock({
      containers: [{ kind: 'List', props: { ordered: true } }, { kind: 'ListItem' }],
    }),
    description: 'Steps in order',
    group: 'Lists',
    icon: 'numbered-list',
  },
  {
    // `code` is the Code mark's id; the block is a different entry.
    id: 'code-block',
    label: 'Code block',
    keywords: ['pre', 'fence', 'snippet'],
    message: Message.ConvertedBlock({ to: { kind: 'CodeBlock' } }),
    description: 'Code, kept as typed',
    group: 'Blocks',
    icon: 'code-block',
  },
  ...RichText.shippedMarks.map(definition => ({
    id: definition.name.toLowerCase(),
    label: definition.name,
    keywords: MARK_ENTRIES[definition.name]?.keywords ?? [],
    message: Message.ToggledMark({ mark: definition.name }),
    description: MARK_ENTRIES[definition.name]?.description,
    group: 'Formatting',
    icon: definition.name.toLowerCase(),
  })),
]

/** How well an entry answers a query: lower is better, `undefined` is no match. */
const rank = (entry: SlashEntry<unknown>, needle: string): number | undefined => {
  const label = entry.label.toLowerCase()
  if (label.startsWith(needle)) return 0
  if (label.split(/\s+/).some(word => word.startsWith(needle))) return 1
  if (entry.keywords.some(word => word.toLowerCase().startsWith(needle))) return 2
  if ([label, ...entry.keywords].some(word => word.toLowerCase().includes(needle))) return 3
  return undefined
}

/**
 * What `/` alone offers: every entry, each group's together in the order its first entry comes,
 * so the list a menu draws under its headings is the list the keys move through.
 */
const grouped = <Payload>(
  entries: ReadonlyArray<SlashEntry<Payload>>,
): ReadonlyArray<SlashEntry<Payload>> => {
  const groups = new Map<string | undefined, Array<SlashEntry<Payload>>>()
  for (const entry of entries) {
    const group = groups.get(entry.group)
    if (group === undefined) groups.set(entry.group, [entry])
    else group.push(entry)
  }
  return [...groups.values()].flat()
}

/**
 * The entries a query matches, case-insensitively, the best first: a label it starts, a word of
 * a label it starts, a keyword it starts, then any it appears in, each in catalogue order.
 * Every entry, grouped, when the query is empty, which is what `/` alone offers.
 */
export const matchingEntries = <Payload>(
  entries: ReadonlyArray<SlashEntry<Payload>>,
  query: string,
): ReadonlyArray<SlashEntry<Payload>> => {
  const needle = query.trim().toLowerCase()
  if (needle.length === 0) return grouped(entries)
  return entries
    .flatMap(entry => {
      const score = rank(entry, needle)
      return score === undefined ? [] : [{ entry, score }]
    })
    .sort((left, right) => left.score - right.score)
    .map(({ entry }) => entry)
}

/** What a menu shows for one caret: its query, what matches, and what Enter would send. */
export interface SlashMenu<Payload> {
  readonly query: string
  readonly matches: ReadonlyArray<SlashEntry<Payload>>
  /** The entry Enter would choose; undefined when nothing matches the query. */
  readonly highlighted: SlashEntry<Payload> | undefined
}

/**
 * The menu the caret is in, or `undefined` when its text is not a slash command — the
 * one value that decides both whether to render a menu and what Enter means, so the
 * view and `update` cannot disagree.
 *
 * `index` is what the menu last highlighted. A stale index — fewer matches than it
 * named, or a negative one — falls back to the first match, because a query that
 * narrows must not leave Enter with nothing to choose. A query that matches nothing is
 * still a menu: it renders as empty, and `highlighted` is undefined, which is what
 * keeps `/zzz` from choosing anything.
 */
export const slashMenu = <Payload>(
  entries: ReadonlyArray<SlashEntry<Payload>>,
  textBefore: string,
  index: number,
): SlashMenu<Payload> | undefined => {
  const query = slashQuery(textBefore)
  if (query === undefined) return undefined
  const matches = matchingEntries(entries, query)
  return { query, matches, highlighted: matches[index] ?? matches[0] }
}

/** How an attached editor draws: its rendering registry and what it draws over the document. */
export interface EditorDrawing {
  readonly rendering?: RichText.Rendering | undefined
  readonly decorate?: Decorate | undefined
  /** What a blank document shows. */
  readonly placeholder?: string | undefined
  /** What the empty paragraph the caret is in shows. */
  readonly lineHint?: string | undefined
  /** The node vocabulary, which says where Tab means something (`RichText.takesTab`). */
  readonly nodes?: RichText.NodeRegistry | undefined
}

/**
 * Attaches the translation to a host element and reports each Message through
 * `emit`. Separate from the mount so a test can drive the DOM without pulling a
 * stream, and so a caller embedding the editor directly can say how it draws.
 */
export const attachEditor = (
  host: Element,
  content: RichText.Document,
  emit: (message: EditorEvent) => void,
  drawing: EditorDrawing = {},
) =>
  mountInto(
    host,
    content,
    {
      onIntent: command => {
        const message = toMessage(command)
        if (message !== undefined) emit(message)
      },
      onHistory: direction => emit(direction === 'undo' ? Message.Undone() : Message.Redone()),
      onSelection: selection => emit(Message.Selected({ selection })),
      onAction: (node, action) => emit(Message.ActivatedAdornment({ node, action })),
      decorate: drawing.decorate,
      nodes: drawing.nodes,
      placeholder: drawing.placeholder,
      lineHint: drawing.lineHint,
    },
    drawing.rendering,
  )

/**
 * The patch Command's work: find the element the view gave an id to and sync the
 * attachment it holds. A missing host is not an error — the editor went away
 * while the transition was in flight — so it reports whether it patched.
 */
export const patchEditor = (
  hostId: string,
  state: RichText.EditorState,
  changeSet: RichText.ChangeSet,
): boolean => {
  const host = document.getElementById(hostId)
  if (host === null) return false
  const attachment = attachmentIn(host)
  if (attachment === undefined) return false
  attachment.sync(state, changeSet)
  return true
}

/** Draws the decorations of the editor at `hostId` again; false when none is attached there. */
export const redecorateEditor = (hostId: string): boolean => {
  const host = document.getElementById(hostId)
  const attachment = host === null ? undefined : attachmentIn(host)
  attachment?.redecorate()
  return attachment !== undefined
}

/**
 * Focuses the editor at `hostId` with `selection` in the browser (`Attachment.focus`); false
 * when none is attached there.
 */
export const focusEditor = (hostId: string, selection: RichText.Selection): boolean => {
  const host = document.getElementById(hostId)
  const attachment = host === null ? undefined : attachmentIn(host)
  attachment?.focus(selection)
  return attachment !== undefined
}

/**
 * The latest document the editor at `hostId` holds (`Attachment.held`), or undefined when none
 * is attached there.
 */
export const heldDocument = (hostId: string): RichText.Document | undefined => {
  const host = document.getElementById(hostId)
  return host === null ? undefined : attachmentIn(host)?.held()
}

/** The editor's events as a mount: one attachment per element, released with it.
 *  The rendering registry is looked up by the host id the placement recorded
 *  (§122), so it reaches the mount without entering a Model or a mount's args. */
export const events = Mount.defineStream('RichTextDomEvents', {
  args: { content: RichText.Document },
  messages: [
    Message.Typed,
    Message.Backspace,
    Message.DeletedForward,
    Message.Entered,
    Message.ToggledMark,
    Message.AppliedMark,
    Message.ClearedMark,
    Message.RetypedBlock,
    Message.WrappedBlock,
    Message.ConvertedBlock,
    Message.LiftedBlock,
    Message.MovedBlock,
    Message.InsertedBlock,
    Message.DeletedBlock,
    Message.ChangedProps,
    Message.InsertedRow,
    Message.InsertedColumn,
    Message.DeletedRow,
    Message.DeletedColumn,
    Message.Indented,
    Message.Outdented,
    Message.ReplacedText,
    Message.InsertedFootnote,
    Message.RenamedFootnote,
    Message.ActivatedAdornment,
    Message.Selected,
    Message.Pasted,
    Message.Undone,
    Message.Redone,
  ],
  execute: ({ element, content }) =>
    Stream.callback<EditorEvent>(queue =>
      Effect.acquireRelease(
        Effect.sync(() =>
          attachEditor(element, content, message => Queue.offerUnsafe(queue, message), {
            rendering: renderingFor(element.id),
            decorate: decorationsFor(element.id),
            ...placeholdersFor(element.id),
            nodes: vocabularyFor(element.id).nodes,
          }),
        ),
        () => Effect.sync(() => releaseMount(element)),
      ),
    ),
})
