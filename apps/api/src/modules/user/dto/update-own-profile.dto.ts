import { IsString, IsOptional, MaxLength, IsUrl } from 'class-validator';

// Deliberadamente sem `role`/`isActive` — campo extra é rejeitado pelo
// ValidationPipe (forbidNonWhitelisted), então isso não é só uma
// convenção de nomes, é a garantia real de que um AGENT não vira ADMIN
// por essa rota (ver B3-1).
export class UpdateOwnProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsUrl({}, { message: 'avatarUrl deve ser uma URL válida' })
  avatarUrl?: string;
}
