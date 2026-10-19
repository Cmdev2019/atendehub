import { Injectable, NotFoundException } from '@nestjs/common';
import { Availability } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { EventsService } from '../events/events.service';

// Por que o estado mudou — vai para a auditoria junto com a troca
export type AvailabilityChangeReason = 'self' | 'logout' | 'deactivated';

export interface AvailabilityOwner {
  id: string;
  companyId: string;
}

const AVAILABILITY_SELECT = { availability: true, availabilityChangedAt: true } as const;

/**
 * B-65 (ADR-0019, regras 8 a 12) — estado Online/Offline do usuário.
 *
 * Só o próprio usuário escolhe o estado (`PATCH /users/me/availability`); o
 * logout e a desativação o põem Offline. A troca é uma atualização
 * condicional: só grava, emite o evento e audita quando o estado muda de
 * fato — duas abas pedindo o mesmo estado não geram dois eventos.
 *
 * Fica num módulo próprio porque o AuthModule (logout) e o UserModule (rota e
 * desativação) precisam dele, e o UserModule já importa o AuthModule.
 */
@Injectable()
export class AvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly auditLog: AuditLogService,
  ) {}

  async set(
    owner: AvailabilityOwner,
    availability: Availability,
    reason: AvailabilityChangeReason,
    actorId: string = owner.id,
  ) {
    const changedAt = new Date();
    const { count } = await this.prisma.user.updateMany({
      where: { id: owner.id, companyId: owner.companyId, availability: { not: availability } },
      data: { availability, availabilityChangedAt: changedAt },
    });

    if (count === 0) {
      // Já estava neste estado — ou o usuário não é desta empresa
      const current = await this.prisma.user.findFirst({
        where: { id: owner.id, companyId: owner.companyId },
        select: AVAILABILITY_SELECT,
      });
      if (!current) throw new NotFoundException('Usuário não encontrado');
      return current;
    }

    this.events.emitUserAvailability({
      companyId: owner.companyId,
      userId: owner.id,
      availability,
      changedAt,
    });

    // Com dois estados só, se mudou, o anterior era o outro
    const previous = availability === Availability.ONLINE ? Availability.OFFLINE : Availability.ONLINE;
    await this.auditLog.record({
      companyId: owner.companyId,
      userId: actorId,
      action: 'user.availability_changed',
      entity: 'User',
      entityId: owner.id,
      before: { availability: previous },
      after: { availability, reason },
    });

    return { availability, availabilityChangedAt: changedAt };
  }
}
