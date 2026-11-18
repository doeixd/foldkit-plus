import { Effect } from 'effect'
import { Calendar } from 'foldkit'

/** The reader's day, read once as the module loads: an application reads it in a Command or from flags. */
export const today = Effect.runSync(Calendar.today.local)
