import { IsString, IsOptional, IsInt, IsEnum, Min, MaxLength } from 'class-validator';
import { QueueStrategy } from '@prisma/client';

export class CreateQueueDto {
  @IsString()
  @MaxLength(80)
  name: string;

  @IsOptional()
  @IsEnum(QueueStrategy)
  strategy?: QueueStrategy;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxWaitSecs?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  greetingMsg?: string;

  @IsOptional()
  @IsString()
  departmentId?: string;
}
