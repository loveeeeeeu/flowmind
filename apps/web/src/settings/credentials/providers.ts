import type { CredentialProvider } from '../../types/credential';

interface ProviderOption {
  value: CredentialProvider;
  label: string;
  /** Shown as placeholder; null when the user must type the address. */
  officialBaseUrl: string | null;
}

export const CREDENTIAL_PROVIDERS: ProviderOption[] = [
  { value: 'OPENAI', label: 'OpenAI', officialBaseUrl: 'https://api.openai.com/v1' },
  { value: 'DEEPSEEK', label: 'DeepSeek', officialBaseUrl: 'https://api.deepseek.com' },
  { value: 'OPENAI_COMPATIBLE', label: 'OpenAI 兼容服务', officialBaseUrl: null },
];

export function getProviderOption(provider: CredentialProvider) {
  return CREDENTIAL_PROVIDERS.find((option) => option.value === provider) ?? CREDENTIAL_PROVIDERS[0];
}
