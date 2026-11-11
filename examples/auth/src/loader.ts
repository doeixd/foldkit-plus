/**
 * The page's entry script: it holds a press or a submission made on the
 * server's markup until `client.ts` has taken the page over, then answers it
 * there. Typing needs no loader (`KeepTyped` reads the field itself), but a
 * press does: before any script runs nothing hears it.
 */
import { load } from 'foldkit-ssr/loader'

load({ runtime: () => import('./client.js') })
