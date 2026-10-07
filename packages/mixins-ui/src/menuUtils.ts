/**
 * Pure view-supporting functions vendored verbatim (logic, names, and doc
 * comments) from `@foldkit/ui@0.165.0`, MIT License (c) 2025 Devin Jameson.
 * Source: `packages/ui/src/{group,keyboard,typeahead,internal/optionExtensions}.ts`
 * at tag `@foldkit/ui@0.165.0` in foldkit/foldkit.
 *
 * Why vendored instead of imported: `@foldkit/ui`'s exports map exposes only
 * its `public.js` subpaths, and none of these helpers is re-exported there.
 * They are small, pure, and dependency-free beyond `effect`, so copying them
 * keeps the menu view fork compiling without a deep import that the package
 * boundary forbids. Behavior (Model, Message, update, Commands, Mounts)
 * stays upstream in `@foldkit/ui/menu`; only these view inputs are copied.
 *
 * If `@foldkit/ui` later publishes them (or a `toView` seam that removes the
 * need for the fork), delete this module and import from the package.
 */
import { Array, Function, Match, Option, Predicate, String, pipe } from 'effect'

/** A contiguous segment of items sharing the same group key. */
export type Segment<A> = Readonly<{ key: string; items: ReadonlyArray<A> }>

/** Groups items into contiguous segments by a key function. Adjacent items with the same key are collected into a single segment. */
export const groupContiguous = <A>(
  items: ReadonlyArray<A>,
  toKey: (item: A, index: number) => string,
): ReadonlyArray<Segment<A>> => {
  const tagged = Array.map(items, (item, index) => ({
    key: toKey(item, index),
    item,
  }))

  return Array.chop(tagged, nonEmpty => {
    const key = Array.headNonEmpty(nonEmpty).key
    const [matching, rest] = Array.span(nonEmpty, tagged => tagged.key === key)
    return [{ key, items: Array.map(matching, ({ item }) => item) }, rest]
  })
}

/** Whether a keyboard event key is a single printable character (not a named key like "Enter" or "ArrowDown"). */
export const isPrintableKey = (key: string): boolean => key.length === 1

export const wrapIndex = (index: number, length: number): number =>
  ((index % length) + length) % length

export const findFirstEnabledIndex =
  (itemCount: number, focusedIndex: number, isDisabled: (index: number) => boolean) =>
  (startIndex: number, direction: 1 | -1): number =>
    pipe(
      itemCount,
      Array.makeBy(step => wrapIndex(startIndex + step * direction, itemCount)),
      Array.findFirst(Predicate.not(isDisabled)),
      Option.getOrElse(() => focusedIndex),
    )

export const keyToIndex = (
  nextKey: string,
  previousKey: string,
  itemCount: number,
  focusedIndex: number,
  isDisabled: (index: number) => boolean,
): ((key: string) => number) => {
  const find = findFirstEnabledIndex(itemCount, focusedIndex, isDisabled)

  return (key: string): number =>
    Match.value(key).pipe(
      Match.when(nextKey, () => find(focusedIndex + 1, 1)),
      Match.when(previousKey, () => find(focusedIndex - 1, -1)),
      Match.whenOr('Home', 'PageUp', () => find(0, 1)),
      Match.whenOr('End', 'PageDown', () => find(itemCount - 1, -1)),
      Match.orElse(() => focusedIndex),
    )
}

/** Finds the first enabled item whose search text starts with the query, searching forward from the active item and wrapping around. On a fresh search, starts after the active item; on a refinement, includes the active item. */
export const resolveTypeaheadMatch = <Item>(
  items: ReadonlyArray<Item>,
  query: string,
  maybeActiveItemIndex: Option.Option<number>,
  isDisabled: (index: number) => boolean,
  itemToSearchText: (item: Item, index: number) => string,
  isRefinement: boolean,
): Option.Option<number> => {
  const lowerQuery = String.toLowerCase(query)
  const offset = isRefinement ? 0 : 1
  const startIndex = Option.match(maybeActiveItemIndex, {
    onNone: () => 0,
    onSome: index => index + offset,
  })

  const isEnabledMatch = (index: number): boolean =>
    !isDisabled(index) &&
    pipe(
      items,
      Array.get(index),
      Option.exists(item =>
        pipe(itemToSearchText(item, index), String.toLowerCase, String.startsWith(lowerQuery)),
      ),
    )

  return pipe(
    items,
    Array.length,
    Array.makeBy(step => wrapIndex(startIndex + step, items.length)),
    Array.findFirst(isEnabledMatch),
  )
}

export const whenOption: {
  <A>(value: A): (condition: boolean) => Option.Option<A>
  <A>(condition: boolean, value: A): Option.Option<A>
} = Function.dual(2, <A>(condition: boolean, value: A): Option.Option<A> =>
  Option.liftPredicate(value, () => condition),
)
