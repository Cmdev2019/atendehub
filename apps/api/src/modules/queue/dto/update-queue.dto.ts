import { IsString, IsOptional, IsInt, IsEnum, IsBoolean, Min, MaxLength } from 'class-validator';
import { QueueStrategy } from '@prisma/client';

export class UpdateQueueDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

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

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
