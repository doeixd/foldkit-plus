import { installDom } from './dom.js'

installDom()
const { runDemo } = await import('./demo.js')

for (const line of await runDemo()) {
  console.log(line)
}
