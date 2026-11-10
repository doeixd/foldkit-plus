/** The runtime's chunk: the application, taken over from the served page. */
import { SSR } from 'foldkit-ssr/client'
import { config, plan } from '../../checkedFixture.js'

SSR.hydrate(config, plan('idle'), { buildId: 'loader' })
