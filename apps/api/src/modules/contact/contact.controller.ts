import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { ContactService } from './contact.service';
import { TagService } from '../tag/tag.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { ListContactsDto } from './dto/list-contacts.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUserDto } from '../auth/dto/auth-response.dto';

@Controller('contacts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ContactController {
  constructor(
    private readonly contactService: ContactService,
    private readonly tagService: TagService,
  ) {}

  // GET /api/v1/contacts?search=&channel=&isBlocked=&tagId=&page=&limit=
  @Get()
  findAll(@CurrentUser() user: AuthUserDto, @Query() query: ListContactsDto) {
    return this.contactService.findAll(user.companyId, query);
  }

  // GET /api/v1/contacts/:id
  @Get(':id')
  findOne(@CurrentUser() user: AuthUserDto, @Param('id') id: string) {
    return this.contactService.findOne(user.companyId, id);
  }

  // POST /api/v1/contacts
  @Post()
  create(@CurrentUser() user: AuthUserDto, @Body() dto: CreateContactDto) {
    return this.contactService.create(user.companyId, dto);
  }

  // PATCH /api/v1/contacts/:id
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUserDto,
    @Param('id') id: string,
    @Body() dto: UpdateContactDto,
  ) {
    return this.contactService.update(user.companyId, id, dto);
  }

  // DELETE /api/v1/contacts/:id
  // Anonimiza (não apaga) — direito de exclusão do titular (B-17/LGPD), ação
  // irreversível restrita a ADMIN+.
  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  remove(@CurrentUser() user: AuthUserDto, @Param('id') id: string) {
    return this.contactService.remove(user.companyId, id, user.id);
  }

  // GET /api/v1/contacts/:id/export
  // Portabilidade de dados do titular (B-30/LGPD) — contato + tags + todas as
  // conversas e mensagens, num único JSON. Restrito a ADMIN+ (mesmo nível de
  // DELETE — é acesso amplo a PII, não uma consulta corriqueira).
  @Get(':id/export')
  @Roles(Role.ADMIN)
  exportData(@CurrentUser() user: AuthUserDto, @Param('id') id: string) {
    return this.contactService.exportData(user.companyId, id, user.id);
  }

  // PATCH /api/v1/contacts/:id/block
  @Patch(':id/block')
  toggleBlock(@CurrentUser() user: AuthUserDto, @Param('id') id: string) {
    return this.contactService.toggleBlock(user.companyId, id);
  }

  // POST /api/v1/contacts/:id/tags/:tagId
  @Post(':id/tags/:tagId')
  addTag(
    @CurrentUser() user: AuthUserDto,
    @Param('id') id: string,
    @Param('tagId') tagId: string,
  ) {
    return this.tagService.assignToContact(user.companyId, id, tagId);
  }

  // DELETE /api/v1/contacts/:id/tags/:tagId
  @Delete(':id/tags/:tagId')
  @HttpCode(HttpStatus.OK)
  removeTag(
    @CurrentUser() user: AuthUserDto,
    @Param('id') id: string,
    @Param('tagId') tagId: string,
  ) {
    return this.tagService.removeFromContact(user.companyId, id, tagId);
  }
}
