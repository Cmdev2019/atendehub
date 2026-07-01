import { IsString, IsNotEmpty } from 'class-validator';

export class AddUserToDepartmentDto {
  @IsString()
  @IsNotEmpty()
  userId: string;
}
