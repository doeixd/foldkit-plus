/**
 * What evaluating a body needs of a law: its variants and its kind. Apart from
 * `Law.describe` so a client that never describes one keeps no JSON Schema.
 */
import { Data } from 'effect'
import type { Law } from './law.js'

export const Laws = Data.taggedEnum<Law>()

/** The law's kind as a name: `Associative` is `associative`. */
export const lawKind = (law: Law): string => law._tag.charAt(0).toLowerCase() + law._tag.slice(1)
