'use client';

import { useEffect, useRef, useState } from 'react';
import type { BankPreferences as Preferences } from '@/lib/bank';

type LinkHandler = { open: () => void; destroy: () => void };
type LinkSdk = { create: (options: { token: string; onSuccess: (token: string | null) => void; onExit: (error: unknown) => void }) => LinkHandler };
declare global { interface Window { Plaid?: LinkSdk } }

let scriptPromise: Promise<LinkSdk> | null = null;

function loadPlaid(): Promise<LinkSdk> {
  if (window.Plaid) return Promise.resolve(window.Plaid);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<LinkSdk>((resolve, reject) => {
    const script = document.createElement('script');
    const fail = () => { clearTimeout(timeout); script.remove(); reject(new Error('Plaid Sandbox could not load. Check your connection and try again.')); };
    const timeout = window.setTimeout(fail, 15000);
    script.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';
    script.async = true;
    script.onload = () => { clearTimeout(timeout); if (window.Plaid) resolve(window.Plaid); else fail(); };
    script.onerror = fail;
    document.head.appendChild(script);
  }).catch(error => { scriptPromise = null; throw error; });
  return scriptPromise;
}

async function bankRequest(value: Record<string, unknown>) {
  const response = await fetch('/api/bank', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'The Sandbox preview is unavailable.');
  return data;
}

function isPreferences(value: unknown): value is Preferences {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<Preferences>;
  return data.mode === 'sandbox' && data.source === 'Plaid Sandbox' && data.itemRemoved === true && typeof data.currency === 'string' && /^[A-Z]{3}$/.test(data.currency) && typeof data.dailyFood === 'number' && Number.isFinite(data.dailyFood) && data.dailyFood > 0 && typeof data.dailyTransport === 'number' && Number.isFinite(data.dailyTransport) && data.dailyTransport > 0 && data.period?.days === 30;
}

export default function BankPreferences({ onApply }: { onApply: (food: number, transport: number) => void }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [consent, setConsent] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'loading' | 'opening' | 'analysing'>('idle');
  const [error, setError] = useState('');
  const [result, setResult] = useState<Preferences | null>(null);
  const [rate, setRate] = useState('');
  const [applied, setApplied] = useState(false);
  const handler = useRef<LinkHandler | null>(null), mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    void fetch('/api/bank', { cache: 'no-store' }).then(response => {
      if (!response.ok) throw new Error('Readiness unavailable');
      return response.json();
    }).then(data => { if (mounted.current) setEnabled(data.enabled === true && data.mode === 'sandbox'); }).catch(() => { if (mounted.current) { setEnabled(false); setError('The Sandbox connection status could not be checked.'); } });
    return () => { mounted.current = false; handler.current?.destroy(); handler.current = null; };
  }, []);

  async function analyse(publicToken: string | null) {
    if (!publicToken) { setError('Plaid did not provide a Sandbox session. No preferences were imported.'); setPhase('idle'); return; }
    setPhase('analysing');
    try {
      const data: unknown = await bankRequest({ action: 'analyse', consent: true, publicToken });
      if (!isPreferences(data)) throw new Error('The Sandbox returned an unreadable preview. No preferences were imported.');
      if (mounted.current) { setResult(data); setRate(''); setApplied(false); }
    } catch (value) { if (mounted.current) setError(value instanceof Error ? value.message : 'The Sandbox preview failed.'); }
    finally { handler.current?.destroy(); handler.current = null; if (mounted.current) setPhase('idle'); }
  }

  async function connect() {
    if (!consent || !enabled || phase !== 'idle') return;
    setPhase('loading'); setError(''); setResult(null); setApplied(false);
    try {
      const sdk = await loadPlaid();
      if (!mounted.current) return;
      const session = await bankRequest({ action: 'create_link', consent: true });
      if (!mounted.current) return;
      if (session.mode !== 'sandbox' || typeof session.linkToken !== 'string' || !session.linkToken.startsWith('link-sandbox-')) throw new Error('Plaid did not provide a Sandbox session.');
      handler.current?.destroy();
      handler.current = sdk.create({
        token: session.linkToken,
        onSuccess: token => { void analyse(token); },
        onExit: linkError => { handler.current?.destroy(); handler.current = null; if (mounted.current) { setPhase('idle'); if (linkError) setError('The Sandbox session ended without a preview. Please try again.'); } },
      });
      setPhase('opening'); handler.current.open();
    } catch (value) { if (mounted.current) { setPhase('idle'); setError(value instanceof Error ? value.message : 'The Sandbox could not open.'); } }
  }

  const conversion = result?.currency === 'EUR' ? 1 : Number(rate);
  const food = result ? Math.round(result.dailyFood * conversion * 100) / 100 : 0;
  const transport = result ? Math.round(result.dailyTransport * conversion * 100) / 100 : 0;
  const canApply = !!result && Number.isFinite(conversion) && conversion > 0 && [food, transport].every(value => Number.isFinite(value) && value > 0 && value <= 10000);

  return <section className="provider-panel bank-preferences" aria-label="Sandbox spending preferences">
    <div className="section-heading"><div><h2>Spending that feels like you.</h2><p><strong>Plaid Sandbox · test data only</strong></p></div></div>
    <p>Preview food and transport preferences using a simulated bank account. Real bank linking is unavailable. Use only Plaid test credentials.</p>
    {enabled === null ? <p role="status">Checking Sandbox availability…</p> : !enabled ? <div className="integration-notice"><p>Add Plaid Sandbox credentials and enable the Sandbox preview on the server to try this connection. You can keep entering spending preferences manually.</p></div> : <>
      <label className="bank-consent"><input type="checkbox" checked={consent} disabled={phase !== 'idle'} onChange={event => setConsent(event.target.checked)}/>I agree to load Plaid’s external Sandbox and let Trippin temporarily analyse test transactions for a spending preview.</label>
      <p className="estimate-note">Choose a non-OAuth test institution such as First Platypus Bank. Use <code>user_transactions_dynamic</code> and any non-empty test password. Never enter real bank credentials.</p>
      <button className="secondary" type="button" disabled={!consent || phase !== 'idle'} onClick={() => { void connect(); }}>{phase === 'loading' ? 'Loading Sandbox…' : phase === 'opening' ? 'Sandbox is open…' : phase === 'analysing' ? 'Analysing test spending…' : 'Preview with Plaid Sandbox'}</button>
    </>}
    {phase === 'analysing' && <p role="status">Creating an aggregate preview and removing the test connection…</p>}
    {error && <p role="alert" className="form-error">{error}</p>}
    {result && <div className="provider-results">
      <p><strong>Sandbox daily averages</strong> · {result.currency} {result.dailyFood.toFixed(2)} food · {result.currency} {result.dailyTransport.toFixed(2)} transport</p>
      <p>{result.period.start} to {result.period.end} · {result.foodTransactions} food and {result.transportTransactions} transport outflows, divided by 30 calendar days. Pending transactions, refunds, and other categories are excluded.</p>
      {result.currency !== 'EUR' && <label>EUR for one {result.currency} · enter your own conversion rate<input type="number" min="0.000001" max="1000000" step="any" value={rate} onChange={event => { setRate(event.target.value); setApplied(false); }}/></label>}
      {canApply && <p>Apply €{food.toFixed(2)} food and €{transport.toFixed(2)} transport per day to your preferences.</p>}
      <button type="button" className="primary" disabled={!canApply || applied} onClick={() => { if (canApply) { onApply(food, transport); setApplied(true); } }}>{applied ? 'Preferences applied' : 'Apply these Sandbox preferences'}</button>
      {applied && <p role="status">Daily preferences updated. No trip expenses were imported.</p>}
      <p className="estimate-note">The test connection was removed. Trippin retained no access token or transaction records. Only these two amounts are saved if you apply them.</p>
    </div>}
  </section>;
}
