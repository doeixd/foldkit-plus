/**
 * The one step every multiple choice takes, Accordion's, Segmented's and
 * CheckboxGroup's: `value` turned on if it was off, off if it was on, the
 * rest left in their order.
 */
export const flipped = <Value>(values: ReadonlyArray<Value>, value: Value): ReadonlyArray<Value> =>
  values.includes(value) ? values.filter(each => each !== value) : [...values, value]
