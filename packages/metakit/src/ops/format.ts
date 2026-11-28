/** Format an arbitrary value for a refusal, even when its conversion hooks throw. */
export const formatValue = (value: unknown): string => {
  try {
    const json = JSON.stringify(value)
    if (json !== undefined) return json
  } catch {
    // BigInts and cycles have no JSON representation.
  }
  try {
    return String(value) || '<unprintable value>'
  } catch {
    return '<unprintable value>'
  }
}
