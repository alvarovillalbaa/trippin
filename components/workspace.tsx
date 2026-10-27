'use client';

import {useCallback,useEffect,useMemo,useRef,useState, type FormEvent} from 'react';
import dynamic from 'next/dynamic';
import {ArrowUpRight,ArrowLeft,ArrowRight,ArrowUp,ArrowDown,Plus,MapPin,CalendarDays,Compass,Wallet,Ticket,ChevronDown,ChevronRight,Check,CheckCircle2,Clock,Footprints,Plane,Building2,Coffee,Sun,CloudSun,Users,Share2,Sparkles,Settings2,Search,Heart,Leaf,Mountain,Music2,Utensils,Landmark,MoreHorizontal,Download,Upload,ExternalLink,Trash2,Map,LayoutList,Pencil,X,Globe,ShieldCheck,Route,BookOpen,Link as LinkIcon} from 'lucide-react';
import {seedTrips,seedProfile,destinations} from '@/lib/data';
import {formatMoney,formatDate,getTripCost,getTripDays,getWalkingRoute,getTravelBadges,getEventPreferences,isTrip,makeId,publicTripSnapshot,restoreWorkspace,importSharedPlan,persistWorkspace,MAX_BACKUP_FILE_BYTES,exportWorkspaceBackup,parseWorkspaceBackup} from '@/lib/trip';
import type {Trip,Activity,Booking,Expense,Profile,WorkspaceState} from '@/lib/types';
import {parseExpenseCsv} from '@/lib/csv';
import Dialog from './dialog';
import {AiChat} from './ai-chat';
import StayComparison from './stay-comparison';
import ProviderPanel from './provider-panel';
import NewTripForm from './new-trip-form';
import BankPreferences from './bank-preferences';
import TripRecap from './trip-recap';
import TripSettings from './trip-settings';
import EventPlanForm from './event-plan-form';
import EventIdeas from './event-ideas';
import type {EventPlanDraft} from '@/lib/events';

const TripMap=dynamic(()=>import('./trip-map'),{ssr:false,loading:()=> <div className="map-panel map-loading">
<Compass size={32}/>
<span>Finding your bearings…</span>
</div>});
const storageKey='trippin.workspace.v1';
type View='itinerary'|'discover'|'budget'|'bookings'|'profile';
type Modal='trip'|'tripSettings'|'activity'|'event'|'expense'|'booking'|'share'|'settings'|'alternatives'|'join'|null;
type CommunityRequest={id:string;name:string;message:string;contact:string;status:'pending'|'accepted'|'declined'};
const categories=['culture','food','outdoors','nightlife','community','transport','stay','other'] as const;
const categoryIcon={culture:Landmark,food:Utensils,outdoors:Leaf,nightlife:Music2,community:Users,transport:Plane,stay:Building2,other:Compass};
const categoryLabel={culture:'Culture',food:'Food & drink',outdoors:'Outdoors',nightlife:'After hours',community:'Meet people',transport:'Transport',stay:'Accommodation',other:'Something else'};
const interestAliases:Record<string,string[]>={culture:['culture','architecture','art','design'],food:['food','coffee','local food'],outdoors:['outdoors','running','cycling'],nightlife:['nightlife','music'],community:['community','meet people']};
const initial:WorkspaceState={version:1,trips:seedTrips,profile:seedProfile,selectedTripId:seedTrips[0].id};

function field(form:FormData,name:string){return String(form.get(name)||'').trim()}
function download(name:string,data:string,type='application/json'){const url=URL.createObjectURL(new Blob([data],{type}));const link=document.createElement('a');link.href=url;link.download=name;link.click();URL.revokeObjectURL(url)}
function safeUrl(value:string){try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)?url.href:undefined}catch{return undefined}}
function dayLabel(date:string){return new Date(`${date}T12:00:00`).toLocaleDateString('en-GB',{weekday:'short',day:'numeric'})}

export default function Workspace(){
  const [state,setState]=useState<WorkspaceState>(initial);
  const [ready,setReady]=useState(false);
  const [view,setView]=useState<View>('itinerary');
  const [dayIndex,setDayIndex]=useState(0);
  const [modal,setModal]=useState<Modal>(null);
  const [editing,setEditing]=useState<Activity|null>(null);
  const [editingBooking,setEditingBooking]=useState<Booking|null>(null);
  const [eventDraft,setEventDraft]=useState<EventPlanDraft|null>(null);
  const [newTripCity,setNewTripCity]=useState<string|undefined>(undefined);
  const [selected,setSelected]=useState<string|null>(null);
  const [mobileMap,setMobileMap]=useState(false);
  const [aiOpen,setAiOpen]=useState(false);
  const [toast,setToast]=useState('');
  const [error,setError]=useState('');
  const [search,setSearch]=useState('');
  const [filter,setFilter]=useState('all');
  const [weather,setWeather]=useState<{temperature:number;code:number}|null>(null);
  const [socialReady,setSocialReady]=useState(false);
  const [publicTrips,setPublicTrips]=useState<Trip[]>([]);
  const [joining,setJoining]=useState<Trip|null>(null);
  const [shareUrl,setShareUrl]=useState('');
  const [busy,setBusy]=useState(false);
  const [requests,setRequests]=useState<CommunityRequest[]|null>(null);
  const fileInput=useRef<HTMLInputElement>(null);
  const backupInput=useRef<HTMLInputElement>(null);
  const backupReadGeneration=useRef(0);
  const initialized=useRef(false);
  const pendingPlan=useRef<{tripId:string;hash:string}|null>(null);
  const trip=state.trips.find(t=>t.id===state.selectedTripId)||state.trips[0];
  const day=trip.days[Math.min(dayIndex,trip.days.length-1)];
  const activities=useMemo(()=>day?.activities.filter(a=>!a.alternativeFor)||[],[day]);
  const cost=getTripCost(trip,state.profile);
  const route=getWalkingRoute(activities);
  const notify=(message:string)=>{setToast(message)};
  const selectPlace=useCallback((id:string)=>setSelected(id),[]);
  const close=()=>{setModal(null);setError('');setEditing(null);setEditingBooking(null);setEventDraft(null);setShareUrl('');setRequests(null)};
  const open=(value:Modal)=>{setError('');setModal(value)};
  const updateTrip=(updater:(value:Trip)=>Trip)=>setState(s=>({...s,trips:s.trips.map(t=>t.id===trip.id?updater(t):t)}));
  const updateActivity=(id:string,updater:(a:Activity)=>Activity)=>updateTrip(t=>({...t,days:t.days.map(d=>({...d,activities:d.activities.map(a=>a.id===id?updater(a):a)}))}));
  const selectTrip=(id:string)=>{setState(s=>({...s,selectedTripId:id}));setDayIndex(0);setSelected(null);setView('itinerary');setMobileMap(false)};

  useEffect(()=>{
    if(initialized.current)return;
    initialized.current=true;
    let restored=initial,notice='';
    try{restored=restoreWorkspace(localStorage.getItem(storageKey))}catch{notice='Browser storage is unavailable. Export a backup to keep your changes.'}
    const sharedPlan=importSharedPlan(restored,window.location.href);
    setState(sharedPlan.workspace);
    if(sharedPlan.status==='imported'){
      pendingPlan.current={tripId:sharedPlan.workspace.selectedTripId,hash:window.location.hash};
      notice=['Shared itinerary added. Saving it in this browser…',notice].filter(Boolean).join(' ');
    }else if(sharedPlan.status==='full')notice=['Adding this itinerary would exceed this browser’s workspace limit. Your existing trips are unchanged.',notice].filter(Boolean).join(' ');
    else if(sharedPlan.status==='invalid')notice=['This itinerary link is invalid. Your existing trips are unchanged.',notice].filter(Boolean).join(' ');
    if(notice)setToast(notice);
    setReady(true);
    void fetch('/api/community').then(r=>r.json()).then(data=>{setSocialReady(data.available===true);setPublicTrips(Array.isArray(data.trips)?data.trips.filter(isTrip):[])}).catch(()=>{});
    const shared=new URLSearchParams(window.location.search).get('trip');
    if(shared&&/^[a-zA-Z0-9_-]{1,80}$/.test(shared))void fetch(`/api/community?id=${shared}`).then(r=>r.json()).then(data=>{if(isTrip(data.trip)){setJoining(data.trip);setModal('join')}}).catch(()=>setToast('This shared trip could not be loaded.'));
  },[]);
  useEffect(()=>{
    if(!ready)return;
    const pending=pendingPlan.current,includesPlan=pending&&state.trips.some(t=>t.id===pending.tripId);
    const result=persistWorkspace(state,serialized=>localStorage.setItem(storageKey,serialized),includesPlan&&pending?()=>{
      const url=new URL(window.location.href);
      if(url.hash===pending.hash){url.hash='';window.history.replaceState(window.history.state,'',url.href)}
    }:undefined);
    if(result==='unsaved')setToast(includesPlan?'This itinerary is here for this visit, but could not be saved. Keep the shared link or export a backup before leaving.':'Your browser could not save. Export a backup before leaving.');
    else if(pending){
      if(result==='link-retained')setToast('Shared itinerary saved. The link could not be cleared; open Trippin home before reloading.');
      else{pendingPlan.current=null;if(includesPlan)setToast('Shared itinerary saved as a new trip in your browser.')}
    }
  },[state,ready]);
  useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(''),5000);return()=>clearTimeout(timer)},[toast]);
  useEffect(()=>{
    const controller=new AbortController();setWeather(null);
    void fetch(`https://api.open-meteo.com/v1/forecast?latitude=${trip.lat}&longitude=${trip.lng}&current=temperature_2m,weather_code&timezone=auto`,{signal:controller.signal}).then(r=>r.json()).then(data=>{if(data.current)setWeather({temperature:data.current.temperature_2m,code:data.current.weather_code})}).catch(()=>{});
    return()=>controller.abort();
  },[trip.lat,trip.lng]);

  const addTrip=(next:Trip)=>{if(state.trips.length>=40){setError('Keep up to 40 trips in this browser. Export a backup to archive older trips.');return}setState(s=>({...s,trips:[...s.trips,next],selectedTripId:next.id}));setDayIndex(0);setSelected(null);setView('itinerary');close();notify('New trip, fresh possibilities. Your itinerary is ready to shape.')};
  const planEvent=(draft:EventPlanDraft)=>{setEventDraft(draft);open('event')};
  const saveEvent=(activity:Activity,targetDay:number)=>{updateTrip(t=>({...t,days:t.days.map((d,index)=>index===targetDay?{...d,activities:[...d.activities,activity].sort((a,b)=>a.time.localeCompare(b.time))}:d)}));setDayIndex(targetDay);setSelected(activity.id);setView('itinerary');setMobileMap(false);close();notify('Event added to your day and admission budget. Save a linked reservation after booking.')};
  const submitActivity=(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();const form=new FormData(event.currentTarget);const lat=Number(form.get('lat')),lng=Number(form.get('lng'));
    if(!editing&&day.activities.length>=60){setError('Keep up to 60 stops and alternatives in a day.');return}
    if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180){setError('Enter valid map coordinates.');return}
    const activityId=editing?.id||makeId('activity');
    const activity:Activity={...editing,id:activityId,title:field(form,'title'),category:field(form,'category') as Activity['category'],description:field(form,'description'),time:field(form,'time'),duration:Number(form.get('duration')),cost:Number(form.get('cost')),lat,lng,location:field(form,'location'),status:editing?.status||'planned',source:editing?.source==='demo'?'demo':'custom',bookingUrl:safeUrl(field(form,'url')),event:form.get('isEvent')?(editing?.event||{provider:'manual',id:`manual-${activityId}`,scheduledDate:day.date}):undefined};
    if(editing)updateActivity(editing.id,()=>activity);else updateTrip(t=>({...t,days:t.days.map((d,i)=>i===dayIndex?{...d,activities:[...d.activities,activity].sort((a,b)=>a.time.localeCompare(b.time))}:d)}));
    close();notify(editing?'Plan updated.':'A little more to look forward to.');
  };
  const submitExpense=(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    if(trip.expenses.length>=1000){setError('Keep up to 1,000 expenses per trip. Export a backup to archive them.');return}
    const form=new FormData(event.currentTarget),linked=field(form,'estimate');
    const expense:Expense={id:makeId('expense'),title:field(form,'title'),category:field(form,'category') as Expense['category'],amount:Number(form.get('amount')),date:field(form,'date'),...(linked.startsWith('booking:')?{bookingId:linked.slice(8)}:linked.startsWith('activity:')?{activityId:linked.slice(9)}:{})};
    updateTrip(t=>({...t,expenses:[...t.expenses,expense]}));close();notify('Expense recorded. Your budget is up to date.');
  };
  const submitBooking=(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    if(!editingBooking&&trip.bookings.length>=100){setError('Keep up to 100 reservations per trip.');return}
    const form=new FormData(event.currentTarget),activityId=field(form,'activityId')||undefined;
    if(activityId&&trip.bookings.some(b=>b.activityId===activityId&&b.id!==editingBooking?.id)){setError('That activity already has a linked reservation. Edit it instead.');return}
    const booking:Booking={id:editingBooking?.id||makeId('booking'),activityId,type:field(form,'type') as Booking['type'],title:field(form,'title'),reference:field(form,'reference'),date:field(form,'date'),url:safeUrl(field(form,'url')),cost:Number(form.get('cost')),notes:field(form,'notes'),status:field(form,'status') as Booking['status'],source:'custom'};
    updateTrip(t=>({...t,bookings:editingBooking?t.bookings.map(b=>b.id===booking.id?booking:b):[...t.bookings,booking]}));close();notify('Reservation saved in your trip wallet.');
  };
  const reorder=(id:string,direction:number)=>{updateTrip(t=>({...t,days:t.days.map((d,i)=>{if(i!==dayIndex)return d;const next=[...d.activities];const visible=next.map((a,index)=>a.alternativeFor?-1:index).filter(index=>index>=0);const index=visible.findIndex(position=>next[position].id===id),target=index+direction;if(index<0||target<0||target>=visible.length)return d;const from=visible[index],to=visible[target];[next[from],next[to]]=[next[to],next[from]];return{...d,activities:next}})}))};
  const chooseAlternative=(option:Activity)=>{
    if(!editing)return;
    const original=editing;
    const nextId=option.alternativeFor===original.id?option.id:makeId('activity');
    const replacement:Activity={...option,id:nextId,time:original.time,status:'planned',alternativeFor:undefined};
    updateTrip(t=>({...t,days:t.days.map(d=>d.activities.some(a=>a.id===original.id)?{...d,activities:d.activities.flatMap(item=>item.id===original.id?[replacement,{...item,status:'skipped' as const,alternativeFor:nextId}]:item.id===option.id&&option.alternativeFor===original.id?[]:[item.alternativeFor===original.id?{...item,alternativeFor:nextId}:item])}:d)}));
    setSelected(nextId);close();notify('A little change of plan. Your budget and map are updated.');
  };
  const snapshot=()=>publicTripSnapshot(trip);
  const removeBooking=(booking:Booking)=>updateTrip(t=>({...t,bookings:t.bookings.filter(b=>b.id!==booking.id),expenses:t.expenses.map(expense=>expense.bookingId===booking.id&&booking.activityId?{...expense,bookingId:undefined,activityId:booking.activityId}:expense)}));
  const reviewRequests=async()=>{setBusy(true);setError('');try{const owner=localStorage.getItem('trippin.owner')||'';const response=await fetch(`/api/community?id=${trip.id}`,{headers:{'x-trip-owner':owner}});const data=await response.json();if(!response.ok)throw new Error(data.error);setRequests(data.requests||[])}catch(e){setError(e instanceof Error?e.message:'Could not load requests.')}finally{setBusy(false)}};
  const decideRequest=async(id:string,status:'accepted'|'declined')=>{setBusy(true);setError('');try{const response=await fetch('/api/community',{method:'PATCH',headers:{'Content-Type':'application/json','x-trip-owner':localStorage.getItem('trippin.owner')||''},body:JSON.stringify({tripId:trip.id,requestId:id,action:status})});const data=await response.json();if(!response.ok)throw new Error(data.error);setRequests(list=>list?.map(item=>item.id===id?{...item,status}:item)||[]);notify(`Request ${status}. Contact the traveler directly to arrange details.`)}catch(e){setError(e instanceof Error?e.message:'Could not update request.')}finally{setBusy(false)}};
  const unpublish=async()=>{setBusy(true);try{const response=await fetch(`/api/community?id=${trip.id}`,{method:'DELETE',headers:{'x-trip-owner':localStorage.getItem('trippin.owner')||''}});const data=await response.json();if(!response.ok)throw new Error(data.error);updateTrip(t=>({...t,isPublic:false}));setPublicTrips(list=>list.filter(t=>t.id!==trip.id));setRequests(null);notify('Trip unpublished and join requests removed.')}catch(e){setError(e instanceof Error?e.message:'Could not unpublish.')}finally{setBusy(false)}};
  const shareSnapshot=async()=>{const value=window.location.origin+'/#plan='+btoa(unescape(encodeURIComponent(JSON.stringify(snapshot()))));if(value.length>24000){setError('This trip is too large for a link. Export a backup instead.');return}setShareUrl(value);try{await navigator.clipboard.writeText(value);notify('Itinerary link copied. Private booking details stay out.')}catch{notify('Your link is ready to copy below.')}};
  const publish=async()=>{
    setBusy(true);setError('');
    try{let owner=localStorage.getItem('trippin.owner');if(!owner){owner=crypto.randomUUID()+crypto.randomUUID();localStorage.setItem('trippin.owner',owner)}const response=await fetch('/api/community',{method:'POST',headers:{'Content-Type':'application/json','x-trip-owner':owner},body:JSON.stringify({trip:snapshot(),host:state.profile.name})});const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not publish this trip.');updateTrip(t=>({...t,isPublic:true}));const url=window.location.origin+'/?trip='+trip.id;setShareUrl(url);setPublicTrips(list=>[...list.filter(t=>t.id!==trip.id),{...snapshot(),isPublic:true}]);notify('Your trip is open for join requests.')}catch(e){setError(e instanceof Error?e.message:'Could not publish.')}finally{setBusy(false)}
  };
  const sendJoin=async(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();if(!joining)return;setBusy(true);const form=new FormData(event.currentTarget);try{const response=await fetch('/api/community',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({tripId:joining.id,name:field(form,'name'),message:field(form,'message'),contact:field(form,'contact')})});const data=await response.json();if(!response.ok)throw new Error(data.error);close();notify('Join request sent. The host can review it in Trippin.')}catch(e){setError(e instanceof Error?e.message:'Could not send the request.')}finally{setBusy(false)}};
  const importCsv=async(file?:File)=>{if(!file)return;try{const rows=parseExpenseCsv(await file.text());if(rows.length+trip.expenses.length>1000)throw new Error('Keep up to 1,000 expenses per trip.');const expenses=rows.map(row=>({...row,id:makeId('expense'),category:(categories as readonly string[]).includes(row.category)?row.category as Expense['category']:'other' as const}));updateTrip(t=>({...t,expenses:[...t.expenses,...expenses]}));notify(`${expenses.length} expenses imported into ${trip.city}.`)}catch(e){notify(e instanceof Error?e.message:'Could not import CSV.')}if(fileInput.current)fileInput.current.value=''};
  const budgetPercent=trip.budget>0?Math.min(100,Math.round(cost.total/trip.budget*100)):cost.total>0?100:0;
  const aiContext=JSON.stringify({city:trip.city,country:trip.country,startDate:trip.startDate,endDate:trip.endDate,budget:trip.budget,interests:state.profile.interests,openToEvents:getEventPreferences(state.profile),days:trip.days.map(d=>({date:d.date,activities:d.activities.filter(a=>!a.alternativeFor).map(a=>({title:a.title,time:a.time,cost:a.cost,status:a.status}))}))});

  return <div className="app-shell">
    <a href="#main-content" className="skip-link">Skip to trip</a>
    <aside className="sidebar">
<a className="brand" href="/" aria-label="Trippin home">trippin<span>✳</span>
</a>
<div className="workspace-label">A LITTLE FURTHER, A LITTLE FREER.</div>
      <button className="new-trip-button" onClick={()=>open('trip')}>
<Plus size={18}/>Create a trip</button>
      <nav aria-label="Main navigation">
<span className="nav-label">YOUR SPACE</span>{([{id:'itinerary',icon:Compass,label:'My trips'},{id:'discover',icon:Globe,label:'Discover'},{id:'budget',icon:Wallet,label:'Trip budget'},{id:'bookings',icon:Ticket,label:'Bookings'}] as const).map(item=>
<button key={item.id} className={`nav-item ${view===item.id?'active':''}`} onClick={()=>setView(item.id)}>
<item.icon size={19}/>{item.label}{item.id==='itinerary'&&<span>{state.trips.length.toString().padStart(2,'0')}</span>}</button>)}</nav>
      <div className="trip-nav">
<span className="nav-label">YOUR NEXT CHAPTERS</span>{state.trips.map(t=>
<button key={t.id} className={`trip-nav-item ${t.id===trip.id?'selected':''}`} onClick={()=>selectTrip(t.id)}>
<span className="trip-mini-image" style={{backgroundImage:`url(${t.image})`}}/>
<span>
<strong>{t.city}</strong>
<small>{formatDate(t.startDate)} — {formatDate(t.endDate)}</small>
</span>{t.id===trip.id&&<span className="trip-dot"/>}</button>)}</div>
      <div className="sidebar-bottom">
<div className="little-note">
<span>✧</span>
<strong>Leave room for<br/>a little unexpected.</strong>
<small>The best bits rarely make the plan.</small>
</div>
<button className="profile-button" onClick={()=>setView('profile')}>
<span className="avatar">{state.profile.name.slice(0,1).toUpperCase()}</span>
<span>
<strong>{state.profile.name}</strong>
<small>Always a little curious</small>
</span>
<Settings2 size={17}/>
</button>
</div>
    </aside>
    <main className={`main-area ${view==='itinerary'?'with-map':''}`} id="main-content">
      <header className="topbar">
<div className="breadcrumb">Your space <ChevronRight size={13}/>
<strong>{view==='itinerary'?trip.city:view==='budget'?'Trip budget':view==='bookings'?'Bookings':view==='profile'?'Your profile':'Discover'}</strong>
<select className="trip-switcher" aria-label="Choose your trip" value={trip.id} onChange={e=>selectTrip(e.target.value)}>{state.trips.map(t=><option key={t.id} value={t.id}>{t.city}</option>)}</select>
</div>
<div className="top-actions">
<button className="help-button" onClick={()=>open('settings')}>
<BookOpen size={15}/>
<span>How it works</span>
</button>
<span className="tiny-divider"/>
<button className="avatar small" aria-label="Your profile" onClick={()=>setView('profile')}>{state.profile.name.slice(0,1).toUpperCase()}</button>
</div>
</header>
      {view==='itinerary'&&<div className="trip-workspace">
<div className={`itinerary-panel ${mobileMap?'mobile-hidden':''}`}>
<section className="trip-heading">
<div className="eyebrow">
<span className="country-dot"/><span className="country-dynamic">{trip.country.toUpperCase()}</span>
<span className="sample-tag">{trip.id.startsWith('demo')||trip.days.some(d=>d.activities.some(a=>a.source==='demo'))?'SAMPLE TRIP':'YOUR TRIP'}</span>
</div>
<div className="heading-line">
<h1>{trip.city}<span className="title-dot">.</span>
</h1>
<div className="heading-actions">
<button className="icon-button bordered" aria-label="Edit trip details" onClick={()=>open('tripSettings')}><Pencil size={15}/></button>
<button className="icon-button bordered" aria-label="Share trip" onClick={()=>open('share')}>
<Share2 size={17}/>
</button>
<button className="ai-button" aria-label="Ask trippin" onClick={()=>setAiOpen(true)}>
<Sparkles size={15}/>
<span>Ask trippin</span>
</button>
</div>
</div>
<p className="trip-description">{trip.description||'A few days away. A whole world of possibilities.'}</p>
<div className="trip-meta">
<span>
<CalendarDays size={14}/>{formatDate(trip.startDate)} – {formatDate(trip.endDate)}, {trip.startDate.slice(0,4)}</span>
<span className="meta-dot">·</span>
<span>
<Users size={14}/>Solo adventure</span>
<span className="weather">{weather?<>
<CloudSun size={16}/>{Math.round(weather.temperature)}°C now</>:<>
<Sun size={16}/>Weather unavailable</>}</span>
</div>
</section>
      <section className="destination-hero" style={{backgroundImage:`url(${trip.image})`}} aria-label={`${trip.city} destination photograph`}>
<div className="hero-shade"/>
<div className="hero-caption">
<span>LESS CHECKLIST. MORE CITY.</span>
<h2>Make room for<br/>the good detours.</h2>
</div>
<span className="hero-coordinate">{Math.abs(trip.lat).toFixed(2)}°{trip.lat>=0?'N':'S'} &nbsp; {Math.abs(trip.lng).toFixed(2)}°{trip.lng>=0?'E':'W'}</span>
<span className="photo-count">
<Compass size={13}/> {getTripDays(trip.startDate,trip.endDate).length} days to make your own</span>
</section>
      <div className="trip-summary">
<button onClick={()=>setView('budget')}>
<span className="summary-icon">
<Wallet size={18}/>
</span>
<span>
<small>WHOLE-TRIP ESTIMATE</small>
<strong>{formatMoney(cost.total)} <em>/ {formatMoney(trip.budget)} budget</em>
</strong>
</span>
<ChevronRight size={15}/>
</button>
<div className="summary-separator"/>
<button onClick={()=>setView('bookings')}>
<span className="summary-icon peach">
<Ticket size={18}/>
</span>
<span>
<small>ALL THE LITTLE DETAILS</small>
<strong>{trip.bookings.length} saved reservations</strong>
</span>
<ChevronRight size={15}/>
</button>
</div>
      <div className="itinerary-title">
<div>
<h2>Your itinerary<span className="green-dot"/>
</h2>
<p>A plan with plenty of breathing room.</p>
</div>
<button className="text-button" onClick={()=>{setEditing(null);open('activity')}}>
<Plus size={15}/>Add a stop</button>
</div>
      <div className="day-tabs" role="tablist" aria-label="Trip days">{trip.days.map((d,i)=>
<button key={d.id} id={`day-tab-${i}`} role="tab" aria-controls="day-plan" aria-selected={i===dayIndex} className={i===dayIndex?'active':''} onClick={()=>{setDayIndex(i);setSelected(null)}}>
<strong>Day {i+1}</strong>
<span>{dayLabel(d.date)}</span>
</button>)}</div>
      <div className="day-heading">
<div>
<h3>{day.label||'Follow your curiosity'}</h3>
<span>{activities.filter(a=>a.status!=='skipped').length} stops <span>·</span> {formatMoney(activities.filter(a=>a.status!=='skipped').reduce((s,a)=>s+a.cost,0))} estimated</span>
</div>
<span className="walking-total">
<Footprints size={15}/>{route.distanceKm.toFixed(1)} km est.</span>
</div>
      <div className="timeline" id="day-plan" role="tabpanel" aria-labelledby={`day-tab-${dayIndex}`}>
      {activities.length===0&&<div className="empty-state">
<Compass size={32}/>
<h3>A day with a blank page.</h3>
<p>Add your first stop, or leave room to wander.</p>
<button className="primary" onClick={()=>open('activity')}>Add a stop</button>
</div>}
      {activities.map((activity,index)=>{const Icon=categoryIcon[activity.category]||Compass;const nextLeg=route.legs.find(l=>l.from.id===activity.id);return <div className="timeline-item" key={activity.id}>
<div className="timeline-time">{activity.time}<span className={`timeline-dot ${activity.status==='done'?'complete':''}`}>{activity.status==='done'?<Check size={11}/>:index+1}</span>
</div>
<article className={`activity-card ${selected===activity.id?'focused':''} ${activity.status==='skipped'?'skipped':''} ${activity.status==='done'?'done':''}`}>
<div className="activity-top">
<span className={`category category-${activity.category}`}>
<Icon size={12}/>{categoryLabel[activity.category]}</span>
<span className="activity-cost">{activity.cost===0?'Free':`${formatMoney(activity.cost)} est.`}</span>
</div>
<button className="activity-select" onClick={()=>setSelected(activity.id)}>
<h4>{activity.title}</h4>
<p>{activity.description}</p>
</button>
<div className="activity-details">
<span>
<Clock size={12}/>{activity.duration} min</span>
<span>
<MapPin size={12}/>{activity.location}</span>
</div>
{activity.event&&<div className="activity-event-note"><span><Ticket size={12}/>{activity.event.provider==='demo'?'Sample event':activity.event.provider==='ticketmaster'?'Ticketmaster event':'Your event'}</span>{activity.event.scheduledDate&&activity.event.scheduledDate!==day.date&&<strong>Originally scheduled {formatDate(activity.event.scheduledDate)} · check before you go</strong>}{activity.bookingUrl&&<a href={safeUrl(activity.bookingUrl)} target="_blank" rel="noreferrer">Ticket details <ArrowUpRight size={12}/></a>}</div>}
<div className="activity-bottom">
<button className={`status-button ${activity.status==='done'?'completed':''}`} onClick={()=>updateActivity(activity.id,a=>({...a,status:a.status==='done'?'planned':'done'}))}>{activity.status==='done'?<>
<CheckCircle2 size={13}/>Been there</>:<>
<Check size={13}/>Mark as done</>}</button>
<div>
<button className="icon-button subtle" aria-label={`Move ${activity.title} earlier`} disabled={index===0} onClick={()=>reorder(activity.id,-1)}>
<ArrowUp size={13}/>
</button>
<button className="icon-button subtle" aria-label={`Move ${activity.title} later`} disabled={index===activities.length-1} onClick={()=>reorder(activity.id,1)}>
<ArrowDown size={13}/>
</button>
<button className="icon-button subtle" aria-label={`Edit ${activity.title}`} onClick={()=>{setEditing(activity);open('activity')}}>
<Pencil size={13}/>
</button>
<button className="icon-button subtle" aria-label={activity.status==='skipped'?`Restore ${activity.title}`:`Skip ${activity.title}`} onClick={()=>updateActivity(activity.id,a=>({...a,status:a.status==='skipped'?'planned':'skipped'}))}>{activity.status==='skipped'?<Plus size={13}/>:<X size={13}/>}</button>
<button className="text-button alternatives" onClick={()=>{setEditing(activity);open('alternatives')}}>Swap <ArrowRight size={12}/>
</button>
</div>
</div>
</article>{nextLeg&&<div className="walking-leg">
<Footprints size={12}/>{nextLeg.minutes} min walk est.<span>·</span>{nextLeg.distanceKm.toFixed(1)} km</div>}</div>})}
      </div>
<button className="add-stop" onClick={()=>{setEditing(null);open('activity')}}>
<Plus size={16}/>A good day always has room for one more.</button>
<p className="estimate-note">Sample ideas & planning estimates. Check opening times, availability, and admission prices before you go. Walking estimates use straight-line distance, not a routed footpath.</p>
      <div className="day-bottom">
<Leaf size={17}/>
<span>Plans change. That’s kind of the point.</span>
<button className="text-button" onClick={()=>setAiOpen(true)}>Find a different rhythm <ArrowUpRight size={13}/>
</button>
</div>
      </div>
<div className={`map-column ${mobileMap?'show-mobile-map':''}`}>
<TripMap trip={trip} activities={activities} selected={selected} onSelect={selectPlace}/>
<div className="map-bottom-tip">
<Sparkles size={17}/>
<div>
<strong>A little room for serendipity.</strong>
<p>Tap a stop to see where the day takes you.</p>
</div>
<button className="icon-button" aria-label="Open travel assistant" onClick={()=>setAiOpen(true)}>
<ArrowUpRight size={18}/>
</button>
</div>
</div>
</div>}
      {view==='discover'&&<div className="content-page">
<div className="page-eyebrow">GOOD PLACES. GOOD COMPANY.</div>
<h1>A little further.</h1>
<p className="page-intro">Find your next city, your kind of people, or an excuse to stay out a little longer.</p>
<div className="discovery-toolbar">
<label className="search-box">
<Search size={18}/>
<input aria-label="Search destinations" placeholder="Where’s your curiosity taking you?" value={search} onChange={e=>setSearch(e.target.value)}/>
</label>
<div className="filter-pills">{['all','culture','outdoors','food'].map(c=>
<button key={c} className={filter===c?'active':''} onClick={()=>setFilter(c)}>{c==='all'?'All moods':categoryLabel[c as keyof typeof categoryLabel]}</button>)}</div>
</div>
<div className="destination-grid">{destinations.filter(d=>d.city.toLowerCase().includes(search.toLowerCase())&&(filter==='all'||JSON.stringify(d).toLowerCase().includes(filter))).map(destination=>
<button className="destination-card" key={destination.city} onClick={()=>{setNewTripCity(destination.city);open('trip')}}>
<img src={destination.image} alt={destination.city} loading="lazy"/>
<span className="destination-days">A few days well spent</span>
<div>
<small>{destination.country}</small>
<h2>{destination.city}<ArrowUpRight size={21}/>
</h2>
</div>
</button>)}</div>
<div className="section-heading">
<div>
<h2>Better with a few new faces.</h2>
<p>Public trips open to join requests.</p>
</div>
<button className="text-button" onClick={()=>open('share')}>Open your trip <Plus size={15}/>
</button>
</div>{!socialReady&&<div className="integration-notice">
<Users size={20}/>
<div>
<strong>Community is being connected.</strong>
<p>Public trips and real join requests need the shared community service. You can share an itinerary link today.</p>
</div>
<button className="text-button" onClick={()=>open('share')}>Share a plan <ArrowRight size={15}/>
</button>
</div>}<div className="community-grid">{publicTrips.map(t=>
<article className="community-card" key={t.id}>
<span className="category">
<Globe size={12}/>Open trip</span>
<h3>{t.title}</h3>
<p>{t.city} · {formatDate(t.startDate)} – {formatDate(t.endDate)}</p>
<button className="primary" onClick={()=>{setJoining(t);open('join')}}>Request to join <ArrowUpRight size={15}/>
</button>
</article>)}</div>
<div className="section-heading">
<div>
<h2>Find something happening.</h2>
<p>Browse events directly with the people who run them.</p>
</div>
</div>
<div className="provider-grid">{[{name:'Meetup',copy:'Local communities & shared interests',url:`https://www.meetup.com/find/?keywords=${encodeURIComponent(trip.city)}`},{name:'Luma',copy:'Small gatherings, big connections',url:'https://luma.com/discover'},{name:'Strava',copy:'Find your next club or group run',url:'https://www.strava.com/clubs/search'},{name:'Ticketmaster',copy:'Music, culture & a night to remember',url:`https://www.ticketmaster.com/search?q=${encodeURIComponent(trip.city)}`}].map(p=>
<a className="provider-card" target="_blank" rel="noreferrer" href={p.url} key={p.name}>
<span>
<strong>{p.name}</strong>
<small>{p.copy}</small>
</span>
<ArrowUpRight size={19}/>
</a>)}</div>
<ProviderPanel key={trip.id} mode="events" city={trip.city} countryCode={trip.countryCode||destinations.find(destination=>destination.city===trip.city&&destination.country===trip.country)?.countryCode} startDate={trip.startDate} endDate={trip.endDate} preferences={getEventPreferences(state.profile)} onAddEvent={planEvent}/>
<EventIdeas trip={trip} preferences={getEventPreferences(state.profile)} onAdd={planEvent}/>
</div>}
      {view==='budget'&&<div className="content-page">
<div className="page-eyebrow">LESS GUESSWORK. MORE GOOD DAYS.</div>
<div className="page-title-line">
<div>
<h1>The whole picture.</h1>
<p className="page-intro">Every flight, little coffee, and unplanned entrance. {trip.city}, all in.</p>
</div>
<button className="primary" onClick={()=>open('expense')}>
<Plus size={16}/>Log expense</button>
</div>
<div className="budget-banner">
<div>
<span>PROJECTED TRIP COST</span>
<h2>{formatMoney(cost.total)}<small>of {formatMoney(trip.budget)}</small>
</h2>
<p>{cost.total<=trip.budget?`${formatMoney(trip.budget-cost.total)} of breathing room.`:`${formatMoney(cost.total-trip.budget)} above your budget. Time for a few little swaps.`}</p>
</div>
<div className="budget-ring" style={{'--progress':`${budgetPercent}%`} as React.CSSProperties}>
<span>{budgetPercent}%<small>of budget</small>
</span>
</div>
</div>
<div className="budget-breakdown">{[{title:'Flights, stays & tickets',amount:cost.bookings,icon:Plane},{title:'Things to do',amount:cost.activities,icon:Ticket},{title:'Food & daily travel',amount:cost.food+cost.transport,icon:Coffee},{title:'Other expenses',amount:cost.manual,icon:Wallet}].map(item=>
<div key={item.title}>
<item.icon size={20}/>
<span>{item.title}</span>
<strong>{formatMoney(item.amount)}</strong>
</div>)}</div>
<div className="budget-preferences">
<div>
<h3>Your everyday rhythm.</h3>
<p>Daily allowances fill gaps around the costs you’ve already planned.</p>
</div>
<form key={`${trip.id}:${trip.budget}:${state.profile.dailyFoodBudget}:${state.profile.dailyTransportBudget}`} onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);setState(s=>({...s,profile:{...s.profile,dailyFoodBudget:Number(f.get('food')),dailyTransportBudget:Number(f.get('transport'))},trips:s.trips.map(t=>t.id===trip.id?{...t,budget:Number(f.get('budget'))}:t)}));notify('Daily spending and trip budget updated.')}}>
<label>Food / day (€)<input type="number" min="0" max="10000" name="food" defaultValue={state.profile.dailyFoodBudget} required/>
</label>
<label>Transport / day (€)<input type="number" min="0" max="10000" name="transport" defaultValue={state.profile.dailyTransportBudget} required/>
</label>
<label>Trip budget (€)<input type="number" min="1" max="1000000" name="budget" defaultValue={trip.budget} required/>
</label>
<button className="primary" type="submit">Save</button>
</form>
</div>
<div className="section-heading">
<div>
<h2>What you’ve actually spent.</h2>
<p>{formatMoney(cost.spent)} recorded · estimates adjust when you link a booking.</p>
</div>
<div className="button-row">
<button className="secondary" onClick={()=>fileInput.current?.click()}>
<Upload size={14}/>Import CSV</button>
<button className="icon-button bordered" aria-label="Download CSV template" onClick={()=>download('trippin-expenses-template.csv','title,amount,date,category\nCoffee,4.50,'+trip.startDate+',food\n','text/csv')}>
<Download size={16}/>
</button>
</div>
</div>
<input ref={fileInput} type="file" accept=".csv,text/csv" hidden onChange={e=>void importCsv(e.target.files?.[0])}/>
<div className="expense-list">{trip.expenses.length===0?<div className="empty-state compact">
<Wallet size={28}/>
<h3>No receipts, no worries.</h3>
<p>Start logging as you go. Your full estimate already includes your daily allowances.</p>
</div>:trip.expenses.map(expense=>
<div className="expense-row" key={expense.id}>
<span className="summary-icon">
<Coffee size={18}/>
</span>
<span>
<strong>{expense.title}</strong>
<small>{formatDate(expense.date)} · {categoryLabel[expense.category]}</small>
</span>
<b>{formatMoney(expense.amount)}</b>
<button className="icon-button" aria-label={`Delete expense ${expense.title}`} onClick={()=>updateTrip(t=>({...t,expenses:t.expenses.filter(x=>x.id!==expense.id)}))}>
<Trash2 size={14}/>
</button>
</div>)}</div>
<p className="estimate-note">EUR planning estimates. CSV imports stay in your browser. Use positive expense amounts and headers title,amount,date,category. Bank connections require approved provider setup; no bank credentials are collected.</p>
<StayComparison nights={Math.max(1,trip.days.length-1)} days={trip.days.length}/>
<BankPreferences onApply={(food,transport)=>{setState(s=>({...s,profile:{...s.profile,dailyFoodBudget:food,dailyTransportBudget:transport}}));notify('Daily preferences updated from Sandbox estimates.')}}/>
</div>}
      {view==='bookings'&&<div className="content-page">
<div className="page-eyebrow">THE DETAILS, TAKEN CARE OF.</div>
<div className="page-title-line">
<div>
<h1>Less digging. More going.</h1>
<p className="page-intro">Your flights, your stay, your tickets. Right where you need them.</p>
</div>
<button className="primary" onClick={()=>open('booking')}>
<Plus size={16}/>Save reservation</button>
</div>
<div className="booking-list">{trip.bookings.map(booking=>
<article className="booking-card" key={booking.id}>
<div className={`booking-icon ${booking.type}`}>{booking.type==='flight'?<Plane size={23}/>:booking.type==='stay'?<Building2 size={23}/>:<Ticket size={23}/>}</div>
<div className="booking-info">
<span className="page-eyebrow">{booking.type.toUpperCase()} · {booking.source==='demo'?'SAMPLE':booking.status.toUpperCase()}</span>
<h3>{booking.title}</h3>
<p>{formatDate(booking.date)} · {formatMoney(booking.cost)}{booking.status==='estimate'?' estimate':''}</p>{booking.reference&&<span className="booking-reference">Reference: {booking.reference}</span>}{booking.notes&&<p className="booking-notes">{booking.notes}</p>}</div>
<div className="booking-actions">{booking.url&&<a className="secondary" href={safeUrl(booking.url)} target="_blank" rel="noreferrer">View details <ArrowUpRight size={14}/>
</a>}<button className="icon-button" aria-label={`Edit booking ${booking.title}`} onClick={()=>{setEditingBooking(booking);open('booking')}}><Pencil size={15}/></button><button className="icon-button" aria-label={`Remove booking ${booking.title}`} onClick={()=>removeBooking(booking)}>
<Trash2 size={15}/>
</button>
</div>
</article>)}{trip.bookings.length===0&&<div className="empty-state">
<Ticket size={36}/>
<h3>Everything has its place.</h3>
<p>Save your first flight, stay, or event reservation.</p>
<button className="primary" onClick={()=>open('booking')}>Save a reservation</button>
</div>}</div>
<div className="section-heading">
<div>
<h2>Find your way there.</h2>
<p>Search and book with the provider, then save the details here.</p>
</div>
</div>
<div className="provider-grid">{[{name:'Google Flights',copy:'Find a flight that fits your days',url:`https://www.google.com/travel/flights?q=flights+to+${encodeURIComponent(trip.city)}`},{name:'Airbnb',copy:'A little place to call home',url:`https://www.airbnb.com/s/${encodeURIComponent(trip.city)}/homes`},{name:'Booking.com',copy:'Compare stays in your neighborhood',url:`https://www.booking.com/searchresults.html?ss=${encodeURIComponent(trip.city)}`}].map(p=>
<a className="provider-card" href={p.url} key={p.name} target="_blank" rel="noreferrer">
<span>
<strong>{p.name}</strong>
<small>{p.copy}</small>
</span>
<ArrowUpRight size={18}/>
</a>)}</div>
<ProviderPanel key={trip.id} mode="flights" city={trip.city}/>
</div>}
      {view==='profile'&&<div className="content-page profile-page">
<div className="page-eyebrow">A PASSPORT TO YOUR KIND OF TRAVEL.</div>
<h1>A little about you.</h1>
<p className="page-intro">Less tourist checklist. More things that feel like you.</p>
<form className="profile-form" key={JSON.stringify(state.profile)} onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);setState(s=>({...s,profile:{...s.profile,name:field(f,'name'),bio:field(f,'bio'),homeCity:field(f,'homeCity'),interests:f.getAll('interest').map(String),openToEvents:f.getAll('eventType').map(String) as Profile['openToEvents']}}));notify('Profile updated. Here’s to your next chapter.')}}>
<div className="profile-intro">
<span className="avatar large">{state.profile.name.slice(0,1)}</span>
<span>
<strong>{state.profile.name}</strong>
<small>{state.trips.length} chapters in the making · private browser profile</small>
</span>
</div>
<div className="form-grid">
<label>Your name<input name="name" defaultValue={state.profile.name} maxLength={80} required/>
</label>
<label>Home city<input name="homeCity" defaultValue={state.profile.homeCity} maxLength={80}/>
</label>
</div>
<label>A few words about you<textarea name="bio" defaultValue={state.profile.bio} maxLength={500}/>
</label>
<h3>What makes you say “let’s go”?</h3>
<div className="interest-picker">{['culture','food','outdoors','nightlife','community'].map(c=>{const Icon=categoryIcon[c as keyof typeof categoryIcon];return<label key={c}>
<input type="checkbox" name="interest" value={c} defaultChecked={state.profile.interests.some(interest=>(interestAliases[c]||[]).includes(interest.toLowerCase()))}/>
<span>
<Icon size={16}/>{categoryLabel[c as keyof typeof categoryLabel]}</span>
</label>})}</div>
<h3>What events would you be open to?</h3>
<p className="form-note">These choices filter event ideas. Use All events in Discover whenever you want to try something different.</p>
<div className="interest-picker">{(['culture','food','outdoors','nightlife','community'] as const).map(category=>{const Icon=categoryIcon[category];return <label key={category}><input type="checkbox" name="eventType" value={category} defaultChecked={getEventPreferences(state.profile).includes(category)}/><span><Icon size={16}/>{categoryLabel[category]}</span></label>})}</div>
<button className="primary" type="submit">Save your profile <Check size={16}/>
</button>
</form>
<div className="section-heading">
<div>
<h2>Little moments. Lasting memories.</h2>
<p>Country and individual event badges follow the moments you mark done. Attendance is self-reported.</p>
</div>
</div>
<div className="badges">{getTravelBadges(state.trips).map(badge=><div key={badge.id} className={badge.earned?'':'locked'}><span>{badge.icon==='flag'?'◎':badge.icon==='users'?'✳':badge.icon==='ticket'?<Ticket size={32}/>:'✺'}</span><strong>{badge.title}</strong><small>{badge.description}</small></div>)}</div>
<TripRecap trip={trip} profile={state.profile}/>
<div className="integration-notice">
<ShieldCheck size={21}/>
<div>
<strong>Your travels, in your hands.</strong>
<p>Profiles, expenses, and reservations save in this browser. Export a backup to take them with you.</p>
</div>
<button className="secondary" onClick={()=>{try{const backup=exportWorkspaceBackup(state);download(backup.withinWorkspaceLimit?'trippin-backup.json':'trippin-recovery.json',backup.serialized);if(!backup.withinWorkspaceLimit)notify('Recovery archive prepared. Keep the file; it needs repair or a smaller workspace before restoring as a whole.')}catch(e){notify(e instanceof Error?e.message:'Could not export. Keep this tab open.')}}}>
<Download size={15}/>Export backup</button>
</div>
<button className="text-button" onClick={()=>backupInput.current?.click()}>
<Upload size={14}/>Restore a Trippin backup</button>
<input ref={backupInput} type="file" accept="application/json,.json" hidden onChange={async e=>{const input=e.currentTarget,file=input.files?.[0],generation=++backupReadGeneration.current;if(!file)return;try{if(file.size>MAX_BACKUP_FILE_BYTES)throw new Error('Choose a backup of 16 MiB or smaller. Your current trips are unchanged.');const bytes=new Uint8Array(await file.arrayBuffer());if(generation!==backupReadGeneration.current)return;const restored=parseWorkspaceBackup(bytes);if(persistWorkspace(restored,serialized=>localStorage.setItem(storageKey,serialized))!=='saved')throw new Error('The backup could not be saved in this browser. Your current trips are unchanged; keep the backup file.');pendingPlan.current=null;setState(restored);setDayIndex(0);setSelected(null);notify('Backup restored and saved in this browser.')}catch(e){if(generation===backupReadGeneration.current)notify(e instanceof Error?e.message:'This is not a valid Trippin backup. Your current trips are unchanged.')}finally{if(generation===backupReadGeneration.current)input.value=''}}}/>
</div>}
    </main>
    {view==='itinerary'&&<button className="mobile-map-toggle primary" onClick={()=>setMobileMap(!mobileMap)}>{mobileMap?<>
<LayoutList size={17}/>Show itinerary</>:<>
<Map size={17}/>Show map</>}</button>}
    {toast&&<div className="toast" role="status">
<CheckCircle2 size={17}/>{toast}<button className="icon-button" aria-label="Dismiss notification" onClick={()=>setToast('')}>
<X size={15}/>
</button>
</div>}
    {modal&&<Dialog title={modal==='trip'?'A new chapter.':modal==='event'?'Make it part of your trip.':modal==='activity'?(editing?'Change the plan.':'A good little detour.'):modal==='expense'?'A little expense.':modal==='booking'?'Keep the details close.':modal==='share'?'Good plans are worth sharing.':modal==='alternatives'?'A different kind of good.':modal==='join'?'A few new faces.':'A few helpful details.'} onClose={close} wide={modal==='settings'}>
      {error&&<div role="alert" className="form-error">{error}</div>}
      {modal==='trip'&&<NewTripForm onCreate={addTrip} initialCity={newTripCity}/>}
      {modal==='event'&&eventDraft&&<EventPlanForm draft={eventDraft} trip={trip} onSave={saveEvent}/>}
      {modal==='tripSettings'&&<TripSettings trip={trip} canDelete={state.trips.length>1} onSave={updated=>{updateTrip(()=>updated);setDayIndex(0);setSelected(null);close();notify('Trip details updated. Your agenda is ready to keep moving.')}} onDelete={()=>{setState(s=>{const remaining=s.trips.filter(t=>t.id!==trip.id);return{...s,trips:remaining,selectedTripId:remaining[0].id}});setDayIndex(0);setSelected(null);close();notify('Trip deleted from this browser.')}}/>}
      {modal==='activity'&&<form className="dialog-form" onSubmit={submitActivity}>
<label>What’s the plan?<input name="title" defaultValue={editing?.title} required maxLength={140} placeholder="Coffee, then see where we end up"/>
</label>
<div className="form-grid">
<label>Kind of moment<select name="category" defaultValue={editing?.category||'culture'}>{categories.map(c=>
<option value={c} key={c}>{categoryLabel[c]}</option>)}</select>
</label>
<label>Start time<input name="time" type="time" defaultValue={editing?.time||'10:00'} required/>
</label>
</div>
<label>Little details<textarea name="description" defaultValue={editing?.description} maxLength={600} placeholder="Why it caught your eye…"/>
</label>
<label>Place or neighborhood<input name="location" defaultValue={editing?.location} maxLength={120} required/>
</label>
<label className="event-checkbox"><input type="checkbox" name="isEvent" defaultChecked={Boolean(editing?.event)}/><span>This stop is an event · earn its badge when marked done</span></label>
<div className="form-grid">
<label>Time to enjoy it (min)<input name="duration" type="number" min="5" max="1440" defaultValue={editing?.duration||60} required/>
</label>
<label>Cost estimate (€)<input name="cost" type="number" min="0" max="100000" step="0.01" defaultValue={editing?.cost||0} required/>
</label>
</div>
<details>
<summary>Map pin & booking link</summary>
<div className="form-grid">
<label>Latitude<input type="number" name="lat" step="any" min="-90" max="90" defaultValue={editing?.lat??trip.lat} required/>
</label>
<label>Longitude<input type="number" name="lng" step="any" min="-180" max="180" defaultValue={editing?.lng??trip.lng} required/>
</label>
</div>
<label>Booking or information URL<input name="url" type="url" defaultValue={editing?.bookingUrl} placeholder="https://…"/>
</label>
<small>New stops start at the city center. Adjust coordinates for an accurate pin.</small>
</details>
<button className="primary" type="submit">{editing?'Save changes':'Add to my day'} <Check size={16}/>
</button>
</form>}
      {modal==='expense'&&<form className="dialog-form" onSubmit={submitExpense}>
<label>What was it?<input name="title" required maxLength={160} placeholder="The best pretzel of the trip"/>
</label>
<div className="form-grid">
<label>Amount (€)<input name="amount" type="number" min="0.01" max="1000000" step="0.01" required/>
</label>
<label>Date<input name="date" type="date" defaultValue={day.date} required/>
</label>
</div>
<label>Category<select name="category">{categories.map(c=>
<option value={c} key={c}>{categoryLabel[c]}</option>)}</select>
</label>
<label>Replaces a planned cost?<select name="estimate">
<option value="">No, it’s a separate expense</option>{trip.bookings.map(b=>
<option key={b.id} value={`booking:${b.id}`}>Reservation · {b.title}</option>)}{trip.days.flatMap(d=>d.activities).filter(a=>!a.alternativeFor).map(a=><option key={a.id} value={`activity:${a.id}`}>Activity · {a.title}</option>)}</select>
</label>
<button className="primary" type="submit">Log expense <Check size={16}/>
</button>
</form>}
      {modal==='booking'&&<form className="dialog-form" onSubmit={submitBooking}>
<div className="form-grid">
<label>Reservation type<select name="type" defaultValue={editingBooking?.type}>
<option value="flight">Flight</option>
<option value="stay">Stay</option>
<option value="event">Event</option>
</select>
</label>
<label>Status<select name="status" defaultValue={editingBooking?.status}>
<option value="reserved">Reserved</option>
<option value="estimate">Still an estimate</option>
</select>
</label>
</div>
<label>Title<input name="title" defaultValue={editingBooking?.title} placeholder="Madrid → Munich · LH1801" maxLength={160} required/>
</label>
<div className="form-grid">
<label>Date<input name="date" type="date" defaultValue={editingBooking?.date||trip.startDate} required/>
</label>
<label>Total cost (€)<input name="cost" type="number" min="0" max="1000000" step="0.01" defaultValue={editingBooking?.cost} required/>
</label>
</div>
<label>Booking reference<input name="reference" defaultValue={editingBooking?.reference} maxLength={80} placeholder="Optional — stays private in this browser"/>
</label>
<label>Replaces an itinerary cost?<select name="activityId" defaultValue={editingBooking?.activityId||''}><option value="">No, it’s separate from my stops</option>{editingBooking?.activityId&&<option value={editingBooking.activityId}>{trip.days.flatMap(d=>d.activities).find(a=>a.id===editingBooking.activityId)?.title||'Previously linked stop (removed from agenda)'}</option>}{trip.days.flatMap(d=>d.activities).filter(a=>a.id!==editingBooking?.activityId&&!a.alternativeFor&&!trip.bookings.some(b=>b.activityId===a.id&&b.id!==editingBooking?.id)).map(a=><option key={a.id} value={a.id}>{a.title}</option>)}</select></label>
<label>Booking or ticket URL<input name="url" type="url" defaultValue={editingBooking?.url} placeholder="https://…"/>
</label>
<label>Anything else?<textarea name="notes" defaultValue={editingBooking?.notes} maxLength={800} placeholder="Check-in time, seat number, a little reminder…"/>
</label>
<button className="primary" type="submit">Save reservation <Ticket size={16}/>
</button>
</form>}
      {modal==='share'&&<div className="dialog-form">
<p>Share the places and plans. Booking references and expenses stay private.</p>
<button className="share-choice" onClick={()=>void shareSnapshot()}>
<LinkIcon size={22}/>
<span>
<strong>Share an itinerary link</strong>
<small>A snapshot of your plan. Anyone with the link can save a copy.</small>
</span>
<ArrowUpRight size={18}/>
</button>
<button className="share-choice" disabled={!socialReady||busy} onClick={()=>void publish()}>
<Users size={22}/>
<span>
<strong>{busy?'Opening your trip…':'Open your trip to new people'}</strong>
<small>{socialReady?'Publish to Discover and receive join requests.':'Shared community service needs setup.'}</small>
</span>
<ArrowUpRight size={18}/>
</button>{shareUrl&&<label>Your share link<input readOnly value={shareUrl} onFocus={e=>e.target.select()}/>
</label>}{trip.isPublic&&<div className="host-actions"><button className="secondary" disabled={busy} onClick={()=>void reviewRequests()}>Review join requests</button><button className="text-button" disabled={busy} onClick={()=>void unpublish()}>Unpublish trip</button></div>}
{requests&&<div className="join-requests">{requests.length===0?<p>No requests yet. Your next travel friend might be on their way.</p>:requests.map(request=><article key={request.id}><strong>{request.name}<small>{request.status}</small></strong><p>{request.message}</p><span>{request.contact}</span>{request.status==='pending'&&<div className="button-row"><button className="primary" disabled={busy} onClick={()=>void decideRequest(request.id,'accepted')}>Accept</button><button className="secondary" disabled={busy} onClick={()=>void decideRequest(request.id,'declined')}>Decline</button></div>}</article>)}</div>}
<button className="text-button" onClick={()=>download(`${trip.city.toLowerCase()}-trip.json`,JSON.stringify(snapshot(),null,2))}>
<Download size={15}/>Download a private-details-free plan</button>
</div>}
      {modal==='alternatives'&&<div className="dialog-form">
<p>A change of weather, mood, or mind. Pick a different stop for {editing?.time}.</p>{trip.days.flatMap(d=>d.activities).filter(a=>a.id!==editing?.id&&(a.alternativeFor===editing?.id||(!a.alternativeFor&&a.status!=='skipped'))).sort((a,b)=>Number(b.alternativeFor===editing?.id)-Number(a.alternativeFor===editing?.id)).slice(0,7).map(a=>{const Icon=categoryIcon[a.category];return <button className="alternative-option" key={a.id} onClick={()=>chooseAlternative(a)}>
<span className={`category category-${a.category}`}>
<Icon size={14}/>
</span>
<span>
<strong>{a.title}</strong>
<small>{a.duration} min · {a.cost===0?'Free':formatMoney(a.cost)+' est.'}</small>
</span>
<ArrowRight size={16}/>
</button>})}<button className="secondary" onClick={()=>setModal('activity')}>
<Plus size={15}/>Make your own alternative</button>
</div>}
      {modal==='join'&&joining&&<form className="dialog-form" onSubmit={sendJoin}>
<p>
<strong>{joining.title}</strong>
<br/>{joining.city} · {formatDate(joining.startDate)} — {formatDate(joining.endDate)}</p>
<label>Your name<input name="name" defaultValue={state.profile.name} required maxLength={80}/>
</label>
<label>A little introduction<textarea name="message" maxLength={600} required placeholder="What brings you here? What would you love to do?"/>
</label>
<label>Contact for the host<input name="contact" required maxLength={160} placeholder="An email or public social handle"/>
</label>
<p className="form-note">The host can see your introduction and contact. Profiles are self-reported; meet thoughtfully in public places.</p>
<button className="primary" disabled={!socialReady||busy} type="submit">{busy?'Sending…':'Request to join'} <ArrowUpRight size={16}/>
</button>
</form>}
      {modal==='settings'&&<div className="dialog-form">
<p>Trippin keeps your trip flexible and your travel details together.</p>
<div className="settings-grid">
<div>
<Compass size={22}/>
<h3>Shape your days.</h3>
<p>Add, edit, reorder, skip, or swap a stop. The map and estimates follow along.</p>
</div>
<div>
<Wallet size={22}/>
<h3>See the whole cost.</h3>
<p>Reservations, admissions, daily food and transport, and linked actual spending in one estimate.</p>
</div>
<div>
<ShieldCheck size={22}/>
<h3>Keep your own copy.</h3>
<p>Your browser saves your workspace. Export and restore backups from your profile.</p>
</div>
<div>
<Users size={22}/>
<h3>Share on your terms.</h3>
<p>Itinerary links omit booking references and expenses. Public trips need the community service.</p>
</div>
</div>
<h3>Connection status</h3>
<div className="connection-row">
<span>Maps · OpenStreetMap</span>
<span className="connection-status">Public tiles</span>
</div>
<div className="connection-row">
<span>Weather · Open-Meteo</span>
<span className="connection-status">{weather?'Connected':'Unavailable'}</span>
</div>
<div className="connection-row">
<span>Public trips & requests</span>
<span>{socialReady?'Connected':'Setup needed'}</span>
</div>
<div className="connection-row">
<span>Airbnb · Meetup · Luma · Strava</span>
<span>External links</span>
</div>
<div className="connection-row">
<span>Bank accounts · Flight status</span>
<span>Provider setup needed</span>
</div>
<p className="form-note">Sample trips are inspiration. We don’t claim sample prices, events, travelers, or reservations are live availability. External booking providers handle purchases.</p>
<a className="text-button" href="https://github.com/alvarovillalbaa/trippin" target="_blank" rel="noreferrer">Source & setup guide <ExternalLink size={14}/>
</a>
</div>}
    </Dialog>}
    {aiOpen&&<AiChat context={aiContext} onClose={()=>setAiOpen(false)}/>}
  </div>;
}
