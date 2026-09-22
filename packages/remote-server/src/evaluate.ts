/**
 * The reference interpreter moved to `foldkit-entity`, which owns the IR it
 * interprets: it is the reference semantics of a query body rather than
 * anything this package does, and a client judging rows it already holds needs
 * it without depending on a server package.
 *
 * Re-exported here because this is where it was, and importing it from either
 * place means the same thing.
 */
export { QueryEvaluateError, assertSupported, evaluate, supported, type Row } from 'foldkit-entity'
