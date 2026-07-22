import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as express from 'express';
import * as path from 'path';
import helmet from 'helmet';
import { WsAdapter } from '@nestjs/platform-ws';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(helmet({ contentSecurityPolicy: false }));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  const corsOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:5173').split(',');
  app.enableCors({ origin: corsOrigins, credentials: true });
  app.useWebSocketAdapter(new WsAdapter(app));
  app.enableShutdownHooks();
  app.setGlobalPrefix('api');

  const frontendDistPath = path.join(__dirname, '..', 'frontend', 'dist');
  app.use(express.static(frontendDistPath));
  app.use((req, res, next) => {
    if ((req.method === 'GET' || req.method === 'HEAD') && !req.url.includes('.') && !req.url.startsWith('/api/')) {
      return res.sendFile(path.join(frontendDistPath, 'index.html'));
    }
    next();
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`MES Edge Gateway running on http://localhost:${port}`);
}

bootstrap();
