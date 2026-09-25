/**
 * The slash menu's vocabulary (§119, §123): what opens a menu, what filters it, and
 * what choosing an entry sends. Pure data and pure functions, so the view that renders
 * it — this package's next slice, over `foldkit-primitives`' `ListNavigation` — and an
 * application that draws its own menu share one answer.
 *
 * Nothing here holds state. Whether a caret is in a query is a read of the document
 * (`textBefore`), not a flag; the only thing a menu owns is which entry is highlighted,
 * and §123 puts that beside the editor's state.
 */
import * as RichText from 'foldkit-richtext'
import { Message, type EditorEvent } from 'foldkit-richtext-dom/editor'
import type { KeyboardModifiers } from 'foldkit/html'
import { RovingTabindex } from 'foldkit-primitives/interaction'

/**
 * The query the caret is in, or `undefined` when the text before it is not a slash
 * command. A command opens at a block's start or after whitespace — `see /head` opens,
 * `see/head` is text — and reads letters, digits, and `-`, so the query is a word
 * rather than everything typed since the slash.
 */
export const slashQuery = (textBefore: string): string | undefined =>
  /(?:^|\s)\/([\p{L}\p{N}-]*)$/u.exec(textBefore)?.[1]

export interface SlashEntry<Message> {
  /** Stable id, not the label: how a list keys the entry and moves by it. */
  readonly id: string
  /** What the menu shows. */
  readonly label: string
  /** Words a query may match besides the label. */
  readonly keywords: ReadonlyArray<string>
  /** What choosing this entry sends. */
  readonly message: Message
}

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
 * The entries this package offers, in menu order: the text blocks a caret can become,
 * then the marks it can carry. `wrap` turns each editor Message into the caller's —
 * the same seam the toolbar takes, because the caller usually dispatches a wrapper.
 */
export const slashEntries = <Message>(
  wrap: (message: EditorEvent) => Message,
): ReadonlyArray<SlashEntry<Message>> => [
  {
    id: 'paragraph',
    label: 'Paragraph',
    keywords: ['text', 'body'],
    message: wrap(Message.RetypedBlock({ block: { type: 'Paragraph' } })),
  },
  ...HEADINGS.map(heading => ({
    id: `heading-${heading.level}`,
    label: heading.label,
    keywords: heading.keywords,
    message: wrap(Message.RetypedBlock({ block: { type: 'Heading', level: heading.level } })),
  })),
  ...RichText.shippedMarks.map(definition => ({
    id: definition.name.toLowerCase(),
    label: definition.name,
    keywords: MARK_KEYWORDS[definition.name] ?? [],
    message: wrap(Message.ToggledMark({ mark: definition.name })),
  })),
]

/**
 * The entries whose label or keywords contain the query, case-insensitively; every
 * entry when the query is empty, which is what `/` alone offers.
 */
export const matchingEntries = <Message>(
  entries: ReadonlyArray<SlashEntry<Message>>,
  query: string,
): ReadonlyArray<SlashEntry<Message>> => {
  const needle = query.trim().toLowerCase()
  return needle.length === 0
    ? entries
    : entries.filter(entry =>
        [entry.label, ...entry.keywords].some(word => word.toLowerCase().includes(needle)),
      )
}

/** What a menu shows for one caret: its query, what matches, and what Enter would send. */
export interface SlashMenu<Message> {
  readonly query: string
  readonly matches: ReadonlyArray<SlashEntry<Message>>
  /** The entry Enter would choose; undefined when nothing matches the query. */
  readonly highlighted: SlashEntry<Message> | undefined
}

/**
 * The menu the caret is in, or `undefined` when its text is not a slash command — the
 * one value that decides both whether to render a menu and what a key means, so the
 * view and `update` cannot disagree.
 *
 * `index` is what the menu last highlighted. A stale index — fewer matches than it
 * named, or a negative one — falls back to the first match, because a query that
 * narrows must not leave Enter with nothing to choose. A query that matches nothing is
 * still a menu: it renders as empty, and `highlighted` is undefined, which is what
 * keeps `/zzz` from sending anything.
 */
export const slashMenu = <Message>(
  entries: ReadonlyArray<SlashEntry<Message>>,
  textBefore: string,
  index: number,
): SlashMenu<Message> | undefined => {
  const query = slashQuery(textBefore)
  if (query === undefined) return undefined
  const matches = matchingEntries(entries, query)
  return { query, matches, highlighted: matches[index] ?? matches[0] }
}

/**
 * The index an arrow — or Home, or End — moves the highlight to among the current
 * matches, or `undefined` when the key moves nothing. The rule is `foldkit-primitives`'
 * `RovingTabindex.move`, so the menu and any other list agree on ArrowUp/ArrowDown,
 * Home/End, wrapping, and on a modified key moving nothing; the menu adds only "over the
 * entries the query currently matches".
 *
 * It moves from what `slashMenu` highlights rather than from the caller's remembered
 * index, so a query that narrowed past it is not moved from a position the user cannot
 * see.
 */
export const slashMove = <Message>(
  entries: ReadonlyArray<SlashEntry<Message>>,
  textBefore: string,
  index: number,
  key: string,
  modifiers: KeyboardModifiers,
): number | undefined => {
  const menu = slashMenu(entries, textBefore, index)
  if (menu === undefined || menu.matches.length === 0) return undefined
  const from = menu.highlighted === undefined ? -1 : menu.matches.indexOf(menu.highlighted)
  return RovingTabindex.move([...menu.matches.keys()], from, key, modifiers, {
    orientation: 'vertical',
    // A vertical menu never reads left or right, so the direction is not its business.
    direction: 'ltr',
    loop: true,
  })
}
