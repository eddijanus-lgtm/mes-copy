import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function createDocument(app: any) {
  const config = new DocumentBuilder()
    .setTitle('WARA MES — Shopfloor Gateway API')
    .setDescription('Manufacturing Execution System mit OPC UA und MQTT Anbindung')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'JWT aus dem Login-Endpoint',
        in: 'header',
      },
      'JWT-auth',
    )
    .addServer('/api', 'REST API')
    .addServer('/api/shopfloor/ws', 'WebSocket (shopfloor telemetry)')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  return document;
}
