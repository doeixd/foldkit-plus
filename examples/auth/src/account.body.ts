/**
 * The account page's bodies, in a chunk of their own: `account.ts` declares
 * the page and names this module only behind its `import()`, so a reader who
 * never visits or points at `/account` downloads none of it.
 */
import * as Submodel from 'foldkit/submodel'
import type { Bundle } from 'foldkit-bundle'
import { Button, Card } from 'foldkit-mixins-ui'
import { Resume } from 'foldkit-ssr/client'
import { AccountMessage, type AccountModel } from './account.js'
import { CardStyle, QuietButtonStyle } from './style.js'

export const body: Bundle.Body<AccountModel, AccountMessage, void, never, never, void> = {
  update: (model, message) =>
    AccountMessage.match(message, {
      Arrived: () => ({ model }),
      ToggledDigest: () => ({ model: { digest: !model.digest } }),
    }),
  view: Submodel.defineView<AccountModel, AccountMessage>((model, h) => {
    // The server names the press, so one made before the runtime starts is answered.
    const rh = Resume.builder(h)
    return Card.view(
      {
        title: 'Account',
        content: rh.section(
          [rh.Id('account')],
          [
            rh.p([rh.Id('digest')], [model.digest ? 'Weekly digest: on' : 'Weekly digest: off']),
            Button.view(
              {
                label: model.digest ? 'Stop the digest' : 'Send me a digest',
                onClick: AccountMessage.ToggledDigest(),
                style: QuietButtonStyle,
              },
              rh,
            ),
          ],
        ),
        style: CardStyle,
      },
      rh,
    )
  }),
}
