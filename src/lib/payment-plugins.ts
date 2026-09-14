// Stub — full implementation was not committed to git by upstream

export const UNOFFICIAL_BADGE = "⚠️ Unofficial";

const COMMUNITY_PROVIDERS = ["bkash", "nagad", "rocket", "upay", "tap", "mpesa"];

export function isCommunityPlugin(provider: string): boolean {
  return COMMUNITY_PROVIDERS.includes(provider.toLowerCase());
}

export function pluginNotice(provider: string): string {
  if (isCommunityPlugin(provider)) {
    return `${UNOFFICIAL_BADGE} ${provider} is a community-maintained plugin. Use at your own risk.`;
  }
  return `${provider} is an official integration.`;
}

export function communityPlugin(provider: string): {
  provider: string;
  unofficial: boolean;
  notice: string;
} {
  return {
    provider,
    unofficial: isCommunityPlugin(provider),
    notice: pluginNotice(provider),
  };
}
