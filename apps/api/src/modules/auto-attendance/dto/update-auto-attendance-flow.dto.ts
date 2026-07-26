import { IsBoolean, IsInt, IsObject, IsOptional, IsString, Min, MaxLength } from 'class-validator';

// Formato esperado de `businessHours` (não validado campo a campo — é um
// objeto livre por dia da semana): { mon: [{start:"09:00",end:"18:00"}], ... }
// Dia ausente da chave = considerado fechado o dia inteiro.
export class UpdateAutoAttendanceFlowDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  greetingMessage?: string;

  @IsOptional()
  @IsObject()
  businessHours?: Record<string, { start: string; end: string }[]>;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  outOfHoursMessage?: string;

  @IsOptional()
  @IsInt()
  @Min(30)
  inactivityTimeoutSecs?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  inactivityMessage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  closingMessage?: string;
}
