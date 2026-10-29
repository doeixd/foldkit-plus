/**
 * Records keyed by names an application declares: a slot, a variant axis, a
 * token group, a knob. Read as `record[key]`, `constructor` or `toString`
 * finds `Object.prototype`'s; a table this package writes is made with
 * `Object.create(null)`, so `__proto__` is a key like any other.
 */

/** The value `record` holds under `key` itself, never one it inherits. */
export const own = <A>(
  record: Readonly<Record<string, A>> | undefined,
  key: string,
): A | undefined => (record !== undefined && Object.hasOwn(record, key) ? record[key] : undefined)
