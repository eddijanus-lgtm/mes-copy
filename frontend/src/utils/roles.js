export const ROLES = Object.freeze({
  ADMIN: "admin",
  OPERATOR: "operator",
  VIEWER: "viewer",
});

export const USER_ROLES = [ROLES.VIEWER, ROLES.OPERATOR, ROLES.ADMIN];

export function hasRole(user, ...roles) {
  return Boolean(user?.role && roles.includes(user.role));
}

export function canManageMachines(user) {
  return hasRole(user, ROLES.ADMIN, ROLES.OPERATOR);
}

export function canDeleteMachines(user) {
  return hasRole(user, ROLES.ADMIN);
}

export function canManageOrders(user) {
  return hasRole(user, ROLES.ADMIN, ROLES.OPERATOR);
}

export function canDeleteOrders(user) {
  return hasRole(user, ROLES.ADMIN);
}
