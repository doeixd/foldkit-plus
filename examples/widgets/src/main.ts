import { runDemo as runAccordionDemo } from './accordion/view.js'
import { runDemo as runCheckboxGroupDemo } from './checkbox-group/view.js'
import { runDemo as runCommandDemo } from './command/view.js'
import { runDemo as runMeterDemo } from './meter/view.js'
import { runDemo as runNumberFieldDemo } from './number-field/view.js'
import { runDemo as runToggleDemo } from './toggle/view.js'
import { runDemo as runToggleGroupDemo } from './toggle-group/view.js'
import { runDemo as runToolbarDemo } from './toolbar/demo.js'

for (const line of runToolbarDemo()) {
  console.log(line)
}
for (const line of runToggleDemo()) {
  console.log(line)
}
for (const line of runToggleGroupDemo()) {
  console.log(line)
}
for (const line of runAccordionDemo()) {
  console.log(line)
}
for (const line of runNumberFieldDemo()) {
  console.log(line)
}
for (const line of runCheckboxGroupDemo()) {
  console.log(line)
}
for (const line of runMeterDemo()) {
  console.log(line)
}
for (const line of runCommandDemo()) {
  console.log(line)
}
