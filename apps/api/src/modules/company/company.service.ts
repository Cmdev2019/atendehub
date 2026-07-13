import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { UpdateCompanyDto } from './dto/update-company.dto';

@Injectable()
export class CompanyService {
  constructor(private readonly prisma: PrismaService) {}

  async findOne(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        plan: true,
        maxAgents: true,
        maxChannels: true,
        isActive: true,
        trialEndsAt: true,
        createdAt: true,
        _count: {
          select: {
            users: { where: { isActive: true } },
            whatsappConnections: { where: { isActive: true } },
            conversations: true,
          },
        },
      },
    });

    if (!company) throw new NotFoundException('Empresa não encontrada');
    return company;
  }

  async update(companyId: string, dto: UpdateCompanyDto) {
    return this.prisma.company.update({
      where: { id: companyId },
      data: dto,
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        plan: true,
        updatedAt: true,
      },
    });
  }
}
