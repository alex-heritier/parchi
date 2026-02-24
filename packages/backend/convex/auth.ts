import GitHub from '@auth/core/providers/github';
import Google from '@auth/core/providers/google';
import { Password } from '@convex-dev/auth/providers/Password';
import { convexAuth } from '@convex-dev/auth/server';

const hasGitHubProviderCredentials = Boolean(process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET);
const hasGoogleProviderCredentials = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
const configuredSiteUrl = String(process.env.SITE_URL || '').trim().replace(/\/+$/, '');

const CHROMIUM_EXTENSION_REDIRECT = /^https:\/\/[a-z0-9]{32}\.chromiumapp\.org\/.*$/i;
const FIREFOX_EXTENSION_REDIRECT = /^https:\/\/[a-z0-9-]+\.extensions\.(?:allizom|mozilla)\.org\/.*$/i;

const isAllowedExtensionRedirect = (redirectTo: string) =>
  CHROMIUM_EXTENSION_REDIRECT.test(redirectTo) || FIREFOX_EXTENSION_REDIRECT.test(redirectTo);

const resolveRedirectTarget = async ({ redirectTo }: { redirectTo: string }) => {
  if (isAllowedExtensionRedirect(redirectTo)) {
    return redirectTo;
  }

  if (!configuredSiteUrl) {
    throw new Error('Missing SITE_URL for OAuth redirect validation');
  }

  if (redirectTo.startsWith('?') || redirectTo.startsWith('/')) {
    return `${configuredSiteUrl}${redirectTo}`;
  }

  if (redirectTo === configuredSiteUrl || redirectTo.startsWith(`${configuredSiteUrl}/`)) {
    return redirectTo;
  }

  throw new Error(`Invalid redirectTo ${redirectTo} for configured SITE_URL: ${configuredSiteUrl}`);
};

const providers = [
  Password(),
  ...(hasGitHubProviderCredentials
    ? [
        GitHub({
          clientId: process.env.AUTH_GITHUB_ID,
          clientSecret: process.env.AUTH_GITHUB_SECRET,
        }),
      ]
    : []),
  ...(hasGoogleProviderCredentials
    ? [
        Google({
          clientId: process.env.AUTH_GOOGLE_ID,
          clientSecret: process.env.AUTH_GOOGLE_SECRET,
        }),
      ]
    : []),
];

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers,
  callbacks: {
    redirect: resolveRedirectTarget,
  },
});
