/**
 * The slash menu's keys and catalogue (§119, §123): the movement rule over
 * `foldkit-primitives`' `RovingTabindex.move`, and the editor's catalogue with each
 * entry's Message wrapped for this caller.
 *
 * The query, the matching, and the menu itself are the editor's
 * (`foldkit-richtext-dom/editor`) and re-exported here, so an application that imports
 * the chrome gets one vocabulary. `slashMove` is what the caller's keys call to compute
 * an index; the menu's view is `menu.ts`.
 */
import type { KeyboardModifiers } from 'foldkit/html'
import { RovingTabindex } from 'foldkit-primitives/interaction'
import {
  slashEntries as editorEntries,
  slashMenu,
  type EditorEvent,
  type SlashEntry,
} from 'foldkit-richtext-dom/editor'

export {
  matchingEntries,
  slashMenu,
  slashQuery,
  type SlashEntry,
  type SlashMenu,
} from 'foldkit-richtext-dom/editor'

/**
 * The entries this package offers: the editor's catalogue, each Message passed through
 * `wrap` — the seam the toolbar takes too, because the caller usually dispatches a
 * wrapper like `edited(...)`, which is a function.
 */
export const slashEntries = <Message>(
  wrap: (message: EditorEvent) => Message,
): ReadonlyArray<SlashEntry<Message>> =>
  editorEntries.map(entry => ({ ...entry, message: wrap(entry.message) }))

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
