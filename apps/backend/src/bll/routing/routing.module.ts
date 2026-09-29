import { Module } from '@nestjs/common';
import { DalModule } from '../../dal/dal.module.js';
import { BllModule } from '../bll.module.js';
import { createTranslationRegistry } from '../translation/index.js';
import { ChatService } from './chat.service.js';
import { RequestRouter } from './request-router.js';
import { CHAT_TRANSLATORS } from './translation.js';

/**
 * The chat facade's routing layer: the router that turns one namespaced model into one credential, one
 * catalog entry, one protocol and one translator, plus the service that carries the call.
 *
 * The translator registry is composed here and exposed through the port declared next to this file, so
 * the router never reaches into the translation implementations. Nothing else provides that token: one
 * registry per application, because two would answer differently for the same pair.
 */
@Module({
  imports: [DalModule, BllModule],
  providers: [
    { provide: CHAT_TRANSLATORS, useFactory: () => createTranslationRegistry() },
    RequestRouter,
    ChatService,
  ],
  exports: [CHAT_TRANSLATORS, RequestRouter, ChatService],
})
export class RoutingModule {}
