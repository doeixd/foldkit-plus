/**
 * Compile-time expectations. Type-checked, not executed: every
 * `@ts-expect-error` below must stay an error for the contract to hold.
 */
import type { Response, Task } from 'foldkit-agent-a2a'

// Every success this adapter answers carries a task.
declare const response: Response
export const task: Task | undefined = 'result' in response ? response.result : undefined

// @ts-expect-error a success result is a task, not an arbitrary value.
export const untasked: Response = { jsonrpc: '2.0', id: 1, result: 'done' }
