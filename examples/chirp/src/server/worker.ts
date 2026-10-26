/**
 * The sandbox's SharedWorker: one server for every tab of the demo, so two
 * tabs write to one database rather than each to its own.
 */
import { openHost } from './host.js'
import { ChirpHost } from './opening.js'

ChirpHost.serve(openHost)
