/**
 * A numeric range as an array: `range(1, 4)` is `[1, 2, 3]`, inclusive of
 * the start and exclusive of the end, like `Array.from` length math. The
 * pagination companion: `range(1, (pageCount(model) ?? 0) + 1)` is the page
 * list. A zero or non-finite step would loop forever, so it throws, naming
 * the caller — like History's capacity check.
 */
export const range = (start: number, end: number, step = 1): ReadonlyArray<number> => {
  if (!Number.isFinite(step) || step === 0) {
    throw new Error(`range: step must be a non-zero finite number, got ${step}`)
  }
  const values: Array<number> = []
  if (step > 0) {
    for (let value = start; value < end; value += step) {
      values.push(value)
    }
  } else {
    for (let value = start; value > end; value += step) {
      values.push(value)
    }
  }
  return values
}
