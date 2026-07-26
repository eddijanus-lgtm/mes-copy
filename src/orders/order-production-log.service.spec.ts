import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { StMesHandshakeEntity } from '../opcua/stmes-handshake.entity';
import { OrderEntity } from './order.entity';
import { OrderProductionLogEntity } from './order-production-log.entity';
import { OrderProductionLogService } from './order-production-log.service';
import { OrderRouteStepEntity } from './order-route-step.entity';

describe('OrderProductionLogService', () => {
  const orders = { find: jest.fn(), findOne: jest.fn() };
  const routeSteps = { find: jest.fn() };
  const handshakes = { find: jest.fn() };
  const productionLogs = {
    findOne: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => ({ id: 'log-1', ...value })),
    delete: jest.fn(),
  };
  let service: OrderProductionLogService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        OrderProductionLogService,
        { provide: getRepositoryToken(OrderEntity), useValue: orders },
        { provide: getRepositoryToken(OrderRouteStepEntity), useValue: routeSteps },
        { provide: getRepositoryToken(StMesHandshakeEntity), useValue: handshakes },
        { provide: getRepositoryToken(OrderProductionLogEntity), useValue: productionLogs },
      ],
    }).compile();
    service = module.get(OrderProductionLogService);
  });

  it('returns no log while production is still running', async () => {
    productionLogs.findOne.mockResolvedValue(null);
    orders.findOne.mockResolvedValue({ id: 'order-1', status: 'in_progress' });

    await expect(service.findOrCreate('order-1')).resolves.toBeNull();
  });

  it('creates a completed production snapshot from route and handshakes', async () => {
    productionLogs.findOne.mockResolvedValue(null);
    orders.findOne.mockResolvedValue({
      id: 'order-1',
      name: 'ORDER-001',
      operation: 'Produktion',
      status: 'completed',
      quantity: 1,
      completed_quantity: 1,
      start_time: new Date('2026-07-26T10:00:00.000Z'),
      end_time: new Date('2026-07-26T10:01:00.000Z'),
    });
    routeSteps.find.mockResolvedValue([{
      step_no: 1,
      resource_id: 1,
      operation_no: 10,
      operation: 'Station 1',
      parameters: { iPar1: 4 },
    }]);
    handshakes.find.mockResolvedValue([{
      resource_id: 1,
      carrier_number: 128,
      status: 'acknowledged',
      result_code: 0,
      created_at: new Date('2026-07-26T10:00:10.000Z'),
      responded_at: new Date('2026-07-26T10:00:11.000Z'),
      acknowledged_at: new Date('2026-07-26T10:00:12.000Z'),
      request_payload: { carrierNumber: 128 },
      response_payload: { iPar1: 4 },
    }]);

    const result = await service.finalize('order-1');

    expect(result.snapshot.order).toMatchObject({
      name: 'ORDER-001',
      duration_ms: 60_000,
    });
    expect(result.snapshot.carriers).toEqual([128]);
    expect(result.snapshot.route[0].parameters).toEqual({ iPar1: 4 });
    expect(result.snapshot.station_executions[0]).toMatchObject({
      resource_id: 1,
      result_code: 0,
    });
    expect(result.snapshot.quality.status).toBe('not_evaluated');
  });

  it('exports a completed production run as RFC 4180 CSV', async () => {
    productionLogs.findOne.mockResolvedValue({
      order_id: 'order-1',
      snapshot: {
        schema_version: 1,
        generated_at: '2026-07-26T10:01:00.000Z',
        order: {
          id: 'order-1',
          name: 'ORDER-001',
          operation: 'Webshop-Produkt, Variante A',
          status: 'completed',
          quantity: 1,
          completed_quantity: 1,
          started_at: '2026-07-26T10:00:00.000Z',
          completed_at: '2026-07-26T10:01:00.000Z',
          duration_ms: 60_000,
        },
        carriers: [128],
        route: [{
          step_no: 1,
          resource_id: 1,
          operation_no: 10,
          operation: 'S01 Deckelzuführung',
          parameters: { iPar1: 4 },
        }],
        station_executions: [{
          resource_id: 1,
          carrier_number: 128,
          status: 'acknowledged',
          result_code: 0,
          requested_at: '2026-07-26T10:00:10.000Z',
          responded_at: '2026-07-26T10:00:11.000Z',
          acknowledged_at: '2026-07-26T10:00:12.000Z',
          request: { carrierNumber: 128 },
          response: { note: '=not-a-formula' },
        }],
        quality: {
          status: 'not_evaluated',
          note: 'Nur Routenerfolg bewertet.',
        },
      },
    });

    const result = await service.exportCsv('order-1');

    expect(result.filename).toBe('ORDER-001-production-run.csv');
    expect(result.csv.startsWith('\uFEFFschema_name,schema_version,record_type')).toBe(true);
    expect(result.csv).toContain('\r\nWARA_MES_PRODUCTION_RUN,1.0,RUN_SUMMARY');
    expect(result.csv).toContain('\r\nWARA_MES_PRODUCTION_RUN,1.0,STATION_EXECUTION');
    expect(result.csv).toContain('"Webshop-Produkt, Variante A"');
    expect(result.csv).toContain('S01 Deckelzuführung');
    expect(result.csv).toContain(',1000,1000,');
    expect(result.csv.endsWith('\r\n')).toBe(true);
  });

  it('rejects CSV exports for unfinished orders', async () => {
    productionLogs.findOne.mockResolvedValue(null);
    orders.findOne.mockResolvedValue({ id: 'order-1', status: 'in_progress' });

    await expect(service.exportCsv('order-1')).rejects.toThrow('Production log is only available for completed orders');
  });

  it('exports all completed production runs in one CSV file', async () => {
    orders.find.mockResolvedValue([{ id: 'order-1' }, { id: 'order-2' }]);
    productionLogs.findOne.mockImplementation(async ({ where }) => ({
      order_id: where.order_id,
      snapshot: {
        schema_version: 1,
        generated_at: '2026-07-26T10:01:00.000Z',
        order: {
          id: where.order_id,
          name: where.order_id === 'order-1' ? 'ORDER-001' : 'ORDER-002',
          operation: 'Produktion',
          status: 'completed',
          quantity: 1,
          completed_quantity: 1,
          started_at: '2026-07-26T10:00:00.000Z',
          completed_at: '2026-07-26T10:01:00.000Z',
          duration_ms: 60_000,
        },
        carriers: [],
        route: [],
        station_executions: [],
        quality: { status: 'not_evaluated', note: 'Noch nicht bewertet.' },
      },
    }));

    const result = await service.exportAllCsv();

    expect(result.orderCount).toBe(2);
    expect(result.filename).toMatch(/^production-runs-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(result.csv.match(/RUN_SUMMARY/g)).toHaveLength(2);
    expect(result.csv).toContain('ORDER-001');
    expect(result.csv).toContain('ORDER-002');
    expect(result.csv.match(/schema_name,schema_version,record_type/g)).toHaveLength(1);
  });
});
