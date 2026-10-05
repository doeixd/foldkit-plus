/** The sandbox's SharedWorker: one journal for every tab of the sandbox. */
import { openHost } from './host.js'
import { TodoHost } from './opening.js'

TodoHost.serve(openHost)
