import { Module } from '@nestjs/common';
import { BllModule } from './bll/bll.module.js';
import { ConfigModule } from './config/config.module.js';
import { GatewayModule } from './gateway/gateway.module.js';

@Module({
  imports: [ConfigModule, BllModule, GatewayModule],
})
export class AppModule {}

