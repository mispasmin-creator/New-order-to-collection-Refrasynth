// Shared page-permission helpers, driven by the logged-in user's
// `pagePermissions` field from the Users sheet — either the literal string
// "All", or a comma-separated list of page labels (matching navPages.js's
// `label` values exactly, e.g. "Received Accounts, Make Invoice").

const normalize = (s) => (s || '').trim().toLowerCase();

export function getPermissionList(user) {
  return (user?.pagePermissions || '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
}

export function hasPagePermission(user, pageLabel) {
  if (!user || !pageLabel) return false;
  const perms = getPermissionList(user).map(normalize);
  if (perms.length === 0) return false;
  if (perms.includes('all')) return true;
  return perms.includes(normalize(pageLabel));
}

// First page (in navItems order) the user is allowed to see — used to land
// them somewhere real instead of a hardcoded route they may not have access to.
export function getFirstAllowedPath(user, navItems) {
  const allowed = navItems.find((item) => hasPagePermission(user, item.label));
  return allowed?.path || null;
}
