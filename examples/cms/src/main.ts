import { runDemo } from './demo.js'
import { runPageDemo } from './pageDemo.js'

for (const line of await runDemo()) {
  console.log(line)
}
console.log('')
console.log('— and a page, built with the page Builder —')
for (const line of await runPageDemo()) {
  console.log(line)
}
