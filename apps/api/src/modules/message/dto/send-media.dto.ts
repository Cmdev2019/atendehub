import { IsOptional, IsString, MaxLength } from 'class-validator';

// Corpo (multipart) do envio de mídia — o arquivo vem no campo `file`
// (multer); aqui só a legenda opcional.
export class SendMediaDto {
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  caption?: string;
}
