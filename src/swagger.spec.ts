import {
  Body,
  Controller,
  Get,
  INestApplication,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  LEGACY_API_SUNSET,
  configureApiVersioning,
} from './api-versioning';
import { createDocument } from './swagger';

class ContractRequestDto {
  @ApiProperty({ example: 'Demo' })
  name: string;
}

@Controller('contract')
@ApiTags('System')
@ApiBearerAuth('JWT-auth')
class ContractController {
  @Get()
  findAll() {
    return [];
  }

  @Post()
  create(@Body() body: ContractRequestDto) {
    return { id: 'contract-1', ...body };
  }

  @Get('deprecated')
  @ApiOperation({
    deprecated: true,
    summary: 'Veralteten Testvertrag abrufen',
  })
  deprecatedOperation() {
    return { deprecated: true };
  }
}

describe('OpenAPI contract', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ContractController],
    }).compile();

    app = module.createNestApplication();
    configureApiVersioning(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves v1 and keeps the unversioned route as deprecated alias', async () => {
    await request(app.getHttpServer()).get('/api/v1/contract').expect(200);

    const legacy = await request(app.getHttpServer())
      .get('/api/contract')
      .expect(200);
    expect(legacy.headers.deprecation).toBe('true');
    expect(legacy.headers.sunset).toBe(LEGACY_API_SUNSET);
    expect(legacy.headers.link).toContain('/api/v1/contract');
  });

  it('publishes only v1 paths with complete operation contracts', () => {
    const document = createDocument(app);

    expect(document.paths['/api/v1/contract']).toBeDefined();
    expect(document.paths['/api/contract']).toBeUndefined();

    for (const [path, pathItem] of Object.entries(document.paths)) {
      expect(path.startsWith('/api/v1')).toBe(true);
      for (const operation of Object.values(pathItem || {})) {
        if (
          !operation ||
          typeof operation !== 'object' ||
          !('responses' in operation)
        ) {
          continue;
        }

        expect(operation.summary).toBeTruthy();
        expect(operation.description).toBeTruthy();
        expect(operation['x-api-version']).toBe('v1');
        expect(operation.responses['400']).toBeDefined();
        expect(operation.responses['500']).toBeDefined();
        expect(operation.responses['401']).toBeDefined();
        expect(operation.responses['403']).toBeDefined();

        const success = Object.entries(operation.responses).find(([code]) =>
          /^2\d\d$/.test(code),
        );
        expect(success).toBeDefined();
        if (success?.[0] !== '204') {
          expect(success?.[1].content).toBeDefined();
        }
      }
    }
  });

  it('marks deprecated operations with a sunset contract', () => {
    const document = createDocument(app);
    const operation =
      document.paths['/api/v1/contract/deprecated']?.get;

    expect(operation?.deprecated).toBe(true);
    expect(operation?.['x-sunset']).toBe(LEGACY_API_SUNSET);
    expect(operation?.responses['200']?.headers?.Sunset).toBeDefined();
  });
});
