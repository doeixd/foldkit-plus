/** Whether two id lists hold the same ids in the same order. */
export const sameIds = (a: ReadonlyArray<string>, b: ReadonlyArray<string>): boolean =>
  a.length === b.length && a.every((id, index) => id === b[index])

/**
 * Memoizes `derive` by the identity of its input. Every slot a Behavior writes
 * in one render reads the same input, so a derivation each item needs runs
 * once per render rather than once per item.
 */
export const perInput = <Input extends object, Value>(
  derive: (input: Input) => Value,
): ((input: Input) => Value) => {
  const cache = new WeakMap<Input, Value>()
  return input => {
    if (cache.has(input)) return cache.get(input)!
    const value = derive(input)
    cache.set(input, value)
    return value
  }
}

/** Clears a typeahead query; blur and selection usually find it empty already. */
export const clearQuery = <Model extends { readonly query: string }>(
  model: Model,
): { readonly model: Model } =>
  model.query === '' ? { model } : { model: { ...model, query: '' } }
