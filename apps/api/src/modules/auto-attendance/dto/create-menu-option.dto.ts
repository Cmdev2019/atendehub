import { IsEnum, IsInt, IsString, Min, MaxLength, ValidateIf } from 'class-validator';
import { AutoAttendanceAction } from '@prisma/client';

export class CreateMenuOptionDto {
  @IsInt()
  @Min(1)
  order: number;

  @IsString()
  @MaxLength(120)
  label: string;

  @IsEnum(AutoAttendanceAction)
  action: AutoAttendanceAction;

  @ValidateIf((dto) => dto.action === AutoAttendanceAction.ROUTE_TO_DEPARTMENT)
  @IsString()
  departmentId?: string;

  @ValidateIf((dto) => dto.action === AutoAttendanceAction.ROUTE_TO_QUEUE)
  @IsString()
  queueId?: string;
}
