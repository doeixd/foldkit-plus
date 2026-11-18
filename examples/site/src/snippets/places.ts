/**
 * The options the Cascade select's examples choose among: a city through its
 * country and region. The application's own data, which `Bundles.CascadeSelect`
 * and `CascadeSelect.view` are both given.
 */
import type { CascadeSelect } from 'foldkit-mixins-ui'

export const Places: CascadeSelect.Config = {
  nodes: [
    {
      id: 'ca',
      label: 'Canada',
      children: [
        {
          id: 'on',
          label: 'Ontario',
          children: [
            { id: 'tor', label: 'Toronto' },
            { id: 'ott', label: 'Ottawa' },
          ],
        },
        { id: 'qc', label: 'Quebec', children: [{ id: 'mtl', label: 'Montreal' }] },
      ],
    },
    {
      id: 'jp',
      label: 'Japan',
      children: [
        { id: 'kanto', label: 'Kantō', children: [{ id: 'tyo', label: 'Tokyo' }] },
        { id: 'kansai', label: 'Kansai', children: [{ id: 'osa', label: 'Osaka' }] },
      ],
    },
    { id: 'sg', label: 'Singapore' },
  ],
}
