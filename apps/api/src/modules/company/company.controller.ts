import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CompanyService } from './company.service';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUserDto } from '../auth/dto/auth-response.dto';

@Controller('company')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  // GET /api/v1/company/me
  @Get('me')
  findOne(@CurrentUser() user: AuthUserDto) {
    return this.companyService.findOne(user.companyId);
  }

  // PATCH /api/v1/company/me
  @Patch('me')
  @Roles(Role.ADMIN)
  update(@CurrentUser() user: AuthUserDto, @Body() dto: UpdateCompanyDto) {
    return this.companyService.update(user.companyId, dto);
  }
}
