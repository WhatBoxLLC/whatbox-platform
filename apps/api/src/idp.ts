// Apple and Google sign-in: verify the ID token the app got from the provider.
// Each site has its own client IDs (its own branded app), configured in OAUTH_CLIENTS_JSON:
//   {"site_afterh": {"google": ["<web id>.apps.googleusercontent.com", "<ios id>..."], "apple": ["com.whatbox.afterh"]}}
import type { IdTokenVerifier, Site } from '@whatbox/core';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { config } from './config';

const ISSUERS = {
  google: ['https://accounts.google.com', 'accounts.google.com'],
  apple: ['https://appleid.apple.com'],
} as const;

const JWKS = {
  google: createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs')),
  apple: createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys')),
};

type Clients = Record<string, Partial<Record<'google' | 'apple', string[]>>>;

export class JwksIdTokenVerifier implements IdTokenVerifier {
  constructor(private clients: Clients) {}
  async verify(site: Site, provider: 'apple' | 'google', idToken: string) {
    const audience = this.clients[site.id]?.[provider];
    if (!audience?.length) throw new Error(`${provider} sign-in is not configured for ${site.id}`);
    const { payload } = await jwtVerify(idToken, JWKS[provider], {
      issuer: [...ISSUERS[provider]], audience, algorithms: ['RS256', 'ES256'], clockTolerance: 30,
    });
    if (typeof payload.sub !== 'string' || !payload.sub) throw new Error('No subject');
    const email = typeof payload.email === 'string' ? payload.email : undefined;
    // Apple sends email_verified as a string; Google as a boolean.
    const emailVerified = payload.email_verified === true || payload.email_verified === 'true';
    return { sub: payload.sub, email, emailVerified };
  }
}

export function createIdTokenVerifier(): IdTokenVerifier | undefined {
  if (!config.oauthClientsJson) return undefined;
  return new JwksIdTokenVerifier(JSON.parse(config.oauthClientsJson));
}
