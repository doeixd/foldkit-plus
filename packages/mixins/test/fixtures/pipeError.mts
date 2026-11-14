/**
 * A pipe that fails `conform` after several steps, compiled by
 * `pipeError.test.ts` to read the error TypeScript gives. Outside the
 * project's `include`, so `typecheck` does not see the error on purpose.
 */
import { A11y, Behavior, SlotView } from '../../src/index.js'
import { Listbox, Named, Nav, bare } from '../a11y.fixture.js'

// Nav and Named are attached; nothing supplies the option's activation or `aria-selected`.
export const Refused = bare.pipe(
  Behavior.attach(Nav),
  SlotView.attach(Named),
  A11y.conform(Listbox),
)

// The same supplies, from a list of Behaviors.
export const RefusedFromList = bare.pipe(
  Behavior.attachAll([Nav]),
  SlotView.attach(Named),
  A11y.conform(Listbox),
)
