import {
  IsString,
  IsOptional,
  IsEnum,
  IsUrl,
  MaxLength,
  MinLength,
  ValidateIf,
  IsNotEmpty,
} from 'class-validator';
import { MessageType } from '@prisma/client';

// Tipos permitidos para envio pelo agente
const ALLOWED_TYPES = [
  MessageType.TEXT,
  MessageType.IMAGE,
  MessageType.VIDEO,
  MessageType.AUDIO,
  MessageType.DOCUMENT,
] as const;

type AllowedMessageType = typeof ALLOWED_TYPES[number];

export class SendMessageDto {
  @IsEnum(ALLOWED_TYPES, {
    message: 'Tipo inválido. Use: TEXT, IMAGE, VIDEO, AUDIO ou DOCUMENT',
  })
  type: AllowedMessageType = MessageType.TEXT;

  // Obrigatório para TEXT, opcional para mídia (caption)
  @ValidateIf((o) => o.type === MessageType.TEXT)
  @IsNotEmpty({ message: 'Conteúdo é obrigatório para mensagens de texto' })
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  content?: string;

  // Obrigatório para mensagens de mídia
  @ValidateIf((o) => o.type !== MessageType.TEXT)
  @IsNotEmpty({ message: 'URL da mídia é obrigatória para este tipo de mensagem' })
  @IsUrl({}, { message: 'mediaUrl deve ser uma URL válida' })
  mediaUrl?: string;

  // Caption para imagem/vídeo/documento (opcional)
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  caption?: string;

  // Nome do arquivo para documentos
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string;

  // ID da mensagem que está sendo respondida (quote)
  @IsOptional()
  @IsString()
  quotedMessageId?: string;
}
