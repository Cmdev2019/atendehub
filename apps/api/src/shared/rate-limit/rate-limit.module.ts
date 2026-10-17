import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisThrottlerStorage } from './redis-throttler.storage';

/** C-04 — fornece o contador do limite de requisições no Redis ao ThrottlerModule. */
@Module({
  imports: [ConfigModule],
  providers: [RedisThrottlerStorage],
  exports: [RedisThrottlerStorage],
})
export class RateLimitModule {}
