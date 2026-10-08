import { islands } from './widgets.js'

for (const island of islands) {
  for (const line of island.runDemo()) {
    console.log(line)
  }
}
