import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from './auth/public.decorator';
import { AppService } from './app.service';
import { ApiInfoDto } from './app.dto';

@Controller()
@ApiTags('System')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @Public()
  @ApiOperation({
    summary: 'API-Informationen abrufen',
    description:
      'Liefert Version, Betriebsstatus und Links zur aktuellen OpenAPI-Dokumentation.',
  })
  @ApiOkResponse({ type: ApiInfoDto, description: 'API ist erreichbar.' })
  getApiInfo(): ApiInfoDto {
    return {
      name: 'WARA MES – Shopfloor Gateway API',
      version: 'v1',
      status: 'ok',
      documentation: '/api/docs',
      openapi: '/api/docs/openapi.json',
    };
  }
}
