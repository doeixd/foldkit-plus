/**
 * Where the published demo keeps each visitor's sandbox: one IndexedDB record
 * holding the database and whether it still holds only the seed. The host
 * (in a SharedWorker, or in the page) writes it, and the page reads the mark
 * before it takes a rendered page over, since the site's generated pages show
 * the seed. IndexedDB, not `localStorage`, because a worker has only the one.
 */
import { Option } from 'effect'

const NAME = 'foldkit-cms-demo'
const STORE = 'sandbox'
const KEY = 'sandbox'

/**
 * The seed's edition. Raise it when the seed changes: a sandbox kept from an
 * older edition is then let go, and everyone starts from the new one.
 */
const EDITION = 5

export interface Kept {
  readonly bytes: Uint8Array
  /** Whether it may differ from the seed. */
  readonly edited: boolean
}

const settled = <A>(request: IDBRequest<A>): Promise<A> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

const opened = (): Promise<IDBDatabase> => {
  const request = indexedDB.open(NAME, 1)
  request.onupgradeneeded = () => request.result.createObjectStore(STORE)
  return settled(request)
}

/** The sandbox last kept, of this edition; none where there is none. Fails where storage is refused. */
export const read = async (): Promise<Option.Option<Kept>> => {
  const database = await opened()
  try {
    const record: unknown = await settled(database.transaction(STORE).objectStore(STORE).get(KEY))
    return isKept(record) ? Option.some(record) : Option.none()
  } finally {
    database.close()
  }
}

const isKept = (record: unknown): record is Kept & { readonly edition: number } =>
  typeof record === 'object' &&
  record !== null &&
  'edition' in record &&
  record.edition === EDITION &&
  'bytes' in record &&
  record.bytes instanceof Uint8Array &&
  'edited' in record &&
  typeof record.edited === 'boolean'

/** Keeps the sandbox, over whatever was kept; resolves once it is written. */
export const write = async (kept: Kept): Promise<void> => {
  const database = await opened()
  try {
    const transaction = database.transaction(STORE, 'readwrite')
    transaction.objectStore(STORE).put({ edition: EDITION, ...kept }, KEY)
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  } finally {
    database.close()
  }
}

/** Whether the sandbox may differ from the seed; when storage cannot say, it may. */
export const edited = (): Promise<boolean> =>
  read().then(
    kept => Option.match(kept, { onNone: () => false, onSome: ({ edited }) => edited }),
    () => true,
  )
