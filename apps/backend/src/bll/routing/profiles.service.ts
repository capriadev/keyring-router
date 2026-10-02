import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  RoutingProfilesRepository,
  type RoutingProfileRecord,
} from '../../dal/repositories/routing-profiles.repository.js';
import type { RoutingMode } from '../../types/routing.js';
import { InvalidRoutingProfileError, RoutingProfileNotFoundError } from '../errors.js';
import { profileProblem } from './profile.js';

/** What a caller writes to open a profile. The id and the creation time are the gateway's, not theirs. */
export interface RoutingProfileInput {
  readonly providerModelId: string;
  readonly mode: string;
  readonly cascade: readonly string[];
}

/**
 * The profiles the user wrote: which mode and which cascade apply to each model. It validates before it
 * stores, the way `PolicyService` does, because a profile that reached a column without a check would
 * route a model differently than its author intended.
 */
@Injectable()
export class RoutingProfilesService {
  constructor(@Inject(RoutingProfilesRepository) private readonly profiles: RoutingProfilesRepository) {}

  list(): RoutingProfileRecord[] {
    return this.profiles.list();
  }

  create(input: RoutingProfileInput): RoutingProfileRecord {
    const problem = profileProblem({
      providerModelId: input.providerModelId,
      mode: input.mode,
      cascade: input.cascade,
    });

    if (problem !== null) {
      throw new InvalidRoutingProfileError(problem);
    }

    // A model has one profile: a second one would leave the router answering by insertion order, which is
    // not a rule the user wrote. The unique index backs this, and the check names the refusal first.
    if (this.profiles.findByModel(input.providerModelId) !== undefined) {
      throw new InvalidRoutingProfileError('a profile already exists for this model');
    }

    const record: RoutingProfileRecord = {
      id: randomUUID(),
      providerModelId: input.providerModelId,
      mode: input.mode as RoutingMode,
      cascade: input.cascade,
      createdAt: Date.now(),
    };

    this.profiles.insert(record);

    return record;
  }

  delete(id: string): void {
    if (!this.profiles.deleteById(id)) {
      throw new RoutingProfileNotFoundError(id);
    }
  }
}