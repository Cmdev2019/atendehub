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
import { ContactService } from './contact.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { ListContactsDto } from './dto/list-contacts.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUserDto } from '../auth/dto/auth-response.dto';

@Controller('contacts')
@UseGuards(JwtAuthGuard)
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  // GET /api/v1/contacts?search=&channel=&isBlocked=&page=&limit=
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
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@CurrentUser() user: AuthUserDto, @Param('id') id: string) {
    return this.contactService.remove(user.companyId, id);
  }

  // PATCH /api/v1/contacts/:id/block
  @Patch(':id/block')
  toggleBlock(@CurrentUser() user: AuthUserDto, @Param('id') id: string) {
    return this.contactService.toggleBlock(user.companyId, id);
  }
}
