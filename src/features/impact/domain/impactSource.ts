export type PriceImpactSource =
  | { type: 'ingredient'; id: string }
  | { type: 'recipe'; id: string }
  | { type: 'packaging'; id: string };

export function getImpactSource(
  type: string | undefined,
  id: string | undefined,
): PriceImpactSource | undefined {
  if (!id) {
    return undefined;
  }
  if (type === 'ingredient' || type === 'recipe' || type === 'packaging') {
    return { type, id };
  }
  return undefined;
}
