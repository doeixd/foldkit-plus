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
  placeholderFor,
  releaseMount,
  renderingFor,
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
  /** The named mark off the selection, or off the mark's extent at a caret: unlinking. */
  ClearedMark: { mark: Schema.String },
  RetypedBlock: { block: RichText.TextBlock },
  /** The caret's block, wrapped in containers listed outermost first: a quote, a list item. */
  WrappedBlock: { containers: Schema.Array(RichText.Container) },
  /** The caret's paragraph or heading, replaced by a kind that holds text: a code block. */
  ConvertedBlock: { to: RichText.Container },
  /** The caret's block, lifted out of its container: the inverse of a wrap. */
  LiftedBlock: {},
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
 * What the DOM can ask for: the vocabulary without the patch acknowledgement,
 * which only the Command produces. The adapter's stream is typed by this, so a
 * mount's result union names every Message it can actually emit.
 */
export type EditorEvent = Exclude<Message, { readonly _tag: 'Patched' }>

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
}> = [
  { level: 1, label: 'Heading 1', keywords: ['h1', 'title'] },
  { level: 2, label: 'Heading 2', keywords: ['h2', 'subtitle'] },
  { level: 3, label: 'Heading 3', keywords: ['h3', 'section'] },
]

/** What a mark is also searched by, so a query can name the element or the habit. */
const MARK_KEYWORDS: Readonly<Record<string, ReadonlyArray<string>>> = {
  Bold: ['strong', 'b'],
  Italic: ['em', 'i'],
  Code: ['monospace'],
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
  },
  ...HEADINGS.map(heading => ({
    id: `heading-${heading.level}`,
    label: heading.label,
    keywords: heading.keywords,
    message: Message.RetypedBlock({ block: { type: 'Heading', level: heading.level } }),
  })),
  {
    id: 'quote',
    label: 'Quote',
    keywords: ['blockquote', 'citation'],
    message: Message.WrappedBlock({ containers: [{ kind: 'Quote' }] }),
  },
  {
    id: 'bulleted-list',
    label: 'Bulleted list',
    keywords: ['ul', 'unordered', 'bullet'],
    message: Message.WrappedBlock({ containers: [{ kind: 'List' }, { kind: 'ListItem' }] }),
  },
  {
    id: 'numbered-list',
    label: 'Numbered list',
    keywords: ['ol', 'ordered'],
    message: Message.WrappedBlock({
      containers: [{ kind: 'List', props: { ordered: true } }, { kind: 'ListItem' }],
    }),
  },
  {
    // `code` is the Code mark's id; the block is a different entry.
    id: 'code-block',
    label: 'Code block',
    keywords: ['pre', 'fence', 'snippet'],
    message: Message.ConvertedBlock({ to: { kind: 'CodeBlock' } }),
  },
  ...RichText.shippedMarks.map(definition => ({
    id: definition.name.toLowerCase(),
    label: definition.name,
    keywords: MARK_KEYWORDS[definition.name] ?? [],
    message: Message.ToggledMark({ mark: definition.name }),
  })),
]

/**
 * The entries whose label or keywords contain the query, case-insensitively; every
 * entry when the query is empty, which is what `/` alone offers.
 */
export const matchingEntries = <Payload>(
  entries: ReadonlyArray<SlashEntry<Payload>>,
  query: string,
): ReadonlyArray<SlashEntry<Payload>> => {
  const needle = query.trim().toLowerCase()
  return needle.length === 0
    ? entries
    : entries.filter(entry =>
        [entry.label, ...entry.keywords].some(word => word.toLowerCase().includes(needle)),
      )
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
      decorate: drawing.decorate,
      placeholder: drawing.placeholder,
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
            placeholder: placeholderFor(element.id),
          }),
        ),
        () => Effect.sync(() => releaseMount(element)),
      ),
    ),
})
