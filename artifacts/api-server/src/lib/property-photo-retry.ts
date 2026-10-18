export function canRetryPropertyPhoto(moderationStatus: unknown, hasPhoto: boolean): boolean {
  return moderationStatus === "rejected" || (moderationStatus === "pending" && !hasPhoto);
}
