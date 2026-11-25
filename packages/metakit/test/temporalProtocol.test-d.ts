import * as Temporal from '../src/temporal.js'

const Proto = Temporal.protocol(['expire-vs-restore'] as const)

// Positive: declared name compiles.
export const valid = Proto.obligation({
  name: 'expire-vs-restore',
  over: ['ExpireUndo', 'Restore'] as const,
  shows: 'valid protocol obligation',
})

// Negative: unknown name fails to compile.
export const invalid = Proto.obligation({
  // @ts-expect-error Type '"unknown-name"' is not assignable to type '"expire-vs-restore"'.
  name: 'unknown-name',
  over: ['ExpireUndo'] as const,
  shows: 'unknown',
})
