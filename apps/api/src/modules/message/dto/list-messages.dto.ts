import { IsOptional, IsEnum, IsInt, Min, Max, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { MessageType, SenderType } from '@prisma/client';

export class ListMessagesDto {
  @IsOptional()
  @IsEnum(MessageType)
  type?: MessageType;

  @IsOptional()
  @IsEnum(SenderType)
  senderType?: SenderType;

  @IsOptional()
  @IsString()
  before?: string; // cursor: ID da mensagem (paginação por cursor)

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;
}
