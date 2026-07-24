import { Module } from '@nestjs/common';
import { TagController } from './tag.controller';
import { TagService } from './tag.service';

@Module({
  controllers: [TagController],
  providers: [TagService],
  exports: [TagService], // usado por ConversationModule e ContactModule (atribuir/remover tag)
})
export class TagModule {}
