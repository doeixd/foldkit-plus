export const nonNegativeInteger = (name: string, value: number): number => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`foldkit-media: ${name} must be a non-negative integer`)
  }
  return value
}
