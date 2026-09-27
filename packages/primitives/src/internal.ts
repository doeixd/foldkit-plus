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

/**
 * `next`, or `model` itself when both hold the same fields with the same
 * values. Foldkit renders only when the root Model changes identity, so an
 * equal copy renders the whole page for nothing.
 */
export const unlessSame = <Model extends object>(model: Model, next: Model): Model => {
  const keys = Object.keys(next) as Array<keyof Model>
  if (keys.length !== Object.keys(model).length) return next
  for (const key of keys) {
    if (!Object.hasOwn(model, key) || !Object.is(next[key], model[key])) return next
  }
  return model
}
