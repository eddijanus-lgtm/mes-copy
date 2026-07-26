import 'dotenv/config';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlarmsModule } from './alarms/alarms.module';
import { MachinesModule } from './machines/machines.module';
import { OrdersModule } from './orders/orders.module';
import { TracesModule } from './traces/traces.module';
import { DataCollectionModule } from './data-collection/data-collection.module';
import { ShopfloorGatewayModule } from './opcua/shopfloor-gateway.module';
import { OpcUaModule } from './opcua/opcua.module';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { CarriersModule } from './carriers/carriers.module';
import { MaterialsModule } from './materials/materials.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ShiftsModule } from './shifts/shifts.module';
import { ScheduleModule } from '@nestjs/schedule';
import { ProductsModule } from './products/products.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT ?? '5432', 10),
      username: process.env.DB_USERNAME || 'mes_admin',
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE || 'mes_production',
      entities: [__dirname + '/**/*.entity{.ts,.js}'],
      synchronize: process.env.TYPEORM_SYNCHRONIZE === 'true',
      autoLoadEntities: true,
    }),
    AlarmsModule,
    MachinesModule,
    OrdersModule,
    TracesModule,
    DataCollectionModule,
    ShopfloorGatewayModule,
    OpcUaModule,
    AuthModule,
    HealthModule,
    CarriersModule,
    MaterialsModule,
    DashboardModule,
    NotificationsModule,
    ShiftsModule,
    ProductsModule,
    ScheduleModule.forRoot(),
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
