import { describe, expect, it } from 'vitest';

import { getImpactSource } from './impactSource';

describe('getImpactSource', () => {
  it.each(['ingredient', 'recipe', 'packaging'] as const)(
    'accepts %s impact sources',
    (type) => {
      expect(getImpactSource(type, 'source-id')).toEqual({ type, id: 'source-id' });
    },
  );

  it('rejects missing ids and unsupported source types', () => {
    expect(getImpactSource('packaging', undefined)).toBeUndefined();
    expect(getImpactSource('unknown', 'source-id')).toBeUndefined();
  });
});
