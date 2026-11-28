/**
 * What the order of the application's Messages owes: every pair of transitions
 * whose footprints overlap is declared in the shared registry
 * (`@doeixd/metakit/temporal`), and each is walked in both orders from states
 * generated from the Model. `foldkit-plus laws` prints the report this file
 * leaves; the repository's obligations test imports it.
 */
import * as Pairs from '@doeixd/metakit/pairs'
import * as Temporal from '@doeixd/metakit/temporal'
import { todoMachine } from '../src/surface.js'

Pairs.settle(todoMachine, { owner: 'todo-app' })

export const report = Temporal.registry.report()
