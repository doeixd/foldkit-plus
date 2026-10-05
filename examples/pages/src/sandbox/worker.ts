/** The sandbox's SharedWorker: one journal for every tab of the sandbox. */
import { openHost } from './host.js'
import { PagesHost } from './opening.js'

PagesHost.serve(openHost)
