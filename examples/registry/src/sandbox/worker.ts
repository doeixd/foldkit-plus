/**
 * The sandbox's SharedWorker: one host for every tab of the sandbox, which
 * lives as long as one of them is open.
 */
import { openHost } from './host.js'
import { RegistryHost } from './protocol.js'

RegistryHost.serve(openHost)
