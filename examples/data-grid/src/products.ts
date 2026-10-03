/**
 * A product registry of the size the grid is built for: 100,000 rows, made
 * the same every time so a test can name one.
 */
import { Schema } from 'effect'

export const Product = Schema.Struct({
  id: Schema.String,
  upc: Schema.String,
  description: Schema.String,
  line: Schema.String,
  status: Schema.Literals(['Active', 'Discontinued', 'Pending']),
  price: Schema.Number,
})
export type Product = typeof Product.Type

const lines = ['Hardware', 'Garden', 'Plumbing', 'Electrical', 'Paint', 'Tools'] as const
const nouns = ['Anchor', 'Bolt', 'Cable', 'Dowel', 'Elbow', 'Fuse', 'Gasket', 'Hinge'] as const
const sizes = ['small', 'medium', 'large', 'heavy-duty'] as const
const statuses = ['Active', 'Active', 'Active', 'Discontinued', 'Pending'] as const

/** A UPC-A: eleven digits and the check digit that makes them valid. */
const upcOf = (index: number): string => {
  const digits = String(10_000_000_000 + index * 7919).slice(-11)
  const sum = [...digits].reduce(
    (total, digit, position) => total + Number(digit) * (position % 2 === 0 ? 3 : 1),
    0,
  )
  return `${digits}${(10 - (sum % 10)) % 10}`
}

export const productAt = (index: number): Product => ({
  id: `p${index}`,
  upc: upcOf(index),
  description: `${nouns[index % nouns.length]!}, ${sizes[index % sizes.length]!} #${index}`,
  line: lines[index % lines.length]!,
  status: statuses[index % statuses.length]!,
  price: Math.round(((index * 37) % 10_000) + 99) / 100,
})

export const products = (count: number): ReadonlyArray<Product> =>
  Array.from({ length: count }, (_, index) => productAt(index))
