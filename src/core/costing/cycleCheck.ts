export interface RecipeEdge {
  recipeId: string;
  childRecipeId: string;
}

export function detectCycle(
  recipeId: string,
  candidateChildId: string,
  edges: RecipeEdge[],
) {
  if (recipeId === candidateChildId) {
    return true;
  }

  const childrenByRecipe = new Map<string, string[]>();
  for (const edge of edges) {
    const children = childrenByRecipe.get(edge.recipeId) ?? [];
    children.push(edge.childRecipeId);
    childrenByRecipe.set(edge.recipeId, children);
  }

  const visited = new Set<string>();
  const pending = [candidateChildId];
  while (pending.length > 0) {
    const currentRecipeId = pending.pop();
    if (!currentRecipeId || visited.has(currentRecipeId)) {
      continue;
    }
    if (currentRecipeId === recipeId) {
      return true;
    }
    visited.add(currentRecipeId);
    pending.push(...(childrenByRecipe.get(currentRecipeId) ?? []));
  }

  return false;
}
