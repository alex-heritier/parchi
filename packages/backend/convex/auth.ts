import GitHub from '@auth/core/providers/github';
import Google from '@auth/core/providers/google';
import { convexAuth } from '@convex-dev/auth/server';
import { Password } from '@convex-dev/auth/providers/Password';

const providers: any[] = [Password()];

if (process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET) {
  providers.push(
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
    }),
  );
}

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  );
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers,
});
