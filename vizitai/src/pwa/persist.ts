export async function requestPersistence(
  storage: Pick<StorageManager, 'persist'> | undefined = typeof navigator === 'undefined' ? undefined : navigator.storage,
): Promise<boolean> {
  try {
    return (await storage?.persist?.()) === true;
  } catch {
    return false;
  }
}
