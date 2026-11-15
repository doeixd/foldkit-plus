import { check } from './check.js'
import { write } from './write.js'

/**
 * A declared write lowered into one Domain aggregate: `check` says what keeps
 * it out of one, and `write` derives the command, its Rejections, `decide`,
 * `evolve`, the reply, the by-id View and the adapter's two bindings.
 */
export const Lower = { check, write }

export { LoweringFinding } from './check.js'
export type {
  CommandInputOf,
  LowerConfig,
  LowerableMutation,
  Lowered,
  LoweredCommand,
  LoweredState,
  RejectionFor,
  RejectionsOf,
  RowOf,
} from './write.js'
