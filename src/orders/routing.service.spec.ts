import { ROUTING_OUTCOMES } from './routing-outcome';
import { RoutingService } from './routing.service';

describe('RoutingService', () => {
  it('exports semantic outcomes without PLC-specific numeric codes', () => {
    expect(ROUTING_OUTCOMES).toEqual([
      'accepted',
      'carrier_unknown',
      'order_missing',
      'wrong_resource',
      'already_completed',
      'internal_error',
    ]);
  });

  it('is importable without a result-code enum', () => {
    const module = require('./routing.service');
    expect(module.RoutingService).toBeDefined();
    expect(module.RoutingResultCode).toBeUndefined();
  });

  it('reads the final route resource from the machine profile', () => {
    const service = new RoutingService(
      {} as any,
      {} as any,
      {} as any,
      {
        getProfile: () => ({
          routing: { terminalResourceId: 65_535 },
        }),
      } as any,
      {} as any,
    );

    expect((service as any).terminalResourceId()).toBe(65_535);
  });

  it('does not invent a final route resource when the profile omits it', () => {
    const service = new RoutingService(
      {} as any,
      {} as any,
      {} as any,
      {
        getProfile: () => ({}),
      } as any,
      {} as any,
    );

    expect(() => (service as any).terminalResourceId()).toThrow(
      'Machine profile requires routing.terminalResourceId',
    );
  });

  it('starts a pending order only after an accepted machine request', () => {
    const service = new RoutingService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const startedAt = new Date('2026-07-27T02:00:00.000Z');
    const order = {
      status: 'pending',
      start_time: undefined,
    };

    expect(
      (service as any).transitionOrderToInProgress(order, startedAt),
    ).toBe(true);
    expect(order).toEqual({
      status: 'in_progress',
      start_time: startedAt,
    });
  });

  it('does not replace an existing machine start time', () => {
    const service = new RoutingService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const existingStart = new Date('2026-07-27T01:00:00.000Z');
    const order = {
      status: 'in_progress',
      start_time: existingStart,
    };

    expect(
      (service as any).transitionOrderToInProgress(
        order,
        new Date('2026-07-27T02:00:00.000Z'),
      ),
    ).toBe(false);
    expect(order.start_time).toBe(existingStart);
  });
});
