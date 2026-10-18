export type PropertyPhotoCleanupResult = "removed" | "already-referenced" | "failed";

export async function cleanupUnreferencedPropertyPhoto(
  isReferenced: () => Promise<boolean>,
  remove: () => Promise<void>,
): Promise<PropertyPhotoCleanupResult> {
  try {
    if (await isReferenced()) return "already-referenced";
    await remove();
    return "removed";
  } catch {
    return "failed";
  }
}
