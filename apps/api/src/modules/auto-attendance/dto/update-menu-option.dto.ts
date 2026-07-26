import { IsEnum, IsInt, IsOptional, IsString, Min, MaxLength, ValidateIf } from 'class-validator';
import { AutoAttendanceAction } from '@prisma/client';

export class UpdateMenuOptionDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  order?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  @IsOptional()
  @IsEnum(AutoAttendanceAction)
  action?: AutoAttendanceAction;

  @ValidateIf((dto) => dto.action === AutoAttendanceAction.ROUTE_TO_DEPARTMENT)
  @IsString()
  departmentId?: string;

  @ValidateIf((dto) => dto.action === AutoAttendanceAction.ROUTE_TO_QUEUE)
  @IsString()
  queueId?: string;
}
