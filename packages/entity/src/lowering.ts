/**
 * The translation of expressions to metakit nodes, for the readers that run
 * it outside this package (`foldkit-remote-drizzle` writes SQL from it).
 * Its own entry, so a page that builds expressions does not carry it.
 */
export { lower, ASKER, type EntityNode, type Lowered, type RelatedSlot } from './lower.js'
export { envOf, type EnvSource } from './lowerEnv.js'
export { callOperator, foreignOf } from './lowerOperator.js'
