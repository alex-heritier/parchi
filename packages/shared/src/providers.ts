export type ProviderInstanceAuthType = 'api-key' | 'oauth' | 'managed';

export interface ProviderModelEntry {
  id: string;
  label?: string;
  contextWindow?: number;
  supportsVision?: boolean;
  addedManually?: boolean;
}

export interface ProviderInstance {
  id: string;
  name: string;
  providerType: string;
  authType: ProviderInstanceAuthType;
  apiKey?: string;
  customEndpoint?: string;
  extraHeaders?: Record<string, string>;
  oauthProviderKey?: string;
  oauthEmail?: string;
  oauthError?: string;
  isConnected: boolean;
  models: ProviderModelEntry[];
  supportsImages?: boolean;
  createdAt: number;
  updatedAt: number;
  source?: 'migration' | 'manual' | 'oauth-sync' | 'factory';
}
