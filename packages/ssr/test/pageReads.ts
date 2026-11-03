/** A read a page render makes, as the tests of what may be shared note it. */
import { Effect, Option } from 'effect'
import { PageReads, type CachedRead } from 'foldkit-surface'

/** `read`, noted in the render's `PageReads` as `pageReader` notes one. */
export const reads = (read: CachedRead) =>
  Effect.flatMap(Effect.service(PageReads), noted =>
    Effect.sync(() => Option.map(noted, note => note(read))),
  )
