import Colors from './Colors';

/** Top color of the app hero gradient, also used for the safe-area strip above it. */
export const HERO_TOP = '#268F70';
/** Color the hero gradient ends on; list headers fade from it into the page background. */
export const HERO_BOTTOM = '#17564A';
export const HERO_GRADIENT = [HERO_TOP, Colors.light.tint, HERO_BOTTOM] as const;
