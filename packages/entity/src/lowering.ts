/**
 * What the readers outside this package need to read an expression (in
 * memory, or as SQL in `foldkit-remote-drizzle`): what it reads past its own
 * nodes, the environment built from held rows, and the implementations of the
 * foreign operations it calls. Its own entry, so a page that builds
 * expressions does not carry it.
 */
export { readingOf, foreignOf, type Reading, type RelatedSlot } from './reading.js'
export { envOf, type EnvSource } from './environment.js'
export { ASKER } from './expr/operand.js'
export { callOperator } from './expr/primitive.js'
