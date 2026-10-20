'use client';

import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Plane,Ticket,ArrowUpRight,RefreshCw,Plus} from 'lucide-react';
import type {FlightLookupResult,EventSearchResult} from '@/lib/providers';
import type {ActivityCategory} from '@/lib/types';
import {describeEventPrice,type EventPlanDraft} from '@/lib/events';

type Props={
  mode:'flights'|'events';city:string;countryCode?:string;startDate?:string;endDate?:string;
  preferences?:ActivityCategory[];onAddEvent?:(draft:EventPlanDraft)=>void;
};

export default function ProviderPanel({mode,city,countryCode,startDate,endDate,preferences=[],onAddEvent}:Props){
  const [configured,setConfigured]=useState<boolean|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [result,setResult]=useState<FlightLookupResult|EventSearchResult|null>(null);
  const [onlyMatches,setOnlyMatches]=useState(true);
  const request=useRef<AbortController|null>(null);
  const provider=mode==='flights'?'flightaware':'ticketmaster';
  useEffect(()=>{
    const controller=new AbortController();
    setConfigured(null);setResult(null);setError('');setBusy(false);
    void fetch('/api/providers',{signal:controller.signal}).then(response=>{if(!response.ok)throw new Error();return response.json()}).then(data=>{if(!controller.signal.aborted)setConfigured(data.providers?.[provider]?.configured===true)}).catch(()=>{if(!controller.signal.aborted)setError('We couldn’t check the provider connection. Refresh this page to retry.')});
    return()=>{controller.abort();request.current?.abort();request.current=null};
  },[provider,city,countryCode,startDate,endDate]);

  async function search(event:FormEvent<HTMLFormElement>){
    event.preventDefault();request.current?.abort();
    const controller=new AbortController();request.current=controller;
    setBusy(true);setError('');setResult(null);
    const data=new FormData(event.currentTarget);
    try{
      const body=mode==='flights'
        ?{provider,identifier:String(data.get('identifier')||''),...(data.get('date')?{date:String(data.get('date'))}:{})}
        :{provider,city,size:12,...(countryCode?{countryCode}:{}),...(startDate&&endDate?{startDate,endDate}:{})};
      const response=await fetch('/api/providers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal});
      const value=await response.json();
      if(!response.ok)throw new Error(typeof value.error==='string'?value.error:'The provider is unavailable.');
      if(request.current===controller&&!controller.signal.aborted)setResult(value);
    }catch(caught){if(!controller.signal.aborted&&request.current===controller)setError(caught instanceof Error?caught.message:'The provider is unavailable.')}
    finally{if(request.current===controller){request.current=null;setBusy(false)}}
  }

  const flights=result&&'flights'in result?result.flights:[];
  const allEvents=result&&'events'in result?result.events:[];
  const events=allEvents.filter(event=>!onlyMatches||preferences.includes(event.category));
  function addEvent(event:EventSearchResult['events'][number]){
    if(!event.id||!event.title||!event.date||event.dateToBeAnnounced||!result||!onAddEvent)return;
    const time=!event.timeToBeAnnounced&&event.time&&/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(event.time)?event.time.slice(0,5):null;
    onAddEvent({
      id:event.id,provider:'ticketmaster',title:event.title,date:event.date,time,category:event.category,
      description:`Found on Ticketmaster. Verify event time, availability, and final admission fees before you go.${event.timeToBeAnnounced?' Event time is not confirmed.':''}`,
      location:event.location.venue||event.location.city||city,lat:event.location.lat,lng:event.location.lng,
      url:event.url||undefined,price:event.price,fetchedAt:result.fetchedAt,
    });
  }

  return <section className="provider-panel">
    <div className="section-heading"><div><h2>{mode==='flights'?'A little peace of mind.':'What’s on while you’re there?'}</h2><p>{mode==='flights'?'Look up live flight status with FlightAware.':'Find events within your trip dates, then shape them into your day.'}</p></div>{mode==='flights'?<Plane size={23}/>:<Ticket size={23}/>}</div>
    {configured===false?<div className="integration-notice"><div><strong>{mode==='flights'?'Flight tracking is a connection away.':'Live events are a connection away.'}</strong><p>{mode==='flights'?'Add your FlightAware API key to activate live flight status. Saved flight details work without it.':'Add your Ticketmaster API key to activate event search. External discovery links and sample ideas remain available.'}</p></div></div>:<form onSubmit={search} className="provider-search">
      {mode==='flights'?<><label>Flight number<input name="identifier" placeholder="LH1801" maxLength={8} required/></label><label>Departure date (optional)<input name="date" type="date"/></label></>:<p>Events in <strong>{city}</strong>{startDate&&endDate&&<small className="event-search-dates">{startDate} — {endDate} · event-local dates</small>}</p>}
      <button type="submit" className="primary" disabled={busy||configured===null}>{busy?<><RefreshCw size={14}/>Checking…</>:mode==='flights'?'Check status':'Find events'}</button>
    </form>}
    {error&&<p role="alert" className="form-error">{error}</p>}
    {result&&<div className="provider-results">
      {mode==='events'&&<div className="filter-pills" aria-label="Event preference filter"><button aria-pressed={onlyMatches} className={onlyMatches?'active':''} onClick={()=>setOnlyMatches(true)}>Your kind of events</button><button aria-pressed={!onlyMatches} className={!onlyMatches?'active':''} onClick={()=>setOnlyMatches(false)}>All events</button></div>}
      {flights.map(flight=><article key={flight.id}><div><strong>{flight.identifier} · {flight.origin.code} → {flight.destination.code}</strong><small>{flight.origin.city} → {flight.destination.city}</small></div><span>{flight.status}</span><p>Scheduled departure: {flight.scheduledDeparture?new Date(flight.scheduledDeparture).toLocaleString():'Unavailable'}<br/>Estimated arrival: {flight.estimatedArrival?new Date(flight.estimatedArrival).toLocaleString():'Unavailable'}</p></article>)}
      {events.map(event=>{
        const blocked=event.dateToBeAnnounced||!event.date||['cancelled','canceled','postponed','rescheduled'].includes(event.status||'')||Boolean(startDate&&event.date<startDate)||Boolean(endDate&&event.date>endDate);
        return <article key={event.id}><div><strong>{event.title}</strong><small>{event.date||'Date to be announced'} · {event.location.venue} · {[event.location.city,event.location.country].filter(Boolean).join(', ')} · {event.status||'Status unavailable'}</small></div><div className="event-result-actions">{onAddEvent&&<button className="primary" disabled={blocked} onClick={()=>addEvent(event)}><Plus size={13}/>Plan this event</button>}{event.url&&<a className="secondary" href={event.url} target="_blank" rel="noreferrer">View tickets <ArrowUpRight size={13}/></a>}</div><p>{describeEventPrice(event.price)} · final availability and fees at checkout.{blocked?' Confirm the event schedule before adding it to a dated trip.':''}</p></article>;
      })}
      {flights.length===0&&events.length===0&&<p>{mode==='events'&&allEvents.length>0?'No matches for your saved event preferences. Choose All events to explore more.':'No results from the provider for this search.'}</p>}
      <p className="estimate-note">Source: {result.source} · retrieved {new Date(result.fetchedAt).toLocaleString()}. Verify details with the provider before traveling.{result.moreAvailable?' More provider results exist beyond this bounded search.':''}</p>
    </div>}
  </section>;
}
