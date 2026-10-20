import { randomUUID } from 'node:crypto';

type JsonObject = Record<string, unknown>;

export interface BankPreferences {
  source: 'Plaid Sandbox';
  mode: 'sandbox';
  fetchedAt: string;
  currency: string;
  period: { start: string; end: string; days: number };
  dailyFood: number;
  dailyTransport: number;
  foodTransactions: number;
  transportTransactions: number;
  itemRemoved: true;
}

export class BankError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = 'BankError';
  }
}

export function bankReadiness() {
  const configured = Boolean(process.env.PLAID_CLIENT_ID?.trim() && process.env.PLAID_SANDBOX_SECRET?.trim());
  const enabled = configured && process.env.TRIPPIN_BANK_SANDBOX_ENABLED === 'true';
  return { source: 'Plaid Sandbox', mode: 'sandbox', enabled, configured, status: enabled ? 'sandbox_configured' : 'setup_required', realBankLinking: false };
}

function object(value: unknown): JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
}

function credentials() {
  if (!bankReadiness().enabled) throw new BankError(503, 'setup_required', 'The Plaid Sandbox preview needs server credentials and explicit enablement. Real bank connections are not available.');
  return { client_id: process.env.PLAID_CLIENT_ID!.trim(), secret: process.env.PLAID_SANDBOX_SECRET!.trim() };
}

async function plaid(path: '/link/token/create' | '/item/public_token/exchange' | '/transactions/get' | '/item/remove', values: JsonObject): Promise<JsonObject> {
  try {
    // There is deliberately no environment switch or caller-supplied provider URL.
    const response = await fetch(`https://sandbox.plaid.com${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Plaid-Version': '2020-09-14' },
      body: JSON.stringify({ ...credentials(), ...values }),
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(6000),
    });
    if (!response.body) throw new Error('Empty response');
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let raw = '', bytes = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 2_000_000) { await reader.cancel(); throw new Error('Response too large'); }
        raw += decoder.decode(value, { stream: true });
      }
      raw += decoder.decode();
    } finally { reader.releaseLock(); }
    const data = object(JSON.parse(raw));
    if (!response.ok || data.error_code) {
      if (data.error_code === 'PRODUCT_NOT_READY') throw new BankError(409, 'data_not_ready', 'Plaid has not prepared the Sandbox transactions yet. No preferences were imported. Try a new Sandbox preview later.');
      if (response.status === 429) throw new BankError(429, 'rate_limited', 'The Sandbox request limit has been reached. Try again later.');
      throw new BankError(502, 'sandbox_unavailable', 'Plaid Sandbox could not complete this request. Check the Sandbox setup or try again later.');
    }
    return data;
  } catch (error) {
    if (error instanceof BankError) throw error;
    if (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)) throw new BankError(504, 'sandbox_timeout', 'Plaid Sandbox took too long to respond. No preferences were imported.');
    throw new BankError(502, 'sandbox_unavailable', 'Plaid Sandbox is temporarily unavailable. No preferences were imported.');
  }
}

export async function createBankLink() {
  const data = await plaid('/link/token/create', {
    client_name: 'Trippin Sandbox', language: 'en', country_codes: ['US'],
    user: { client_user_id: `sandbox-${randomUUID()}` },
    products: ['transactions'], transactions: { days_requested: 31 },
    enable_multi_item_link: false,
  });
  if (typeof data.link_token !== 'string' || !/^link-sandbox-[a-zA-Z0-9-]{20,160}$/.test(data.link_token)) throw new BankError(502, 'invalid_sandbox_response', 'Plaid did not provide a valid Sandbox session.');
  return { source: 'Plaid Sandbox', mode: 'sandbox', linkToken: data.link_token };
}

export async function analyseBankPreferences(publicToken: unknown): Promise<BankPreferences> {
  if (typeof publicToken !== 'string' || !/^public-sandbox-[a-zA-Z0-9-]{20,160}$/.test(publicToken)) throw new BankError(400, 'invalid_sandbox_token', 'Complete a Plaid Sandbox session before requesting a preview.');
  let accessToken: string | undefined;
  try {
    const exchanged = await plaid('/item/public_token/exchange', { public_token: publicToken });
    if (typeof exchanged.access_token !== 'string' || !/^access-sandbox-[a-zA-Z0-9-]{20,160}$/.test(exchanged.access_token)) throw new BankError(502, 'invalid_sandbox_response', 'Plaid did not provide a valid Sandbox connection.');
    accessToken = exchanged.access_token;
    const today = new Date().setUTCHours(0, 0, 0, 0), day = 86_400_000;
    const start = new Date(today - 30 * day).toISOString().slice(0, 10);
    const end = new Date(today - day).toISOString().slice(0, 10);
    const data = await plaid('/transactions/get', {
      access_token: accessToken, start_date: start, end_date: end,
      options: { count: 500, offset: 0, include_original_description: false, personal_finance_category_version: 'v2' },
    });
    if (!Array.isArray(data.transactions) || typeof data.total_transactions !== 'number' || !Number.isInteger(data.total_transactions) || data.total_transactions < 0) throw new BankError(502, 'invalid_sandbox_response', 'Plaid did not return readable Sandbox transactions.');
    if (data.total_transactions !== data.transactions.length) throw new BankError(422, 'preview_limit', 'This Sandbox account exceeds the 500-transaction preview limit. No partial recommendations were created.');
    let food = 0, transport = 0, foodCount = 0, transportCount = 0;
    let currency: string | undefined;
    for (const value of data.transactions) {
      const transaction = object(value);
      if (transaction.pending !== false || typeof transaction.amount !== 'number' || !Number.isFinite(transaction.amount) || transaction.amount <= 0) continue;
      if (typeof transaction.date !== 'string' || transaction.date < start || transaction.date > end) continue;
      const category = object(transaction.personal_finance_category).primary;
      if (category !== 'FOOD_AND_DRINK' && category !== 'TRANSPORTATION') continue;
      const code = transaction.iso_currency_code;
      if (typeof code !== 'string' || !/^[A-Z]{3}$/.test(code) || transaction.unofficial_currency_code || (currency && currency !== code)) throw new BankError(422, 'currency_not_supported', 'This preview needs food and transport transactions in one official currency. No currencies were combined.');
      currency = code;
      if (category === 'FOOD_AND_DRINK') { food += transaction.amount; foodCount++; }
      else { transport += transaction.amount; transportCount++; }
    }
    if (!currency || !foodCount || !transportCount) throw new BankError(422, 'insufficient_data', 'This Sandbox account does not have enough categorized food and transport spending for both recommendations. No preferences were imported.');
    const dailyFood = Math.round(food / 30 * 100) / 100, dailyTransport = Math.round(transport / 30 * 100) / 100;
    if (![dailyFood, dailyTransport].every(value => Number.isFinite(value) && value > 0 && value <= 10000)) throw new BankError(422, 'invalid_recommendation', 'The Sandbox spending totals cannot produce usable daily preferences.');
    return { source: 'Plaid Sandbox', mode: 'sandbox', fetchedAt: new Date().toISOString(), currency, period: { start, end, days: 30 }, dailyFood, dailyTransport, foodTransactions: foodCount, transportTransactions: transportCount, itemRemoved: true };
  } finally {
    // A successful return is released only after removal succeeds; neither tokens nor
    // transaction records are persisted, sent to the client, or passed to the AI.
    if (accessToken) {
      try { await plaid('/item/remove', { access_token: accessToken }); }
      catch { throw new BankError(502, 'cleanup_unconfirmed', 'Sandbox removal could not be confirmed. No preferences were imported. Remove the test connection in your Plaid Sandbox dashboard before trying again.'); }
      finally { accessToken = undefined; }
    }
  }
}
