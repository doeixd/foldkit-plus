/**
 * Whether two values the server sent are the same data: equal primitives, or
 * arrays and plain objects whose entries are. Anything else is compared by
 * identity.
 */
export const sameData = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true
  if (typeof left !== 'object' || typeof right !== 'object' || left === null || right === null) {
    return false
  }
  if (Array.isArray(left)) {
    return (
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => sameData(item, right[index]))
    )
  }
  if (!isPlain(left) || !isPlain(right)) return false
  const keys = Object.keys(left)
  return (
    keys.length === Object.keys(right).length &&
    keys.every(
      key =>
        Object.hasOwn(right, key) &&
        sameData((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]),
    )
  )
}

const isPlain = (value: object): boolean => {
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}
