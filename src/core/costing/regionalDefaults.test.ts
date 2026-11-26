import { describe, expect, it } from 'vitest';

import { getRegionalMeasurementDefaults } from './regionalDefaults';

describe('regional measurement defaults', () => {
  it('uses country-specific cup and tablespoon sizes where they differ', () => {
    expect(getRegionalMeasurementDefaults('US', 'us')).toEqual({
      cupMl: '240',
      tablespoonMl: '14.7868',
    });
    expect(getRegionalMeasurementDefaults('GB', 'us')).toEqual({
      cupMl: '284',
      tablespoonMl: '15',
    });
    expect(getRegionalMeasurementDefaults('AU', 'metric')).toEqual({
      cupMl: '250',
      tablespoonMl: '20',
    });
  });

  it('falls back to the selected unit system when the region is unknown', () => {
    expect(getRegionalMeasurementDefaults(undefined, 'us')).toEqual({
      cupMl: '240',
      tablespoonMl: '15',
    });
  });
});
