import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { RoutingProfile } from '../../types/routing.js';
import { profileProblem, resolveProfile, type RoutingPlanProfile } from './profile.js';

function profile(providerModelId: string, mode: RoutingProfile['mode'], cascade: readonly string[]): RoutingProfile {
  return { providerModelId, mode, cascade };
}

const FALLBACK: RoutingPlanProfile = { mode: 'normal', cascade: [] };

describe('what makes a profile storable', () => {
  it('accepts a profile that names a model, a known mode and a unique cascade', () => {
    assert.equal(
      profileProblem({ providerModelId: 'gpt-6-luna', mode: 'auto_model', cascade: ['claude-sonnet-5.5'] }),
      null,
    );
  });

  it('refuses an empty model, naming the field and not the value', () => {
    assert.equal(profileProblem({ providerModelId: '  ', mode: 'normal', cascade: [] }), 'providerModelId must not be empty');
  });

  it('refuses a mode outside the three', () => {
    assert.match(profileProblem({ providerModelId: 'm', mode: 'auto_everything', cascade: [] }) ?? '', /mode must be one of/);
  });

  it('refuses an empty cascade entry', () => {
    assert.equal(
      profileProblem({ providerModelId: 'm', mode: 'auto_model', cascade: ['a', '  '] }),
      'a cascade entry must not be empty',
    );
  });

  it('refuses a cascade entry that repeats', () => {
    assert.equal(
      profileProblem({ providerModelId: 'm', mode: 'auto_model', cascade: ['a', 'b', 'a'] }),
      'a cascade entry must not repeat',
    );
  });
});

describe('the profile a requested model gets', () => {
  const profiles: readonly RoutingProfile[] = [
    profile('gpt-6-luna', 'auto_model', ['claude-sonnet-5.5', 'gpt-5.6-terra']),
    profile('gpt-5.6-terra', 'auto_general', ['claude-sonnet-5.5']),
  ];

  it('takes the stored profile when the model has one', () => {
    assert.deepEqual(resolveProfile('gpt-6-luna', profiles, FALLBACK), {
      mode: 'auto_model',
      cascade: ['claude-sonnet-5.5', 'gpt-5.6-terra'],
    });
  });

  it('falls back to the default when the model has none, so an installation is unchanged', () => {
    assert.deepEqual(resolveProfile('unknown-model', profiles, FALLBACK), FALLBACK);
  });

  it('matches the bare model, never a namespaced id, so the name takes no part in the key', () => {
    // The profile is stored under the model part. Asking with a namespaced id must not match it, which is
    // what keeps the key the model and never the name: the caller passes the part after the slash.
    assert.deepEqual(resolveProfile('local/gpt-6-luna', profiles, FALLBACK), FALLBACK);
    assert.deepEqual(resolveProfile('gpt-6-luna', profiles, FALLBACK), {
      mode: 'auto_model',
      cascade: ['claude-sonnet-5.5', 'gpt-5.6-terra'],
    });
  });

  it('never invents a profile for a model it has not seen', () => {
    assert.deepEqual(resolveProfile('gpt-9', profiles, FALLBACK), FALLBACK);
  });
});