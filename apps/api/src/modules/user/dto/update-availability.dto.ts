import { IsEnum } from 'class-validator';
import { Availability } from '../../../generated/prisma/client';

// B-65 (ADR-0019): os dois estados do atendente
export class UpdateAvailabilityDto {
  @IsEnum(Availability, { message: 'availability deve ser ONLINE ou OFFLINE' })
  availability: Availability;
}
