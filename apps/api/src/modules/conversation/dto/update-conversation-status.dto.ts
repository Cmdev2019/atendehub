import { IsEnum, ValidateIf } from 'class-validator';
import { ConversationStatus, ConversationResolution } from '@prisma/client';

export class UpdateConversationStatusDto {
  @IsEnum(ConversationStatus)
  status: ConversationStatus;

  // Obrigatório só ao encerrar (B-32) — o atendente escolhe se o
  // atendimento foi resolvido ou não no momento de fechar a conversa;
  // demais transições de status não usam este campo.
  @ValidateIf((dto) => dto.status === ConversationStatus.CLOSED)
  @IsEnum(ConversationResolution)
  resolution?: ConversationResolution;
}
