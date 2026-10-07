import { runDemo as runToggleDemo } from './toggle/view.js'
import { runDemo as runToolbarDemo } from './toolbar/demo.js'

for (const line of runToolbarDemo()) {
  console.log(line)
}
for (const line of runToggleDemo()) {
  console.log(line)
}
