import { runLanguage } from './language.js'

for (const line of await runLanguage()) {
  console.log(line)
}
