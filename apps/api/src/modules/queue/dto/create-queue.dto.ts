import { IsString, IsOptional, IsInt, IsIn, Min, MaxLength } from 'class-validator';
import { QueueStrategy } from '@prisma/client';

// B-66 (ADR-0019, M-21): a fila é compartilhada — só MANUAL existe de fato
export const QUEUE_STRATEGY_MESSAGE =
  'A fila é compartilhada: a única estratégia é MANUAL (quem atender primeiro fica com a conversa)';

export class CreateQueueDto {
  @IsString()
  @MaxLength(80)
  name: string;

  @IsOptional()
  @IsIn([QueueStrategy.MANUAL], { message: QUEUE_STRATEGY_MESSAGE })
  strategy?: QueueStrategy;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxWaitSecs?: number;

  // B-114 (ADR-0019, regra 19): prazo do atendimento do setor, em segundos;
  // ausente ou null = setor sem SLA do atendimento
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
}
