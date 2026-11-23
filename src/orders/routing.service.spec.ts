import { DemoRoutingResultCode } from './routing.service';

describe('RoutingService', () => {
  describe('DemoRoutingResultCode enum', () => {
    it('exports correct code values', () => {
      expect(DemoRoutingResultCode.OK).toBe(0);
      expect(DemoRoutingResultCode.CARRIER_UNKNOWN).toBe(1);
      expect(DemoRoutingResultCode.ORDER_MISSING).toBe(2);
      expect(DemoRoutingResultCode.WRONG_RESOURCE).toBe(3);
      expect(DemoRoutingResultCode.STEP_ALREADY_COMPLETED).toBe(4);
      expect(DemoRoutingResultCode.INTERNAL_ERROR).toBe(9);
    });
  });

  it('the routing service has a valid structure', () => {
    // Just confirms the module is importable without side effects
    const mod = require('./routing.service');
    expect(mod.DemoRoutingResultCode).toBeDefined();
    expect(typeof mod.DemoRoutingResultCode.OK).toBe('number');
  });
});
