import { parse } from 'foldkit-media/icons'
import { Icons } from 'foldkit-mixins-ui'

const drawn = parse('<svg viewBox="0 0 1 1"><path d="M0 0"/></svg>', 'drawn')

// @ts-expect-error a pack must hold every icon the components draw: this one has no `lock`
Icons.tokens({
  search: drawn,
  eye: drawn,
  'eye-off': drawn,
  pipette: drawn,
  'rotate-ccw': drawn,
  'rotate-cw': drawn,
  success: drawn,
  warning: drawn,
  error: drawn,
  info: drawn,
})
