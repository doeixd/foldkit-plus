/**
 * What the order of the application's Messages owes: every pair of transitions
 * whose footprints overlap is declared in the shared registry
 * (`metakit/temporal`), and each is walked in both orders from states
 * generated from the Model. `foldkit-plus laws` prints the report this file
 * leaves; the repository's obligations test imports it.
 */
import * as Pairs from 'metakit/pairs'
import * as Temporal from 'metakit/temporal'
import { todoMachine } from '../src/surface.js'

Pairs.settle(todoMachine, { owner: 'todo-app' })

export const report = Temporal.registry.report()
