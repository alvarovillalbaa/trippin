'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowUpRight, CalendarDays, MapPin, Plus, Route, Wallet, LogOut } from 'lucide-react';
import Workspace from './workspace';
import Dialog from './dialog';
import NewTripForm from './new-trip-form';
import { accountWorkspaceKey, readAccountWorkspace, saveAccountWorkspace, restoreAccountWorkspace,
  captureAccountWorkspaceRecovery, recoverAccountWorkspace, accountWorkspaceRecoveryArchives,
  type AccountUser, type AccountWorkspaceRecoveryTicket } from '@/lib/account-workspace';
import { initialWorkspace, importSharedPlan, parseWorkspaceBackup, MAX_BACKUP_FILE_BYTES, isTrip, makeId, publicTripSnapshot, formatDate } from '@/lib/trip';
import type { Trip, WorkspaceState } from '@/lib/types';

type Auth = { available: boolean; user: AccountUser | null; message?: string; error?: string };
class AccountReplyError extends Error {
  readonly uncertain: boolean;
  constructor(message: string, uncertain = false) { super(message); this.uncertain = uncertain; }
}
async function accountRequest(body: object): Promise<Auth> {
  let response: Response;
  try { response = await fetch('/api/auth', { method: 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20000), body: JSON.stringify(body) }); }
  catch { throw new AccountReplyError('The account response was not received. Its outcome is not confirmed.', true); }
  let data: Record<string, unknown>;
  try { const value: unknown = await response.json(); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); data = value as Record<string, unknown>; }
  catch { throw new AccountReplyError('The account response could not be read. Its outcome is not confirmed.', true); }
  if (!response.ok) throw new AccountReplyError(typeof data.error === 'string' ? data.error : 'The account request could not be completed.', response.status >= 500 || response.status === 408);
  if (typeof data.available !== 'boolean' || ['access_token', 'refresh_token', 'password'].some(key => Object.hasOwn(data, key))
    || data.user !== null && (!data.user || typeof data.user !== 'object' || typeof (data.user as AccountUser).id !== 'string' || typeof (data.user as AccountUser).name !== 'string' || typeof (data.user as AccountUser).email !== 'string')
    || !data.available && data.user !== null) throw new AccountReplyError('The account response was incomplete. Its outcome is not confirmed.', true);
  const user = data.user as AccountUser | null;
  try { accountWorkspaceKey(user); } catch { throw new AccountReplyError('The account identity was incomplete. Its outcome is not confirmed.', true); }
  const action = (body as { action?: string }).action;
  if (action === 'logout' && user !== null || action === 'login' && user === null) throw new AccountReplyError('The account action was not confirmed.', true);
  return { available: data.available, user, ...(typeof data.message === 'string' ? { message: data.message } : {}), ...(typeof data.error === 'string' ? { error: data.error } : {}) };
}

export default function TravelApp() {
  const [auth, setAuth] = useState<Auth>({ available: false, user: null });
  const [loading, setLoading] = useState(true), [pending, setPending] = useState(false);
  const [workspace, setWorkspace] = useState<WorkspaceState | null>(null), [inTrip, setInTrip] = useState(false);
  const [sharedPlan, setSharedPlan] = useState<{tripId: string; hash: string} | undefined>(undefined);
  const [form, setForm] = useState<'login' | 'signup' | 'trip' | null>(null);
  const [notice, setNotice] = useState(''), [error, setError] = useState('');
  const [accountUncertain, setAccountUncertain] = useState(false);
  const [incoming, setIncoming] = useState(false);
  const [recovery, setRecovery] = useState<{ ticket: AccountWorkspaceRecoveryTicket; workspace: WorkspaceState; generation: number; read: number } | null>(null);
  const [recoveryArchiveCount, setRecoveryArchiveCount] = useState(0);
  const backup = useRef<HTMLInputElement>(null), epoch = useRef(0), working = useRef(false);
  const authForm = useRef<HTMLFormElement>(null);
  const backupReadGeneration = useRef(0);
  const renderAccountEpoch = epoch.current;
  useEffect(() => {
    if (form === 'login' || form === 'signup') authForm.current?.querySelector<HTMLInputElement>('input:not([disabled])')?.focus();
  }, [form]);
  function showForm(value: 'login' | 'signup' | 'trip') {
    backupReadGeneration.current++; setRecovery(null); setForm(value);
  }
  function openSavedTrip(trip: Trip) {
    if (!workspace) return;
    backupReadGeneration.current++; setWorkspace({ ...workspace, selectedTripId: trip.id }); setInTrip(true);
  }
  function load(user: AccountUser | null) {
    setRecovery(null);
    try { setRecoveryArchiveCount(accountWorkspaceRecoveryArchives(localStorage, user).length); }
    catch { setRecoveryArchiveCount(0); }
    try { const value = readAccountWorkspace(localStorage, user); setWorkspace(value); return value; }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Saved trips could not be opened.'); setWorkspace(null); return null; }
  }
  useEffect(() => {
    let active = true;
    const publicId = new URLSearchParams(window.location.search).get('trip');
    setIncoming(window.location.hash.startsWith('#plan=') || Boolean(publicId && /^[a-zA-Z0-9_-]{1,80}$/.test(publicId)));
    // Confirmation links may carry provider tokens. This client never accepts
    // them as a session; remove the fragment and ask for a normal login.
    if (/^#(?:access_token|error)=/.test(window.location.hash)) {
      const confirmationFailed = window.location.hash.startsWith('#error=');
      history.replaceState(history.state, '', window.location.pathname + window.location.search);
      if (confirmationFailed) {
        setNotice('');
        setError('This confirmation link may have expired or already been used. If you already confirmed your email, try Log in. Otherwise, open your latest confirmation email.');
      } else setNotice('Return to Log in after confirming your email.');
    }
    void accountRequest({ action: 'session' }).then(value => {
      if (!active) return; setAuth(value); setAccountUncertain(false); load(value.user);
    }).catch(() => { if (active) { setAccountUncertain(true); setError('Account status could not be checked. Retry before signing in, or plan without an account.'); load(null); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; epoch.current++; };
  }, []);
  async function recoverAccount(generation: number, action: 'login' | 'signup' | 'logout' | 'status') {
    const value = await accountRequest({ action: 'session' });
    if (generation !== epoch.current) return;
    setAuth(value); setAccountUncertain(false); const opened = load(value.user); setInTrip(false); setForm(null); setSharedPlan(undefined);
    if (!opened) return;
    if (action === 'logout' && value.user) {
      setError('Sign-out was not confirmed. Your account is still signed in; try Log out again.');
    } else {
      setError(''); setNotice(action === 'logout'
        ? 'This browser is signed out. The earlier reply was lost; remote revocation is not confirmed.'
        : action === 'status' ? 'Account status checked.'
        : 'Current account status recovered. The earlier registration or login was not confirmed; no credentials were resent.');
    }
  }
  async function checkAccount() {
    if (working.current) return;
    const generation = ++epoch.current; working.current = true; setPending(true); setError('');
    try { await recoverAccount(generation, 'status'); }
    catch { if (generation === epoch.current) setError('Account status is still unavailable. Your saved spaces have been kept.'); }
    finally { working.current = false; setPending(false); }
  }
  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (working.current || accountUncertain) return;
    const values = new FormData(event.currentTarget), generation = ++epoch.current;
    working.current = true; setPending(true); setError('');
    try {
      const value = await accountRequest({ action: form, email: values.get('email'), password: values.get('password'), name: values.get('name') });
      if (generation !== epoch.current) return;
      setAuth(value); setAccountUncertain(false); load(value.user); setInTrip(false); setForm(null); setSharedPlan(undefined);
      setNotice(value.message || (value.user ? 'You’re signed in. Your plans on this device are ready.' : 'Check your email, then log in.'));
    } catch (reason) {
      if (generation === epoch.current) {
        if (reason instanceof AccountReplyError && reason.uncertain) {
          setAccountUncertain(true);
          try { await recoverAccount(generation, form === 'signup' ? 'signup' : 'login'); }
          catch { if (generation === epoch.current) setError('The earlier account action is unconfirmed and current status is unavailable. Check account status before trying again.'); }
        } else setError(reason instanceof Error ? reason.message : 'Please try again.');
      }
    }
    finally { working.current = false; setPending(false); }
  }
  async function logout() {
    if (working.current) return;
    const generation = ++epoch.current; working.current = true; setPending(true); setError('');
    try { const value = await accountRequest({ action: 'logout' }); if (generation !== epoch.current) return; setAccountUncertain(false); setInTrip(false); setForm(null); setSharedPlan(undefined); setAuth(value); load(value.user); setNotice(value.message || 'Signed out. Your account’s plans remain on this device.'); }
    catch (reason) {
      if (generation === epoch.current) {
        if (reason instanceof AccountReplyError && reason.uncertain) {
          setAccountUncertain(true);
          try { await recoverAccount(generation, 'logout'); }
          catch { if (generation === epoch.current) setError('Sign-out and current account status are unconfirmed. Check account status before continuing.'); }
        } else setError('Sign-out could not be confirmed. Please try again.');
      }
    }
    finally { working.current = false; setPending(false); }
  }
  async function enter() {
    if (working.current) return;
    backupReadGeneration.current++;
    const value = load(auth.user); if (!value) return;
    if (value.trips.length) { setSharedPlan(undefined); setInTrip(true); setError(''); return; }
    const shared = importSharedPlan(value, window.location.href);
    if (shared.status === 'imported') {
      setSharedPlan({ tripId: shared.workspace.selectedTripId, hash: window.location.hash });
      setWorkspace(shared.workspace); setInTrip(true);
      return;
    }
    if (shared.status === 'invalid' || shared.status === 'full') { setError('This itinerary cannot be added. Your saved trips and shared link have been kept.'); return; }
    const publicId = new URLSearchParams(window.location.search).get('trip');
    if (publicId && /^[a-zA-Z0-9_-]{1,80}$/.test(publicId)) {
      const generation = epoch.current; working.current = true; setPending(true); setError('');
      try {
        const response = await fetch(`/api/community?id=${encodeURIComponent(publicId)}`, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
        const data = await response.json();
        if (generation !== epoch.current) return;
        if (!response.ok || !isTrip(data.trip)) throw new Error('This shared trip could not be opened. Its link and your saved data have been kept.');
        const copy = { ...publicTripSnapshot(data.trip), id: makeId('trip'), isPublic: false };
        setWorkspace({ ...value, trips: [copy], selectedTripId: copy.id }); setSharedPlan(undefined); setInTrip(true);
      } catch (reason) { if (generation === epoch.current) setError(reason instanceof Error ? reason.message : 'The shared trip could not be loaded.'); }
      finally { working.current = false; setPending(false); }
      return;
    }
    setForm('trip');
  }
  function create(trip: Trip) {
    backupReadGeneration.current++;
    const current = workspace || initialWorkspace(auth.user?.name || '');
    const next = { ...current, trips: [...current.trips, trip], selectedTripId: trip.id };
    try { saveAccountWorkspace(localStorage, auth.user, next); setWorkspace(next); setSharedPlan(undefined); setForm(null); setInTrip(true); setError(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Your first trip could not be saved. Please keep this page open.'); }
  }
  function downloadRecoveryJSON(value: object) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'trippin-storage-recovery.json';
    try { link.click(); } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }
  function downloadSavedData() {
    if (working.current || renderAccountEpoch !== epoch.current) return;
    try {
      const targetKey = accountWorkspaceKey(auth.user), current = localStorage.getItem(targetKey);
      const sourceKey = current === null && !auth.user ? 'trippin.workspace.v1' : targetKey;
      const raw = sourceKey === targetKey ? current : localStorage.getItem(sourceKey);
      if (raw === null) throw new Error('There is no saved data in this space.');
      // JSON preserves malformed UTF-16 strings that a raw Blob would replace.
      downloadRecoveryJSON({ version: 1, kind: 'trippin.storage-recovery', sourceKey, raw });
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Browser storage could not be read.'); }
  }
  function downloadRecoveryArchives() {
    if (working.current || renderAccountEpoch !== epoch.current) return;
    try {
      const archives = accountWorkspaceRecoveryArchives(localStorage, auth.user);
      if (!archives.length) throw new Error('There are no original recovery archives in this space.');
      downloadRecoveryJSON({ version: 1, kind: 'trippin.storage-recovery-collection', archives });
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Recovery archives could not be read.'); }
  }
  function cancelRecovery() {
    if (working.current || !recovery || recovery.generation !== epoch.current || recovery.read !== backupReadGeneration.current) return;
    backupReadGeneration.current++; setRecovery(null);
    setError('Recovery canceled. Check this space before trying again, and keep your downloaded original archive and backup.');
  }
  function downloadSelectedRecovery() {
    if (working.current || !recovery || recovery.generation !== epoch.current || recovery.read !== backupReadGeneration.current
      || recovery.ticket.targetKey !== accountWorkspaceKey(auth.user)) return;
    try { downloadRecoveryJSON({ version: 1, kind: 'trippin.storage-recovery', sourceKey: recovery.ticket.sourceKey, raw: recovery.ticket.sourceRaw }); }
    catch { setError('The original archive could not be downloaded. Keep this page open and try again.'); }
  }
  async function confirmRecovery() {
    if (working.current || !recovery) return;
    const selected = recovery;
    const current = () => selected.generation === epoch.current && selected.read === backupReadGeneration.current
      && selected.ticket.targetKey === accountWorkspaceKey(auth.user);
    if (!current()) return;
    working.current = true; setPending(true); setError('');
    try {
      const restored = await recoverAccountWorkspace(localStorage, auth.user, selected.ticket, selected.workspace, navigator.locks, current);
      if (!current()) return;
      setWorkspace(restored.workspace); setSharedPlan(undefined); setInTrip(restored.workspace.trips.length > 0); setRecovery(null);
      try { setRecoveryArchiveCount(accountWorkspaceRecoveryArchives(localStorage, auth.user).length); }
      catch { setRecoveryArchiveCount(1); }
      setNotice('Your original saved data was archived on this device, and your backup was restored. Original archives remain available in Your trips.');
    } catch (reason) {
      if (current()) setError(reason instanceof Error ? reason.message : 'Recovery was not confirmed. Your original data or its verified archive has been kept.');
    } finally { working.current = false; if (selected.generation === epoch.current) setPending(false); }
  }
  const key = accountWorkspaceKey(auth.user);
  const hasTrips = Boolean(workspace?.trips.length);
  if (inTrip && workspace?.trips.length) return <Workspace key={key} initialState={workspace} storageKey={key}
    initialSharedPlan={sharedPlan} account={auth.user} accountError={error} onCheckAccount={accountUncertain ? checkAccount : undefined} onHome={() => { setInTrip(false); setSharedPlan(undefined); load(auth.user); }} onLogout={logout} accountBusy={pending}
    onEmpty={value => { setWorkspace(value); setSharedPlan(undefined); setInTrip(false); }} />;
  return <div className="travel-home">
    <a href="#travel-content" className="skip-link" onClick={event => { event.preventDefault(); document.getElementById('travel-content')?.focus(); }}>Skip to your travel space</a>
    <header className="travel-header"><a className="brand" href="/">trippin<span>✳</span></a><div>
      {auth.user ? <><span className="account-label">{auth.user.name || auth.user.email}</span><button className="secondary" disabled={pending} onClick={logout}><LogOut size={16}/>Log out</button></>
        : <><button className="text-button" disabled={loading || pending} onClick={() => showForm('login')}>Log in</button><button className="primary" disabled={loading || pending} onClick={() => showForm('signup')}>Sign up <ArrowUpRight size={16}/></button></>}
    </div></header>
    <main id="travel-content" tabIndex={-1}>
      {(notice || error) && !form && <div className={error ? 'home-notice home-error' : 'home-notice'} role={error ? 'alert' : 'status'}>{error || notice}</div>}
      {accountUncertain && <button className="secondary" disabled={loading || pending} onClick={checkAccount}>Check account status</button>}
      {!workspace && error && <><button className="secondary" disabled={loading || pending} onClick={downloadSavedData}>Download saved data for recovery</button>
        <p className="form-note">Keep this original recovery archive. To reopen this space, choose a valid Trippin backup below; recovery archives are for manual repair.</p></>}
      {loading ? <p className="home-loading" role="status">Opening your travel space…</p> : <>
        <section className={`travel-intro${hasTrips ? ' travel-intro-returning' : ''}`}><div><p className="page-eyebrow">{hasTrips ? 'YOUR TRAVEL SPACE' : 'A FEW DAYS AWAY. ALL YOUR OWN.'}</p>
          <h1>{hasTrips ? <>Your next escape,<br/><em>ready when you are.</em></> : <>Less planning.<br/>More <em>getting lost.</em></>}</h1>
          <p>{hasTrips ? 'Pick up a saved plan or make room for somewhere new.' : 'A place for your next escape. Keep the days flexible, the places together, and the little expenses in reach.'}</p>
          <div className="home-actions"><button className="primary" disabled={pending} onClick={enter}>{pending ? 'Opening…' : incoming ? 'Open shared itinerary' : workspace?.trips.length ? 'Open your trips' : 'Plan your first trip'} <ArrowUpRight size={18}/></button>
            {!auth.user && <button className="secondary" disabled={pending} onClick={() => showForm('signup')}>Create an account</button>}</div>
          <small>{auth.user ? <>Signed in as {auth.user.name || auth.user.email}. Trips and expenses stay in this browser; export a backup to move them.</> : 'Start without an account, or register and keep a separate space on this device.'}</small>
        </div>{!hasTrips && <div className="home-photo"><img src="/images/lisbon.jpg" alt="Lisbon rooftops in the afternoon light"/><span><MapPin size={15}/>Leave room for a good detour.</span></div>}</section>
        <section className="home-saved" aria-labelledby="saved-trips-title"><div><h2 id="saved-trips-title">{hasTrips ? 'Your trips' : 'A fresh page for your next trip'}</h2><p>{hasTrips ? 'Saved in this space, on this device.' : 'No sample travelers, bookings or trips. Start with somewhere you want to go.'}</p></div>
          <button className="secondary" onClick={() => showForm('trip')} disabled={pending || !workspace || workspace.trips.length >= 40}><Plus size={16}/>New trip</button>
          {!!workspace?.trips.length && <div className="home-trip-grid">{workspace.trips.map(trip => <button type="button" key={trip.id} disabled={pending} onClick={() => openSavedTrip(trip)}><img src={trip.image} alt="" loading="lazy" decoding="async"/><span><strong>{trip.title}</strong><small>{trip.city}, {trip.country}</small><small><time dateTime={trip.startDate}>{formatDate(trip.startDate, { day: 'numeric', month: 'short', year: 'numeric' })}</time> — <time dateTime={trip.endDate}>{formatDate(trip.endDate, { day: 'numeric', month: 'short', year: 'numeric' })}</time></small></span><ArrowUpRight size={18} aria-hidden="true"/></button>)}</div>}
          {workspace && workspace.trips.length >= 40 && <p className="form-note">You have 40 saved trips in this space. Export a backup before removing a trip to make room.</p>}
          {recoveryArchiveCount > 0 && <button className="text-button" disabled={pending} onClick={downloadRecoveryArchives}>Download original recovery archives</button>}
          <button className="text-button" disabled={pending} onClick={() => { if (working.current) return; backupReadGeneration.current++; setRecovery(null); backup.current?.click(); }}>Restore your own backup</button>
          <input hidden ref={backup} type="file" disabled={pending} accept="application/json,.json" onChange={async event => {
            if (working.current) return;
            const input = event.currentTarget, file = input.files?.[0], generation = epoch.current, read = ++backupReadGeneration.current;
            setRecovery(null);
            if (!file) return;
            try { if (file.size > MAX_BACKUP_FILE_BYTES) throw new Error('Choose a backup of 16 MiB or smaller.');
              const ticket = captureAccountWorkspaceRecovery(localStorage, auth.user, makeId('recovery'));
              const bytes = new Uint8Array(await file.arrayBuffer());
              if (generation !== epoch.current || read !== backupReadGeneration.current) return;
              const value = parseWorkspaceBackup(bytes);
              if (ticket) {
                setRecovery({ ticket, workspace: value, generation, read }); setForm(null); setError(''); return;
              }
              restoreAccountWorkspace(localStorage, auth.user, value); setWorkspace(value); setInTrip(value.trips.length > 0); setError('');
            } catch (reason) { if (generation === epoch.current && read === backupReadGeneration.current) setError(reason instanceof Error ? reason.message : 'The backup could not be restored.'); }
            finally { if (input.files?.[0] === file) input.value = ''; }
          }}/>
        </section>
        {!hasTrips && <section className="travel-features" aria-label="Your trip, in one place">{[
          { icon: CalendarDays, title: 'Days with room to breathe', copy: 'Arrange stops, change your mind, and keep a rain plan nearby.' },
          { icon: Route, title: 'Your day, ready to walk', copy: 'Open your stops in Google Maps, in the order you planned them.' },
          { icon: Wallet, title: 'One budget per adventure', copy: 'Plans, reservations and actual spending live inside each trip.' },
        ].map(item => <article key={item.title}><item.icon size={25}/><h2>{item.title}</h2><p>{item.copy}</p></article>)}</section>}
      </>}
    </main>
    {recovery && recovery.generation === epoch.current && recovery.read === backupReadGeneration.current && recovery.ticket.targetKey === key && !form && <Dialog title="Recover your saved travel space" onClose={cancelRecovery}>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="dialog-form">
        <p>The saved data in {auth.user ? 'this account’s space' : 'your guest space'} cannot be opened. This backup contains {recovery.workspace.trips.length} {recovery.workspace.trips.length === 1 ? 'saved trip' : 'saved trips'}.</p>
        <p id="recovery-warning" className="form-note">Recovery first keeps a verified original archive in this browser, then replaces only this space with your chosen backup. Other spaces and public-plan access data are kept. Keep a downloaded original archive too.</p>
        {recovery.ticket.publicRecoveryIncomplete && <p className="form-note">Some original public-plan details could not be read. Keep the archive for manual recovery; saved publishing access data will be retained.</p>}
        <button className="secondary" disabled={pending} onClick={downloadSelectedRecovery}>Download selected original archive</button>
        <button className="primary" disabled={pending} aria-describedby="recovery-warning" onClick={confirmRecovery}>{pending ? 'Recovering…' : 'Archive original and restore backup'}</button>
        <button className="text-button" disabled={pending} onClick={cancelRecovery}>Cancel recovery</button>
      </div>
    </Dialog>}
    {form && <Dialog title={form === 'trip' ? 'Your next little escape' : form === 'signup' ? 'Make room for your next trip' : 'Welcome back'} onClose={() => { if (!pending) { setForm(null); setError(''); } }}>
      {error && <p className="form-error" role="alert">{error}</p>}
      {accountUncertain && form !== 'trip' && <button className="text-button" disabled={pending} onClick={checkAccount}>Check account status</button>}
      {form === 'trip' ? <NewTripForm onCreate={create}/> : <form key={form} ref={authForm} className="dialog-form" onSubmit={submitAuth}>
        {!auth.available && <p className="form-note">Accounts are not connected yet. Planning without an account is available; registration and login need the account service.</p>}
        {form === 'signup' && <label>Your name<input name="name" maxLength={100} autoComplete="name" required disabled={pending}/></label>}
        <label>Email<input name="email" type="email" maxLength={254} autoComplete="email" required disabled={pending}/></label>
        <label>Password<input name="password" type="password" minLength={form === 'signup' ? 10 : 1} maxLength={128} autoComplete={form === 'signup' ? 'new-password' : 'current-password'} aria-describedby={form === 'signup' ? 'signup-password-note' : undefined} required disabled={pending}/></label>
        {form === 'signup' && <p id="signup-password-note" className="form-note">Use 10–128 characters for your password. Confirm your email before logging in.</p>}
        <button className="primary" disabled={pending || accountUncertain}>{pending ? 'One moment…' : form === 'signup' ? 'Create account' : 'Log in'}</button>
        <p className="form-note">Trips stay on this device. Signing in creates a separate space; guest plans are not attached to your account automatically.</p>
        <button type="button" className="text-button auth-switch" disabled={pending} onClick={() => { setError(''); showForm(form === 'signup' ? 'login' : 'signup'); }}>{form === 'signup' ? 'Already have an account? Log in' : 'New to Trippin? Create an account'}</button>
      </form>}
    </Dialog>}
  </div>;
}
