import { Body, Controller, Inject, Post, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ChatService } from '../../bll/routing/chat.service.js';
import { serveClaudeMessages, serveOpenAiChat } from '../v1-chat.js';
import {
  claudeMessagesBodySchema,
  openAiChatBodySchema,
  type ClaudeMessagesBody,
  type OpenAiChatBody,
} from '../v1-schemas.js';
import { ZodValidationPipe } from '../zod-validation.pipe.js';

/**
 * The two chat endpoints a client points at. Each one validates its boundary, states which protocol it
 * speaks, and hands the call to the transport: routing, translation and the provider call live in
 * `bll/`. Nothing here decides what a model is, what it costs or where it goes.
 */
@Controller('v1')
export class V1ChatController {
  constructor(@Inject(ChatService) private readonly chat: ChatService) {}

  /** OpenAI shaped clients, streamed or not. */
  @Post('chat/completions')
  async completions(
    @Body(new ZodValidationPipe(openAiChatBodySchema)) body: OpenAiChatBody,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    await serveOpenAiChat({ chat: this.chat, body, request, reply });
  }

  /** Claude shaped clients, streamed or not. */
  @Post('messages')
  async messages(
    @Body(new ZodValidationPipe(claudeMessagesBodySchema)) body: ClaudeMessagesBody,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    await serveClaudeMessages({ chat: this.chat, body, request, reply });
  }
}
