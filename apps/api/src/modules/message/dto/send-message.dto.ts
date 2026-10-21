import {
  IsString,
  IsOptional,
  IsIn,
  MaxLength,
  MinLength,
  IsNotEmpty,
} from 'class-validator';
import { MessageType } from '../../../generated/prisma/client';

// B-75 (M-11): esta rota é só para texto. Mídia vai por upload
// (`POST .../messages/media`), que é o que o painel usa. O envio de mídia por
// URL foi retirado: a URL informada era buscada pela Evolution dentro da rede
// do servidor (SSRF), e nenhuma lista de bloqueio cobre IPv6, nomes internos
// do Docker e nomes que resolvem para IP privado — nem a troca de DNS entre a
// validação e a busca. Sem URL vinda do usuário, não há o que filtrar.
export class SendMessageDto {
  @IsIn([MessageType.TEXT], {
    message: 'Esta rota envia só texto. Para mídia, use POST .../messages/media (upload)',
  })
  type: typeof MessageType.TEXT = MessageType.TEXT;

  @IsNotEmpty({ message: 'Conteúdo é obrigatório para mensagens de texto' })
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  content: string;

  // ID da mensagem que está sendo respondida (quote)
  @IsOptional()
  @IsString()
  quotedMessageId?: string;
}
