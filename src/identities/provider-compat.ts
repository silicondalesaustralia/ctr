import { ProfileProvider, type Identity } from "@prisma/client";
import { getEnv } from "../config/env.js";

/** ProfileProvider recorded on identities created under the configured browser provider. */
export function activeProfileProvider(): ProfileProvider {
  const provider = getEnv().BROWSER_PROFILE_PROVIDER;
  if (provider === "gologin") return ProfileProvider.gologin;
  if (provider === "camoufox") return ProfileProvider.camoufox;
  if (provider === "multilogin") return ProfileProvider.multilogin;
  return ProfileProvider.mock;
}

/**
 * Under Camoufox only Camoufox identities can launch (legacy GoLogin profiles have no
 * pinned fingerprint). Other modes keep their historical behaviour.
 */
export function isIdentityRunnable(identity: Pick<Identity, "profileProvider">): boolean {
  const active = activeProfileProvider();
  return active !== ProfileProvider.camoufox || identity.profileProvider === active;
}
