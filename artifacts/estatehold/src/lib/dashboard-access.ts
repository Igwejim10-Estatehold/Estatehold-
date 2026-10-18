export function isAdminMockMode(development: boolean, configuredMode: string | undefined): boolean {
  return development && configuredMode === 'true';
}

export function isMockOwnerPreviewEnabled({
  development,
  adminMockMode,
  storedEmail,
  ownerEmail,
}: {
  development: boolean;
  adminMockMode: boolean;
  storedEmail: string | null | undefined;
  ownerEmail: string;
}): boolean {
  return development
    && adminMockMode
    && storedEmail?.trim().toLowerCase() === ownerEmail.trim().toLowerCase();
}

export function hasAdminDashboardAccess(role: unknown): boolean {
  return role === 'admin' || role === 'executive';
}

export function hasExecutiveDashboardAccess(role: unknown): boolean {
  return role === 'executive';
}
