import { IsString, IsOptional, IsInt, IsIn, IsBoolean, Min, MaxLength } from 'class-validator';
import { QueueStrategy } from '@prisma/client';
import { QUEUE_STRATEGY_MESSAGE } from './create-queue.dto';

export class UpdateQueueDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  // B-66 (ADR-0019, M-21): só MANUAL — ver CreateQueueDto
  @IsOptional()
  @IsIn([QueueStrategy.MANUAL], { message: QUEUE_STRATEGY_MESSAGE })
  strategy?: QueueStrategy;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxWaitSecs?: number;

  // B-114: null limpa o prazo — o setor fica sem SLA do atendimento
  @IsOptional()
  @IsInt()
  @Min(1)
  maxServiceSecs?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  greetingMsg?: string;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
