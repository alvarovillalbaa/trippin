'use client';

import {useState,type FormEvent} from 'react';
import {ArrowRight,MapPin,Ticket} from 'lucide-react';
import type {Activity,Trip} from '@/lib/types';
import {formatDate,isTrip,makeId} from '@/lib/trip';
import {describeEventPrice,type EventPlanDraft} from '@/lib/events';

export default function EventPlanForm({draft,trip,onSave}:{draft:EventPlanDraft;trip:Trip;onSave:(activity:Activity,dayIndex:number)=>void}){
  const [error,setError]=useState('');
  const dayIndex=trip.days.findIndex(day=>day.date===draft.date);
  const alreadySaved=trip.days.some(day=>day.activities.some(activity=>activity.event?.provider===draft.provider&&activity.event.id===draft.id));
  const coordinatesKnown=draft.lat!==null&&draft.lng!==null;
  const quote=describeEventPrice(draft.price);
  function save(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setError('');
    if(dayIndex<0){setError('This event falls outside your trip. Change your trip dates before adding it.');return}
    if(alreadySaved){setError('This event is already in your trip. Edit its stop in your itinerary.');return}
    const form=new FormData(event.currentTarget);
    const text=(name:string)=>String(form.get(name)||'').trim();
    const amount=Number(text('cost')),lat=Number(text('lat')),lng=Number(text('lng'));
    if(!text('cost')||!Number.isFinite(amount)||amount<0||amount>1_000_000){setError('Enter your admission budget in EUR. Use 0 only if you expect a free event.');return}
    const activity:Activity={
      id:makeId('activity'),title:text('title'),category:text('category') as Activity['category'],
      description:text('description'),time:text('time'),duration:Number(form.get('duration')),cost:amount,
      lat,lng,location:text('location'),status:'planned',source:draft.provider==='demo'?'demo':'custom',
      bookingUrl:draft.url,
      event:{id:draft.id,provider:draft.provider,scheduledDate:draft.date,fetchedAt:draft.fetchedAt,priceNote:`${draft.provider==='demo'?'Sample price':quote}. ${draft.provider==='demo'?'Not a real event or ticket.':'Provider range excludes final checkout fees; EUR budget confirmed by the traveler.'}`},
    };
    const next={...trip,days:trip.days.map((day,index)=>index===dayIndex?{...day,activities:[...day.activities,activity].sort((a,b)=>a.time.localeCompare(b.time))}:day)};
    if(!isTrip(next)){setError('Check the time, coordinates, and details. Keep up to 60 stops and alternatives in a day.');return}
    onSave(activity,dayIndex);
  }
  return <form className="dialog-form" onSubmit={save}>
    {error&&<div className="form-error" role="alert">{error}</div>}
    <p><Ticket size={14}/> {draft.provider==='demo'?'Fictional sample event':'Ticketmaster event'} · {formatDate(draft.date)}<br/>Adding a plan does not reserve a ticket.</p>
    {dayIndex<0&&<p className="form-error">This event is outside {trip.city}’s saved trip dates.</p>}
    {alreadySaved&&<p className="form-error">This event is already saved in your itinerary.</p>}
    <label>Event<input name="title" defaultValue={draft.title.slice(0,140)} maxLength={140} required/></label>
    <div className="form-grid">
      <label>Trip day<input readOnly value={dayIndex>=0?`Day ${dayIndex+1} · ${formatDate(draft.date)}`:formatDate(draft.date)}/></label>
      <label>Start time<input name="time" type="time" defaultValue={draft.time||''} required/></label>
    </div>
    {!draft.time&&<p className="form-note">The provider has not confirmed a time. Enter a provisional planning time and verify it before you go.</p>}
    <div className="form-grid">
      <label>Kind of event<select name="category" defaultValue={draft.category}><option value="culture">Culture</option><option value="food">Food & drink</option><option value="outdoors">Outdoors</option><option value="nightlife">Music & after hours</option><option value="community">Meet people</option><option value="other">Something else</option></select></label>
      <label>Time to enjoy it (min)<input name="duration" type="number" min="5" max="1440" defaultValue="120" required/></label>
    </div>
    <label>Your admission budget, including fees (€)<input name="cost" type="number" min="0" max="1000000" step="0.01" defaultValue={draft.price?.currency==='EUR'?draft.price.min:undefined} placeholder="Enter your EUR estimate" required/></label>
    <p className="form-note">{draft.provider==='demo'?'Illustrative sample price':`Provider quote: ${quote}`}. {draft.price?.currency!=='EUR'?'No currency conversion has been applied. Enter your own EUR budget.':'Check the final price and fees at checkout.'} This cost is counted once; link a saved ticket to this stop later.</p>
    <label>Venue or meeting place<input name="location" defaultValue={draft.location} maxLength={120} required/></label>
    <label>Notes<textarea name="description" maxLength={600} defaultValue={draft.description.slice(0,600)}/></label>
    <details><summary><MapPin size={12}/> Map pin</summary><div className="form-grid"><label>Latitude<input name="lat" type="number" min="-90" max="90" step="any" defaultValue={draft.lat??trip.lat} required/></label><label>Longitude<input name="lng" type="number" min="-180" max="180" step="any" defaultValue={draft.lng??trip.lng} required/></label></div><p className="form-note">{coordinatesKnown?'Coordinates were supplied for this venue.':'No venue coordinates were supplied. This pin starts at the city center; adjust it to the meeting place.'}</p></details>
    <button className="primary" type="submit" disabled={dayIndex<0||alreadySaved}>Add to my day <ArrowRight size={16}/></button>
  </form>;
}
