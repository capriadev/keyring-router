import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isLocalPanelOrigin } from './cors.js';

describe('which browser origins may call the local API', () => {
  it('allows the panel on loopback, any port', () => {
    assert.equal(isLocalPanelOrigin('http://localhost:3000'), true);
    assert.equal(isLocalPanelOrigin('http://127.0.0.1:3000'), true);
    assert.equal(isLocalPanelOrigin('http://localhost'), true);
    assert.equal(isLocalPanelOrigin('https://localhost:8443'), true);
    assert.equal(isLocalPanelOrigin('http://[::1]:3000'), true);
  });

  it('refuses a site the user could be visiting, which is the whole point', () => {
    assert.equal(isLocalPanelOrigin('http://evil.example'), false);
    assert.equal(isLocalPanelOrigin('https://evil.example:3000'), false);
    // A host that merely contains a loopback name is not loopback: the hostname has to be one of them.
    assert.equal(isLocalPanelOrigin('http://localhost.evil.example'), false);
    assert.equal(isLocalPanelOrigin('http://127.0.0.1.evil.example'), false);
  });

  it('refuses a scheme that is not http or https', () => {
    assert.equal(isLocalPanelOrigin('file://localhost'), false);
    assert.equal(isLocalPanelOrigin('ftp://localhost'), false);
    assert.equal(isLocalPanelOrigin('null'), false);
  });

  it('allows a call with no origin, because CORS never applied to it', () => {
    assert.equal(isLocalPanelOrigin(undefined), true);
  });
});