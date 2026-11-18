import { platformFromUA } from 'foldkit-primitives/media'
import { primitiveExample, stateless } from '../../../gallery/primitiveExample.js'

// Pure: pass a user-agent string and a test pins the answer; the view reads where it runs.
export default primitiveExample({
  title: 'platformFromUA',
  text: '`platformFromUA` names the platform from a user-agent string passed in. A test pins the answer by passing the string; the view calls it with a fixed one.',
  state: stateless,
  view: ({ h }) =>
    h.ul(
      [],
      [
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)',
        'Mozilla/5.0 (Linux; Android 14; Pixel 8)',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      ].map(agent => h.li([], [`${platformFromUA(agent)} from “${agent.slice(0, 28)}…”`])),
    ),
})
