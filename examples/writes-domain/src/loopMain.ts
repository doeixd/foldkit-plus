import { runLoop } from './loop.js'

for (const line of await runLoop()) {
  console.log(line)
}
