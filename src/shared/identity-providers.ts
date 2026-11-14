/**
 * Identity-provider (IdP) sign-in hosts. FamiliAI never shows the dock on these pages,
 * even if the user grants permission: they exist to collect credentials, and keeping the
 * extension off them is both safer and easier to explain in a Chrome Web Store review.
 *
 * SSO (Single Sign-On) policy for M1: the dock lives only on sites the user enables; when a
 * Log in click lands on one of these hosts, the dock simply isn't there. Linked first-party
 * auth subdomains (for example accounts.teamsnap.com) are an M2 topic.
 */
import { hostMatches } from './dsl';

export const IDENTITY_PROVIDER_HOSTS: readonly string[] = [
  // Google
  'accounts.google.com',
  // Microsoft
  'login.microsoftonline.com',
  'login.microsoft.com',
  'login.live.com',
  'account.live.com',
  // Apple ID (also matched by the *.apple.com site mapping, so the block list must win)
  'appleid.apple.com',
  'idmsa.apple.com',
  'account.apple.com',
  // OpenAI (ChatGPT sign-in)
  'auth.openai.com',
  // Workforce and developer IdPs
  '*.okta.com',
  '*.oktapreview.com',
  '*.okta-emea.com',
  '*.auth0.com',
  '*.onelogin.com',
  '*.pingone.com',
  '*.pingidentity.com',
  '*.duosecurity.com',
  '*.b2clogin.com',
  // Consumer IdPs
  'login.yahoo.com',
  'id.atlassian.com',
];

export function isIdentityProvider(hostname: string): boolean {
  return IDENTITY_PROVIDER_HOSTS.some((pattern) => hostMatches(pattern, hostname));
}
