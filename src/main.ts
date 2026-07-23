import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import * as express from 'express';
import * as path from 'path';
import helmet from 'helmet';
import { WsAdapter } from '@nestjs/platform-ws';
import * as correlationId from 'crypto';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  app.use(helmet({ contentSecurityPolicy: false }));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  const corsOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:5173').split(',');
  app.enableCors({ origin: corsOrigins, credentials: true });
  app.useWebSocketAdapter(new WsAdapter(app));
  app.enableShutdownHooks(['SIGINT', 'SIGTERM']);
  app.setGlobalPrefix('api');

  app.use((req, res, next) => {
    const requestId = correlationId.randomUUID();
    (req as any).requestId = requestId;
    res.setHeader('X-Request-ID', requestId);
    next();
  });

  app.useLogger(logger);

  const frontendDistPath = path.join(__dirname, '..', 'frontend', 'dist');
  app.use(express.static(frontendDistPath));
  app.use((req, res, next) => {
    if ((req.method === 'GET' || req.method === 'HEAD') && !req.url.includes('.') && !req.url.startsWith('/api/')) {
      return res.sendFile(path.join(frontendDistPath, 'index.html'));
    }
    next();
  });

  const port = process.env.PORT || 3000;
  
  const shutdownHandler = async () => {
    logger.warn('Shutdown initiated — closing in-flight connections and OPC UA sessions...');
    await app.close();
    logger.log('Application shut down cleanly.');
    process.exit(1);
  };

  process.on('SIGINT', shutdownHandler);
  process.on('SIGTERM', shutdownHandler);

  await app.listen(port);
  logger.log(`MES Shopfloor Gateway running on http://localhost:${port}`);
}

bootstrap();
