export const ROUTING_OUTCOMES = [
  'accepted',
  'carrier_unknown',
  'order_missing',
  'wrong_resource',
  'already_completed',
  'internal_error',
] as const;

export type RoutingOutcome = (typeof ROUTING_OUTCOMES)[number];
