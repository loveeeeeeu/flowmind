import { ApiRequestError } from '../../api/client';

/**
 * The user is debugging their configuration: say what is wrong and where to look. Codes without
 * an entry (INVALID_REQUEST, PROVIDER_ERROR) show the API message, which quotes the provider.
 */
const PROVIDER_ERROR_TEXT: Record<string, string> = {
  AUTH_ERROR: '认证失败：API Key 无效、已过期或没有权限。',
  INSUFFICIENT_BALANCE: '供应商账户余额不足。',
  RATE_LIMIT: '请求过于频繁，被供应商限流了，请稍后再试。',
  TIMEOUT: '连接超时（10 秒内没有响应），请检查 Base URL 和网络。',
  NETWORK_ERROR: '无法连接到供应商：请检查 Base URL 是否正确、服务是否可访问。',
  ENDPOINT_NOT_FOUND:
    '供应商返回 404：Base URL 可能不对（OpenAI 兼容地址通常以 /v1 结尾），或该服务不提供模型列表接口。',
  INVALID_PROVIDER_RESPONSE: '供应商返回的不是标准的模型列表，可能不是 OpenAI 兼容服务。',
  PROVIDER_UNAVAILABLE: '供应商服务暂时不可用，请稍后再试。',
  CREDENTIAL_REVOKED: '凭证已撤销。',
  CREDENTIAL_DECRYPTION_ERROR: '无法解密已保存的密钥：服务器的加密主密钥可能被更换过，请重新填写密钥。',
  CREDENTIAL_BASE_URL_REQUIRED: '这个凭证需要填写 Base URL。',
};

export function describeProviderError(error: Error) {
  const text = error instanceof ApiRequestError && error.code ? PROVIDER_ERROR_TEXT[error.code] : undefined;

  return text ?? error.message;
}
