/**
 * Where the demo keeps each visitor's sandbox: one IndexedDB record holding
 * the database. The host (in a SharedWorker, or in the page) writes it.
 * IndexedDB, not `localStorage`, because a worker has only the one.
 */
import { Option } from 'effect'

const NAME = 'foldkit-chirp-demo'
const STORE = 'sandbox'
const KEY = 'sandbox'

/**
 * The seed's edition. Raise it when the seed or the tables change: a sandbox
 * kept from an older edition is then let go, and everyone starts from the new one.
 */
const EDITION = 2

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
export const read = async (): Promise<Option.Option<Uint8Array>> => {
  const database = await opened()
  const kept: unknown = await settled(database.transaction(STORE).objectStore(STORE).get(KEY))
  database.close()
  return typeof kept === 'object' &&
    kept !== null &&
    'edition' in kept &&
    kept.edition === EDITION &&
    'bytes' in kept &&
    kept.bytes instanceof Uint8Array
    ? Option.some(kept.bytes)
    : Option.none()
}

/** Keeps the sandbox, replacing what was kept. */
export const write = async (bytes: Uint8Array): Promise<void> => {
  const database = await opened()
  const transaction = database.transaction(STORE, 'readwrite')
  transaction.objectStore(STORE).put({ edition: EDITION, bytes }, KEY)
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
  database.close()
}
