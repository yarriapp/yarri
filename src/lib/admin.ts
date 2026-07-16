export const ADMIN_EMAIL = "jtoor779@gmail.com";

export function isAllowedAdminEmail(email?: string | null) {
  return (email ?? "").trim().toLowerCase() === ADMIN_EMAIL.toLowerCase();
}