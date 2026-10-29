/**
 * Records keyed by a name a Block declares (a Region, an appearance axis) and
 * read from a stored node. Read as `record[name]`, `constructor` or `toString`
 * finds `Object.prototype`'s; written as `record[name] = value`, `__proto__`
 * sets the prototype and adds no key.
 */

/** The value `record` holds under `key` itself, never one it inherits. */
export const own = <A>(record: Readonly<Record<string, A>>, key: string): A | undefined =>
  Object.hasOwn(record, key) ? record[key] : undefined

/** Sets `key` on `record` as a key of its own, whatever the name. */
export const put = <A>(record: Record<string, A>, key: string, value: A): void => {
  Object.defineProperty(record, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  })
}
