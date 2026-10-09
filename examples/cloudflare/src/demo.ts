/**
 * `pnpm demo`: the whole Cloudflare loop against local miniflare, printed.
 * A Sync exchange commits through the Durable Object, `settle` applies it
 * to D1 where Remote reads it back, and a live stream carries the next
 * commit to a Remote reader. Anything unexpected throws.
 */
import { Effect, Fiber } from 'effect'
import {
  exchange,
  firstChange,
  pause,
  queryTodos,
  readTodo,
  remoteClient,
  syncOp,
  upgradeSync,
  type ClientSocket,
} from './client.js'
import { startStack } from './stack.js'

const main = async (): Promise<void> => {
  const stack = await startStack()
  const sockets: Array<ClientSocket> = []
  try {
    const remote = remoteClient(`${stack.origin}/remote`, 'ada', fetch)

    const empty = await queryTodos(remote, { first: 10 })
    console.log('todos at first:', JSON.stringify(empty))
    if (empty.length !== 0) throw new Error('expected an empty list')

    const writer = await upgradeSync(stack.mf, 'ada')
    if (writer.status !== 101 || writer.socket === null) throw new Error('expected an upgrade')
    sockets.push(writer.socket)
    const sent = await exchange(writer.socket, {
      id: '1',
      cursor: 0,
      pending: [syncOp('demo', 1, { _tag: 'CreatedTodo', id: 't1', title: 'Milk' })],
    })
    const acknowledged = (sent.result as { acknowledged: ReadonlyArray<string> }).acknowledged
    console.log('acknowledged:', JSON.stringify(acknowledged))
    if (acknowledged.length !== 1) throw new Error('expected one acknowledgement')

    const rows = await stack.db.prepare('SELECT id, title, done FROM todos').all()
    console.log('D1 todos after settle:', JSON.stringify(rows.results))
    if (rows.results?.length !== 1) throw new Error('expected settle to write the row')

    const read = await readTodo(remote, 't1', ['id', 'title', 'done'])
    console.log('remote read:', JSON.stringify(read.entities))
    if (read.entities.length !== 1) throw new Error('expected Remote to read the row')

    const live = Effect.runFork(
      firstChange(remote, [{ entity: 'Todo', id: 't1', fields: ['done'] }]),
    )
    await pause(300)
    await exchange(writer.socket, {
      id: '2',
      cursor: 1,
      pending: [syncOp('demo', 2, { _tag: 'ToggledTodo', id: 't1' })],
    })
    const [change] = await Effect.runPromise(Fiber.join(live))
    console.log('live change:', JSON.stringify(change))
    if (change === undefined || change._tag !== 'EntityPatched') throw new Error('expected a patch')

    const flipped = await readTodo(remote, 't1', ['done'])
    console.log('remote read after toggle:', JSON.stringify(flipped.entities))
    console.log('done: the worker, the object, and D1 agree')
  } finally {
    for (const socket of sockets) socket.close()
    await stack.stop()
  }
}

void main()
