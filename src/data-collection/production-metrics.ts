import type { MachineSignalRole } from '../machines/profiles/machine-profile.types';

export const PRODUCTION_METRIC_NODE_IDS = {
  idealCycleTimeMs: 'production.idealCycleTimeMs',
  goodCount: 'production.goodCount',
  rejectCount: 'production.rejectCount',
} as const;

export type ProductionMetricRole = keyof typeof PRODUCTION_METRIC_NODE_IDS;

export const PRODUCTION_METRIC_ROLES = Object.keys(
  PRODUCTION_METRIC_NODE_IDS,
) as ProductionMetricRole[];

export function isProductionMetricRole(
  role: MachineSignalRole | string,
): role is ProductionMetricRole {
  return PRODUCTION_METRIC_ROLES.includes(role as ProductionMetricRole);
}
