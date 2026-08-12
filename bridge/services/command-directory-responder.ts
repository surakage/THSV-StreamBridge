import type { NormalizedEvent } from '../../schemas/event.js';
import {
  COMMAND_DIRECTORY_COMMAND,
  COMMAND_DIRECTORY_TARGET_MODULE_ID,
} from '../core/effective-commands.js';
import type { OutboundMessageDelivery, OutboundMessageRequest } from '../core/outbound-message-router.js';
import type { Logger } from './logger.js';
import type { CommandDirectoryService } from './command-directory.js';

export interface CommandDirectoryChatRouter {
  route(request: OutboundMessageRequest, signal?: AbortSignal): Promise<readonly OutboundMessageDelivery[]>;
}

/** Handles the Bridge-owned !commands / !command command without a Streamer.bot trigger. */
export class CommandDirectoryResponder {
  public constructor(
    private readonly directory: CommandDirectoryService,
    private readonly router: CommandDirectoryChatRouter,
    private readonly logger: Logger,
  ) {}

  public async handle(event: NormalizedEvent): Promise<void> {
    if (!isCommandDirectoryInvocation(event)) return;
    const platform = outboundPlatform(event.platform);
    if (platform === undefined) return;

    const publicUrl = this.directory.publicationStatus().publicUrl;
    const message = publicUrl === undefined
      ? 'The stream command page is not available yet. Please try again shortly.'
      : `Stream commands: ${publicUrl}`;

    try {
      const deliveries = await this.router.route({
        message,
        routing: 'source',
        sourcePlatform: platform,
        overflow: 'reject',
      });
      const failed = deliveries.filter((delivery) => !delivery.accepted);
      if (failed.length > 0) this.logger.warn('Command directory chat response was not delivered', { platform, deliveries: failed });
    } catch (error) {
      // A chat-output outage must not fail ingestion or disable the command registry.
      this.logger.warn('Command directory chat response failed', { platform, error });
    }
  }
}

function isCommandDirectoryInvocation(event: NormalizedEvent): boolean {
  return event.eventType === 'command.received'
    && event.payload['command'] === COMMAND_DIRECTORY_COMMAND
    && event.payload['targetModuleId'] === COMMAND_DIRECTORY_TARGET_MODULE_ID;
}

function outboundPlatform(value: string): 'twitch' | 'youtube' | 'kick' | 'tiktok' | undefined {
  return value === 'twitch' || value === 'youtube' || value === 'kick' || value === 'tiktok' ? value : undefined;
}
