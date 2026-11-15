import { compose, inline, media } from '../../../src/styleValue.js'

console.log(compose(inline({ color: 'red' }), media('(min-width: 40rem)', { margin: '0' })))
