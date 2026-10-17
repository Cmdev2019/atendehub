import { Global, Module } from '@nestjs/common';
import { ConversationScopeGuard } from './conversation-scope.guard';
import { ConversationScopeService } from './conversation-scope.service';

/** C-10/B-40 — escopo de conversas por papel e departamento, usado por vários módulos. */
@Global()
@Module({
  providers: [ConversationScopeService, ConversationScopeGuard],
  exports: [ConversationScopeService, ConversationScopeGuard],
})
export class ConversationScopeModule {}
