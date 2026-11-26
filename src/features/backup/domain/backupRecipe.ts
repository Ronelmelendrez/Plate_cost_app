import type { recipes } from '@core/db/schema';

type Recipe = typeof recipes.$inferSelect;
type BackupRecipe = Omit<Recipe, 'imageUri'>;

export function omitLocalRecipeImages(rows: Recipe[]): BackupRecipe[] {
  return rows.map(({ imageUri, ...recipe }) => {
    void imageUri;
    return recipe;
  });
}
