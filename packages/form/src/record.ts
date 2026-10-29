/**
 * The value `record` holds under `key` itself. A form's keys are the
 * application's field names, and `record[key]` for a key named `constructor`
 * or `toString` finds `Object.prototype`'s member where none was given.
 */
export const own = <A>(record: Readonly<Record<string, A>>, key: string): A | undefined =>
  Object.hasOwn(record, key) ? record[key] : undefined
