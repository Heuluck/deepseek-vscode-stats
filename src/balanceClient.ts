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
  } finally {
    clearTimeout(timeout);
  }
}

/** 优先取人民币账户，否则取第一条。 */
export function pickBalanceInfo(res: BalanceResponse): BalanceInfo | undefined {
  const infos = res.balance_infos || [];
  return infos.find((i) => i.currency === 'CNY') || infos[0];
}
