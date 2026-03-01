export interface ProfileConfig {
  provider: string;
  model: string;
  apiKey: string;
  customEndpoint: string;
  extraHeaders: Record<string, string>;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  contextLimit: number;
  timeout: number;
  enableScreenshots: boolean;
  sendScreenshotsAsImages: boolean;
  screenshotQuality: 'high' | 'low';
  showThinking: boolean;
  streamResponses: boolean;
  autoScroll: boolean;
  confirmActions: boolean;
  saveHistory: boolean;
}

export const DEFAULT_PROFILE: ProfileConfig = {
  provider: '',
  model: '',
  apiKey: '',
  customEndpoint: '',
  extraHeaders: {},
  systemPrompt: '',
  temperature: 0.7,
  maxTokens: 4096,
  contextLimit: 200000,
  timeout: 30000,
  enableScreenshots: true,
  sendScreenshotsAsImages: false,
  screenshotQuality: 'high',
  showThinking: true,
  streamResponses: true,
  autoScroll: true,
  confirmActions: true,
  saveHistory: true,
};

export function createProfile(overrides: Partial<ProfileConfig> = {}): ProfileConfig {
  return { ...DEFAULT_PROFILE, ...overrides };
}

export function resolveProfile(
  configs: Record<string, Partial<ProfileConfig>>,
  name: string,
  fallback?: Partial<ProfileConfig>,
): ProfileConfig {
  const base = fallback || {};
  const profile = configs[name] || {};
  return { ...DEFAULT_PROFILE, ...base, ...profile };
}
