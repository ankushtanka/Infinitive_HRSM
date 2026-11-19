export type CanonicalRole = 'SUPER_ADMIN' | 'ADMIN' | 'HR' | 'MANAGER' | 'EMPLOYEE';

/** True when the stored role is Intern (e.g. users.role / employees.role = 'INTERN'). */
export function isInternRole(role?: string): boolean {
  if (!role) return false;
  const clean = role.trim().toUpperCase().replace(/[\s_\-\/]+/g, '');
  return clean === 'INTERN' || clean === 'INTERNSHIP';
}

/**
 * Permission level for a stored role.
 * Interns are stored with role 'INTERN' but get the EMPLOYEE permission level everywhere:
 * they can see and act on their own records only.
 */
export function normalizeRole(role?: string): CanonicalRole {
  if (!role) return 'EMPLOYEE';
  const clean = role.trim().toUpperCase().replace(/[\s_\-\/]+/g, '');
  if (clean === 'SUPERADMIN' || clean === 'SUPERADMINISTRATOR') return 'SUPER_ADMIN';
  if (clean === 'ADMIN' || clean === 'ADMINISTRATOR' || clean === 'HRADMIN' || clean === 'HRMANAGER') return 'ADMIN';
  if (clean === 'HR' || clean === 'HUMANRESOURCES') return 'HR';
  if (clean === 'MANAGER' || clean === 'MGR') return 'MANAGER';
  if (clean === 'EMPLOYEE' || clean === 'EMP') return 'EMPLOYEE';
  if (isInternRole(role)) return 'EMPLOYEE';
  return 'EMPLOYEE';
}

export function formatRoleLabel(role?: string): string {
  if (isInternRole(role)) return 'Intern';
  const norm = normalizeRole(role);
  switch (norm) {
    case 'SUPER_ADMIN':
      return 'Super Admin';
    case 'ADMIN':
      return 'Admin';
    case 'HR':
      return 'HR';
    case 'MANAGER':
      return 'Manager';
    case 'EMPLOYEE':
    default:
      return 'Employee';
  }
}