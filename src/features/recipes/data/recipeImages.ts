import { Directory, File as ExpoFile, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

function getRecipeImagesDirectory() {
  return new Directory(Paths.document, 'recipe-images');
}

function readBlobAsDataUri(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('The selected recipe photo could not be read.'));
      }
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error('The selected recipe photo could not be read.'));
    };
    reader.readAsDataURL(blob);
  });
}

export async function persistRecipeImage(uri: string, webFile?: Blob | null) {
  if (Platform.OS === 'web') {
    if (!webFile) {
      throw new Error('The selected recipe photo is unavailable.');
    }
    return readBlobAsDataUri(webFile);
  }

  const source = new ExpoFile(uri);
  const pathname = uri.split(/[?#]/, 1)[0] ?? uri;
  const extension = pathname.match(/\.([a-z\d]{1,5})$/i)?.[1]?.toLowerCase() ?? 'jpg';
  const filename = `recipe-${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
  const directory = getRecipeImagesDirectory();
  const destination = new ExpoFile(directory, filename);

  directory.create({ idempotent: true, intermediates: true });
  await source.copy(destination);
  return destination.uri;
}

export async function removeStoredRecipeImage(uri: string) {
  if (Platform.OS === 'web' || uri.startsWith('data:')) {
    return;
  }

  const file = new ExpoFile(uri);
  if (file.parentDirectory.uri === getRecipeImagesDirectory().uri && file.exists) {
    file.delete();
  }
}
