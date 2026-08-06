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
      throw new Error(`查询失败 HTTP ${res.status}${body ? `: ${body}` : ''}`);
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
  if (err instanceof Error && err.name === 'AbortError') {
    return new Error('请求超时（15 秒未响应），请检查网络后重试');
  }
  // Node 内置 fetch 网络失败统一抛 TypeError，真实原因（DNS/连接等）在 cause 链里
  if (err instanceof TypeError) {
    let cause: unknown = err;
    while (cause instanceof Error && cause.cause) {
      cause = cause.cause;
    }
    const m = (cause instanceof Error ? cause.message : String(cause)).toLowerCase();
    if (m.includes('enotfound') || m.includes('getaddrinfo') || m.includes('eai_again')) {
      return new Error('无法连接 DeepSeek 服务器（域名解析失败），请检查网络');
    }
    if (m.includes('etimedout') || m.includes('timeout') || m.includes('econnaborted')) {
      return new Error('连接 DeepSeek 服务器超时，请检查网络');
    }
    if (m.includes('econnrefused')) {
      return new Error('连接 DeepSeek 服务器被拒绝，请检查网络或稍后重试');
    }
    if (m.includes('econnreset') || m.includes('epipe')) {
      return new Error('与 DeepSeek 服务器的连接被重置，请检查网络');
    }
    return new Error('网络请求失败，请检查网络连接');
  }
  return err instanceof Error ? err : new Error(String(err));
}

/** 优先取人民币账户，否则取第一条。 */
export function pickBalanceInfo(res: BalanceResponse): BalanceInfo | undefined {
  const infos = res.balance_infos || [];
  return infos.find((i) => i.currency === 'CNY') || infos[0];
}
