import { IsEnum, IsNotEmpty, IsString, MaxLength, ValidateIf } from 'class-validator';
import { ConversationStatus, ConversationResolution } from '@prisma/client';

export class UpdateConversationStatusDto {
  @IsEnum(ConversationStatus)
  status: ConversationStatus;

  // Obrigatório só ao encerrar (B-32) — o atendente escolhe se o
  // atendimento foi resolvido, não resolvido ou cancelado (B-36) no
  // momento de fechar a conversa; demais transições de status não usam
  // este campo.
  @ValidateIf((dto) => dto.status === ConversationStatus.CLOSED)
  @IsEnum(ConversationResolution)
  resolution?: ConversationResolution;

  // Obrigatório só quando resolution=CANCELLED (B-36) — o atendente precisa
  // justificar por que está cancelando em vez de atender, diferente de
  // RESOLVED/UNRESOLVED, que não pedem explicação nenhuma.
  @ValidateIf((dto) => dto.resolution === ConversationResolution.CANCELLED)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  resolutionNote?: string;
}
