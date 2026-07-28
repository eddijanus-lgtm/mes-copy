import { BadRequestException } from '@nestjs/common';
import { ProductEntity } from './product.entity';
import { ProductRouteStepEntity } from './product-route-step.entity';
import { ProductsService } from './products.service';

describe('ProductsService routing', () => {
  const profile = {
    machine_id: 'lernfabrik-c',
    document: {
      stations: [
        {
          stationId: 'presse01',
          resourceId: 30,
          displayName: 'Presse 01',
          enabled: true,
          routing: {
            sequence: 1,
            operationNo: 7,
            operation: 'Pressen',
          },
        },
      ],
    },
  };

  function createService() {
    const manager = {
      create: jest.fn((_entity, value) => value),
      save: jest.fn(async (entity, value) =>
        entity === ProductEntity ? { ...value, id: 'product-1' } : value,
      ),
    };
    const dataSource = {
      transaction: jest.fn(async (callback) => callback(manager)),
    };
    const productsRepo = {};
    const routeStepsRepo = {};
    const profilesRepo = {
      findOne: jest.fn(async () => profile),
    };
    return {
      service: new ProductsService(
        dataSource as any,
        productsRepo as any,
        routeStepsRepo as any,
        profilesRepo as any,
      ),
      manager,
    };
  }

  it('uses the station action as the canonical route label', async () => {
    const { service, manager } = createService();

    const result = await service.create({
      part_no: 'ROUTE-001',
      name: 'Standardprodukt',
      profile_machine_id: 'lernfabrik-c',
      route_steps: [
        {
          step_no: 1,
          resource_id: 30,
          operation_no: 7,
          operation: 'Abweichender Freitext',
          parameters: {},
        },
      ],
    });

    expect(result.route_steps[0]).toMatchObject({
      resource_id: 30,
      operation_no: 7,
      operation: 'Pressen',
    });
    expect(manager.save).toHaveBeenCalledWith(
      ProductRouteStepEntity,
      expect.arrayContaining([
        expect.objectContaining({ operation: 'Pressen' }),
      ]),
    );
  });

  it('rejects an operation number not provided by the station', async () => {
    const { service } = createService();

    await expect(
      service.create({
        part_no: 'ROUTE-002',
        name: 'Ungültige Route',
        profile_machine_id: 'lernfabrik-c',
        route_steps: [
          {
            step_no: 1,
            resource_id: 30,
            operation_no: 99,
            operation: 'Pressen',
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
