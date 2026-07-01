import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateContactDto } from './create-contact.dto';
import { IsOptional, IsBoolean } from 'class-validator';

export class UpdateContactDto extends PartialType(
  OmitType(CreateContactDto, ['phone', 'channel'] as const),
) {
  @IsOptional()
  @IsBoolean()
  isBlocked?: boolean;
}
