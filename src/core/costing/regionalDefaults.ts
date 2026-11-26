export interface RegionalMeasurementDefaults {
  cupMl: string;
  tablespoonMl: string;
}

export function getRegionalMeasurementDefaults(
  regionCode: string | null | undefined,
  unitSystem: 'metric' | 'us',
): RegionalMeasurementDefaults {
  switch (regionCode?.toUpperCase()) {
    case 'US':
      return { cupMl: '240', tablespoonMl: '14.7868' };
    case 'GB':
      return { cupMl: '284', tablespoonMl: '15' };
    case 'AU':
      return { cupMl: '250', tablespoonMl: '20' };
    default:
      return { cupMl: unitSystem === 'us' ? '240' : '250', tablespoonMl: '15' };
  }
}
