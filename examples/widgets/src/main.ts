import { lazyIslands } from './lazy.js'
import { islands } from './widgets.js'

for (const island of islands) {
  for (const line of island.runDemo()) {
    console.log(line)
  }
}
for (const island of lazyIslands) {
  for (const line of (await island.load()).runDemo()) {
    console.log(line)
  }
}
