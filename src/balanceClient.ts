import { t } from './i18n';

export interface BalanceInfo {
  currency: string;
  total_balance: string;
  granted_balance: string;
  topped_up_balance: string;
}

export interface BalanceResponse {
  is_available: boolean;
  balance_infos: BalanceInfo[];
}

/** 带 HTTP 状态码的错误：用于区分「API Key 无效（401）」与普通失败。 */
export class ApiHttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'ApiHttpError';
  }
}

/** 401 = API Key 无效（其余 HTTP 错误/网络错误都不是 key 的问题）。 */
export function isInvalidKeyError(err: unknown): boolean {
  return err instanceof ApiHttpError && err.status === 401;
}

/**
 * 查询 DeepSeek 账户余额。
 * 官方接口：GET https://api.deepseek.com/user/balance
 */
export async function fetchBalance(apiKey: string): Promise<BalanceResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch('https://api.deepseek.com/user/balance', {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 300);
      throw new ApiHttpError(res.status, `查询失败 HTTP ${res.status}${body ? `: ${body}` : ''}`);
    }
    return (await res.json()) as BalanceResponse;
  } catch (err) {
    throw translateFetchError(err);
  } finally {
    clearTimeout(timeout);
  }
}

/** 把 fetch 的网络层错误翻译为用户可读的中文（HTTP/业务错误原样保留）。 */
function translateFetchError(err: unknown): Error {
  // 401：API Key 无效——保留 status 供 isInvalidKeyError 识别
  if (err instanceof ApiHttpError && err.status === 401) {
    return new ApiHttpError(401, t('balance.invalidKey'));
  }
  if (err instanceof Error && err.name === 'AbortError') {
    return new Error(t('balance.timeout'));
  }
  // Node 内置 fetch 网络失败统一抛 TypeError，真实原因（DNS/连接等）在 cause 链里
  if (err instanceof TypeError) {
    let cause: unknown = err;
    while (cause instanceof Error && cause.cause) {
      cause = cause.cause;
    }
    const m = (cause instanceof Error ? cause.message : String(cause)).toLowerCase();
    if (m.includes('enotfound') || m.includes('getaddrinfo') || m.includes('eai_again')) {
      return new Error(t('balance.dns'));
    }
    if (m.includes('etimedout') || m.includes('timeout') || m.includes('econnaborted')) {
      return new Error(t('balance.connectTimeout'));
    }
    if (m.includes('econnrefused')) {
      return new Error(t('balance.refused'));
    }
    if (m.includes('econnreset') || m.includes('epipe')) {
      return new Error(t('balance.reset'));
    }
    return new Error(t('balance.network'));
  }
  return err instanceof Error ? err : new Error(String(err));
}

/** 返回全部币种账户（CNY/USD…）。 */
export function pickBalanceInfos(res: BalanceResponse): BalanceInfo[] {
  return res.balance_infos || [];
}
