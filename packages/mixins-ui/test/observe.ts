/**
 * A MutationObserver callback runs once for a batch of records, after the
 * element may have moved on, so reading the element there misses a state it
 * passed through. These replay the records instead: observe with
 * `attributeOldValue: true`.
 */

/**
 * What record `at`'s attribute held once it was made: the old value the next
 * record of the same attribute and element saw, or, for the last, the
 * element's own.
 */
export const valueAfter = (records: ReadonlyArray<MutationRecord>, at: number): string | null => {
  const { target, attributeName } = records[at]!
  const next = records
    .slice(at + 1)
    .find(later => later.target === target && later.attributeName === attributeName)
  return next === undefined ? (target as Element).getAttribute(attributeName!) : next.oldValue
}

/**
 * Each set of `marks` (`data-*` attributes, named without the prefix) that
 * `element` held while `run` ran and until `done` held, joined by spaces.
 */
export const marksThrough = async (
  element: Element,
  marks: ReadonlyArray<string>,
  run: () => Promise<unknown>,
  done: () => Promise<unknown>,
): Promise<ReadonlyArray<string>> => {
  const names = marks.map(mark => `data-${mark}`)
  const held = new Set(names.filter(name => element.hasAttribute(name)))
  const states: Array<string> = []
  const observer = new MutationObserver(records =>
    records.forEach((record, at) => {
      const name = record.attributeName ?? ''
      if (!names.includes(name)) return
      if (valueAfter(records, at) === null) held.delete(name)
      else held.add(name)
      states.push(marks.filter((_, index) => held.has(names[index]!)).join(' '))
    }),
  )
  observer.observe(element, { attributes: true, attributeOldValue: true })
  try {
    await run()
    await done()
  } finally {
    observer.disconnect()
  }
  return states
}
