/**
 * Where the published demo keeps each visitor's sandbox, and whether they have
 * changed it. The site's generated pages show the seed, so the browser takes
 * one over as it is only while the sandbox still holds the seed; this module
 * is what `client.ts` can ask without loading the sandbox itself.
 */
const PREFIX = 'foldkit-cms-demo'

/**
 * The sandbox's key, named by the seed's edition. Raise it when the seed
 * changes: a sandbox kept from an older edition is then let go, and everyone
 * starts from the new one rather than from what they kept.
 */
export const SANDBOX_KEY = `${PREFIX}@4`

const EDITED_KEY = `${SANDBOX_KEY}:edited`

/** Whether a stored key belongs to a sandbox of an older edition. */
export const isStale = (key: string): boolean =>
  key.startsWith(PREFIX) && !key.startsWith(SANDBOX_KEY)

/** Records that the sandbox no longer holds only the seed. */
export const markEdited = (): void => {
  try {
    localStorage.setItem(EDITED_KEY, '1')
  } catch {
    // Storage refused: nothing was kept, so the next page starts from the seed.
  }
}

/** Records that the sandbox holds the seed again, as after `?reset`. */
export const clearEdited = (): void => {
  try {
    localStorage.removeItem(EDITED_KEY)
  } catch {
    // Storage refused: there is no mark to clear.
  }
}

/** Whether the sandbox may differ from the seed; when storage cannot say, it may. */
export const edited = (): boolean => {
  try {
    return localStorage.getItem(EDITED_KEY) !== null
  } catch {
    return true
  }
}
