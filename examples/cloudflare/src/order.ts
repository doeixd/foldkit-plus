/**
 * Title, then id: the order `AllTodos` asks D1 for.
 *
 * D1 compares TEXT with BINARY over UTF-8, which is code-point order. JS `<`
 * is UTF-16 code units and disagrees once a title holds a character past
 * U+FFFF. The connection only prepends a new row, for membership; this is
 * where that row is drawn, so the refresh does not move it.
 */
import { Option } from 'effect'
import { RemoteData, type Page } from 'foldkit-remote'

/** Code-point order, which is SQLite BINARY on UTF-8. */
const compareText = (left: string, right: string): number => {
  let i = 0
  let j = 0
  while (i < left.length && j < right.length) {
    const a = left.codePointAt(i)
    const b = right.codePointAt(j)
    if (a === undefined || b === undefined) {
      throw new Error('compareText read past the end of a string')
    }
    if (a !== b) return a - b
    const width = a > 0xffff ? 2 : 1
    i += width
    j += width
  }
  if (i === left.length && j === right.length) return 0
  return i === left.length ? -1 : 1
}

export const orderItems = <Row extends { readonly id: string; readonly title: string }>(
  items: ReadonlyArray<Row>,
): ReadonlyArray<Row> =>
  [...items].sort(
    (left, right) => compareText(left.title, right.title) || compareText(left.id, right.id),
  )

const sorted = <Row extends { readonly id: string; readonly title: string }>(
  value: Page<Row>,
): Page<Row> => ({
  ...value,
  items: orderItems(value.items),
})

/** The page a list is showing, in `orderItems` order. States with no rows stay as they are. */
export const orderedPage = <Row extends { readonly id: string; readonly title: string }>(
  page: RemoteData<Page<Row>>,
): RemoteData<Page<Row>> =>
  RemoteData.match(page, {
    Initial: () => page,
    Loading: () => page,
    NotFound: () => page,
    Ready: value => ({ _tag: 'Ready', value: sorted(value) }),
    Refreshing: value => ({ _tag: 'Refreshing', value: sorted(value) }),
    Failed: (error, previous) =>
      Option.match(previous, {
        onNone: () => page,
        onSome: value => ({ _tag: 'Failed', error, previous: sorted(value) }),
      }),
  })
