/** Shared by `documentHost` and `defineDocumentHost`; not part of either entry's API. */
import { Duration } from 'effect'

/** Refuses a revalidation interval that would ask the session store without pause. */
export const checkRevalidate = (
  revalidate: { readonly every: Duration.Input } | undefined,
  who: string,
): void => {
  if (
    revalidate !== undefined &&
    !Duration.isGreaterThan(Duration.fromInputUnsafe(revalidate.every), Duration.zero)
  )
    throw new Error(`${who}: revalidate.every must be longer than zero`)
}
