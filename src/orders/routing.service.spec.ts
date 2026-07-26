import { RoutingResultCode } from './routing.service';

describe('RoutingService', () => {
  describe('RoutingResultCode enum', () => {
    it('exports correct code values', () => {
      expect(RoutingResultCode.OK).toBe(0);
      expect(RoutingResultCode.CARRIER_UNKNOWN).toBe(1);
      expect(RoutingResultCode.ORDER_MISSING).toBe(2);
      expect(RoutingResultCode.WRONG_RESOURCE).toBe(3);
      expect(RoutingResultCode.STEP_ALREADY_COMPLETED).toBe(4);
      expect(RoutingResultCode.INTERNAL_ERROR).toBe(9);
    });
  });

  it('the routing service has a valid structure', () => {
    // Just confirms the module is importable without side effects
    const mod = require('./routing.service');
    expect(mod.RoutingResultCode).toBeDefined();
    expect(typeof mod.RoutingResultCode.OK).toBe('number');
  });
});
