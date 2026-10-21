/**
 * Compile-time contract of Prose's options: an alignment outside the four is
 * refused. Type-checked, not executed.
 */
import { Prose } from '../src/prose.js'

Prose.style({ align: 'center' })
// @ts-expect-error Not a text-align value.
Prose.style({ align: 'middle' })
