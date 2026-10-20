'use client';
import {useEffect,useState,type FormEvent} from 'react';
import {Plane,Ticket,ArrowUpRight,RefreshCw} from 'lucide-react';
import type {FlightLookupResult,EventSearchResult} from '@/lib/providers';

export default function ProviderPanel({mode,city}:{mode:'flights'|'events';city:string}){
  const [configured,setConfigured]=useState<boolean|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [result,setResult]=useState<FlightLookupResult|EventSearchResult|null>(null);
  const provider=mode==='flights'?'flightaware':'ticketmaster';
  useEffect(()=>{let active=true;void fetch('/api/providers').then(r=>r.json()).then(data=>{if(active)setConfigured(data.providers?.[provider]?.configured===true)}).catch(()=>{if(active)setConfigured(false)});return()=>{active=false}},[provider]);
  async function search(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setError('');setResult(null);const data=new FormData(event.currentTarget);
    try{const response=await fetch('/api/providers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(mode==='flights'?{provider,identifier:String(data.get('identifier')||''),...(data.get('date')?{date:String(data.get('date'))}:{})}:{provider,city,size:8})});const value=await response.json();if(!response.ok)throw new Error(value.error?.message||value.error||'The provider is unavailable.');setResult(value)}catch(e){setError(e instanceof Error?e.message:'The provider is unavailable.')}finally{setBusy(false)}
  }
  const flights=result&&'flights'in result?result.flights:[];
  const events=result&&'events'in result?result.events:[];
  return <section className="provider-panel"><div className="section-heading"><div><h2>{mode==='flights'?'A little peace of mind.':'What’s on while you’re there?'}</h2><p>{mode==='flights'?'Look up live flight status with FlightAware.':'Find upcoming events with Ticketmaster.'}</p></div>{mode==='flights'?<Plane size={23}/>:<Ticket size={23}/>}</div>
  {configured===false?<div className="integration-notice"><div><strong>{mode==='flights'?'Flight tracking is a connection away.':'Live events are a connection away.'}</strong><p>{mode==='flights'?'Add your FlightAware API key to activate live flight status. Saved flight details work without it.':'Add your Ticketmaster API key to activate event search. You can browse with the provider links below.'}</p></div></div>:<form onSubmit={search} className="provider-search">{mode==='flights'?<><label>Flight number<input name="identifier" placeholder="LH1801" maxLength={8} required/></label><label>Departure date (optional)<input name="date" type="date"/></label></>:<p>Upcoming events in <strong>{city}</strong></p>}<button type="submit" className="primary" disabled={busy||configured===null}>{busy?<><RefreshCw size={14}/>Checking…</>:mode==='flights'?'Check status':'Find events'}</button></form>}
  {error&&<p role="alert" className="form-error">{error}</p>}
  {result&&<div className="provider-results">{flights.map(f=><article key={f.id}><div><strong>{f.identifier} · {f.origin.code} → {f.destination.code}</strong><small>{f.origin.city} → {f.destination.city}</small></div><span>{f.status}</span><p>Scheduled departure: {f.scheduledDeparture?new Date(f.scheduledDeparture).toLocaleString():'Unavailable'}<br/>Estimated arrival: {f.estimatedArrival?new Date(f.estimatedArrival).toLocaleString():'Unavailable'}</p></article>)}{events.map(e=><article key={e.id}><div><strong>{e.title}</strong><small>{e.date||'Date to be announced'} · {e.location.venue}</small></div>{e.url&&<a className="secondary" href={e.url} target="_blank" rel="noreferrer">View tickets <ArrowUpRight size={13}/></a>}<p>{e.price?`${e.price.currency} ${e.price.min}–${e.price.max} provider range · final fees at checkout`:'Price unavailable. Check with the provider.'}</p></article>)}{flights.length===0&&events.length===0&&<p>No results from the provider. Try another search.</p>}<p className="estimate-note">Source: {result.source} · retrieved {new Date(result.fetchedAt).toLocaleString()}. Verify details with the provider before traveling.</p></div>}
  </section>;
}
