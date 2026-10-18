import { IsBoolean, IsInt, IsOptional, IsString, Min, MaxLength } from 'class-validator';
import { IsBusinessHours } from '../../../shared/validators/business-hours.validator';

// Formato de `businessHours`: { mon: [{start:"09:00",end:"18:00"}], ... }.
// Dia ausente da chave = considerado fechado o dia inteiro. B-99: validado
// campo a campo (antes era um objeto livre).
export class UpdateAutoAttendanceFlowDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  greetingMessage?: string;

  @IsOptional()
  @IsBusinessHours()
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
