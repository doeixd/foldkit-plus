/** The page's entry: the loader alone, which imports the runtime when the plan says. */
import { load } from 'foldkit-ssr/loader'

load({ runtime: () => import('./entry.js') })
