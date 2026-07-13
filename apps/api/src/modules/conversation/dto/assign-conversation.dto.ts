import { IsString, IsOptional } from 'class-validator';

export class AssignConversationDto {
  @IsOptional()
  @IsString()
  agentId?: string; // null = desatribuir

  @IsOptional()
  @IsString()
  departmentId?: string;
}
