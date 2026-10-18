import { Module } from '@nestjs/common';
import { RetentionService } from './retention.service';

// B-101 (L-15): purga diária de dados operacionais (ver RetentionService)
@Module({ providers: [RetentionService] })
export class RetentionModule {}
