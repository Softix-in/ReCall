export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

type EnvLike = {
  EXPO_PUBLIC_API_URL?: string;
};

export function getApiBaseUrl(env: EnvLike = process.env): string {
  const raw = env.EXPO_PUBLIC_API_URL?.trim() ?? '';

  if (!raw) {
    throw new ConfigError('EXPO_PUBLIC_API_URL is required');
  }

  return raw.replace(/\/+$/, '');
}

export const DEFAULT_API_URL = 'https://recall-app.centralindia.cloudapp.azure.com';
