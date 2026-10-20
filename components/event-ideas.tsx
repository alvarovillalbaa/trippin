'use client';

import {useState} from 'react';
import {Plus,Ticket} from 'lucide-react';
import {demoEvents} from '@/lib/data';
import {formatDate,formatMoney} from '@/lib/trip';
import type {ActivityCategory,Trip} from '@/lib/types';
import type {EventPlanDraft} from '@/lib/events';

export default function EventIdeas({trip,preferences,onAdd}:{trip:Trip;preferences:ActivityCategory[];onAdd:(draft:EventPlanDraft)=>void}){
  const [showAll,setShowAll]=useState(false);
  const inTrip=demoEvents.filter(event=>event.city===trip.city&&event.date>=trip.startDate&&event.date<=trip.endDate);
  if(inTrip.length===0)return null;
  const visible=inTrip.filter(event=>showAll||preferences.includes(event.category));
  return <details className="sample-event-ideas"><summary><Ticket size={15}/>Try the planner with sample event ideas</summary><p>Fictional ideas, not real events or available tickets. Saved samples keep their sample label.</p><div className="filter-pills"><button type="button" className={!showAll?'active':''} aria-pressed={!showAll} onClick={()=>setShowAll(false)}>Your kind of events</button><button type="button" className={showAll?'active':''} aria-pressed={showAll} onClick={()=>setShowAll(true)}>All sample ideas</button></div><div className="sample-event-grid">{visible.map(event=><article key={event.id}><span className="category">Sample event · {event.category}</span><h3>{event.title}</h3><p>{formatDate(event.date)} · {event.time} · {event.location}</p><p>{formatMoney(event.cost)} illustrative admission estimate</p><button type="button" className="secondary" onClick={()=>onAdd({id:event.id,provider:'demo',title:event.title,date:event.date,time:event.time,category:event.category,description:event.description,location:event.location,lat:event.lat,lng:event.lng,price:{min:event.cost,max:event.cost,currency:'EUR'}})}><Plus size={13}/>Plan this sample</button></article>)}</div>{visible.length===0&&<p>No sample ideas match your saved event preferences. Choose All sample ideas to explore.</p>}</details>;
}
