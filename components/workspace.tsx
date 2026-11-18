'use client';

import {useCallback,useEffect,useLayoutEffect,useMemo,useReducer,useRef,useState, type FormEvent, type KeyboardEvent} from 'react';
import dynamic from 'next/dynamic';
import {ArrowUpRight,ArrowLeft,ArrowRight,ArrowUp,ArrowDown,Plus,MapPin,CalendarDays,Compass,Wallet,Ticket,ChevronDown,ChevronRight,Check,CheckCircle2,Clock,Footprints,Plane,Building2,Coffee,Sun,CloudSun,Users,Share2,Sparkles,Settings2,Search,Heart,Leaf,Mountain,Music2,Utensils,Landmark,MoreHorizontal,Download,Upload,ExternalLink,Trash2,Map,LayoutList,Pencil,X,Globe,ShieldCheck,Route,BookOpen,Link as LinkIcon} from 'lucide-react';
import {destinations} from '@/lib/data';
import {formatMoney,formatDate,getTripCost,getTripDays,getWalkingRoute,getTravelBadges,getEventPreferences,isTrip,makeId,publicTripSnapshot,importSharedPlan,persistWorkspace,MAX_BACKUP_FILE_BYTES,exportWorkspaceBackup,parseWorkspaceBackup} from '@/lib/trip';
import type {Trip,Activity,Booking,Expense,Profile,WorkspaceState} from '@/lib/types';
import {parseExpenseCsv} from '@/lib/csv';
import {createWorkspaceEditor,workspaceReducer,type WorkspaceUpdate,type CsvImportTicket,type TripEditTicket} from '@/lib/workspace-state';
import {COMMUNITY_MANAGEMENT_KEY,type ManagedTrip} from '@/lib/community-management';
import {readManagedStorage,preserveManagedStorage,reserveManagedPublication,confirmManagedPublicationStorage,snapshotManagedUnpublish,confirmManagedUnpublishStorage} from '@/lib/community-management-storage';
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
import {accountManagedStorage,type AccountUser} from '@/lib/account-workspace';
import {getGoogleMapsRoutes} from '@/lib/maps';

const TripMap=dynamic(()=>import('./trip-map'),{ssr:false,loading:()=> <div className="map-panel map-loading">
<Compass size={32}/>
<span>Finding your bearings…</span>
</div>});
const COMMUNITY_TIMEOUT_MS=20_000;
type View='itinerary'|'bookings'|'profile';
type Modal='trip'|'tripSettings'|'activity'|'event'|'expense'|'booking'|'share'|'settings'|'alternatives'|'join'|null;
type CommunityRequest={id:string;name:string;message:string;contact:string;status:'pending'|'accepted'|'declined'};
type CommunityOperation={action:'publish'|'unpublish'|'review'|'decision'|'join';tripId:string;identity:number|undefined;epoch:number;controller:AbortController;timer?:ReturnType<typeof setTimeout>};
const categories=['culture','food','outdoors','nightlife','community','transport','stay','other'] as const;
const categoryIcon={culture:Landmark,food:Utensils,outdoors:Leaf,nightlife:Music2,community:Users,transport:Plane,stay:Building2,other:Compass};
const categoryLabel={culture:'Culture',food:'Food & drink',outdoors:'Outdoors',nightlife:'After hours',community:'Meet people',transport:'Transport',stay:'Accommodation',other:'Something else'};
const interestAliases:Record<string,string[]>={culture:['culture','architecture','art','design'],food:['food','coffee','local food'],outdoors:['outdoors','running','cycling'],nightlife:['nightlife','music'],community:['community','meet people']};

function field(form:FormData,name:string){return String(form.get(name)||'').trim()}
function download(name:string,data:string,type='application/json'){const url=URL.createObjectURL(new Blob([data],{type}));const link=document.createElement('a');link.href=url;link.download=name;link.click();URL.revokeObjectURL(url)}
function safeUrl(value:string){try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)?url.href:undefined}catch{return undefined}}
function dayLabel(date:string){return new Date(`${date}T12:00:00`).toLocaleDateString('en-GB',{weekday:'short',day:'numeric'})}

export default function Workspace({initialState,storageKey,account,accountError,onCheckAccount,onHome,onLogout,accountBusy,onEmpty,initialSharedPlan}:{
  initialState:WorkspaceState;storageKey:string;account:AccountUser|null;accountError:string;onHome:()=>void;onLogout:()=>void;accountBusy:boolean;
  onCheckAccount?:()=>void;
  onEmpty:(value:WorkspaceState)=>void;initialSharedPlan?:{tripId:string;hash:string};
}){
  const localStorage=useMemo(()=>accountManagedStorage(()=>window.localStorage,account),[account]);
  const storagePrefix=account?`trippin.account.${account.id.toLowerCase()}.`:'';
  const [workspaceEdit,dispatchWorkspace]=useReducer(workspaceReducer,initialState,createWorkspaceEditor);
  const state=workspaceEdit.workspace;
  const setState=useCallback((update:WorkspaceUpdate)=>dispatchWorkspace({type:'update',update}),[]);
  const [ready,setReady]=useState(false);
  const [view,setView]=useState<View>('itinerary');
  const [budgetOpen,setBudgetOpen]=useState(false);
  const [dayIndex,setDayIndex]=useState(0);
  const [modal,setModal]=useState<Modal>(null);
  const [editing,setEditing]=useState<Activity|null>(null);
  const [customAlternativeFor,setCustomAlternativeFor]=useState<Activity|null>(null);
  const [editingBooking,setEditingBooking]=useState<Booking|null>(null);
  const [eventDraft,setEventDraft]=useState<EventPlanDraft|null>(null);
  const [newTripCity,setNewTripCity]=useState<string|undefined>(undefined);
  const [selected,setSelected]=useState<string|null>(null);
  const [mobileMap,setMobileMap]=useState(false);
  const [aiOpen,setAiOpen]=useState(false);
  const [toast,setToast]=useState('');
  const [saveError,setSaveError]=useState('');
  const [leaveRequested,setLeaveRequested]=useState(false);
  const [error,setError]=useState('');
  const [tripEditPending,setTripEditPending]=useState(false);
  const [weather,setWeather]=useState<{temperature:number;code:number}|null>(null);
  const [socialReady,setSocialReady]=useState(false);
  const [publicTrips,setPublicTrips]=useState<Trip[]>([]);
  const [joining,setJoining]=useState<Trip|null>(null);
  const [shareUrl,setShareUrl]=useState('');
  const [busy,setBusy]=useState(false);
  const [requests,setRequests]=useState<CommunityRequest[]|null>(null);
  const [managedTrips,setManagedTrips]=useState<ManagedTrip[]>([]);
  const [managementError,setManagementError]=useState('');
  const [shareTripId,setShareTripId]=useState<string|null>(null);
  const tripPanels=useRef<HTMLDivElement>(null);
  const mapSwitchRequested=useRef(false);
  const fileInput=useRef<HTMLInputElement>(null);
  const activityForm=useRef<HTMLFormElement>(null);
  const customAlternativeTicket=useRef<{tripId:string;identity:number|undefined}|null>(null);
  const tripEditGeneration=useRef(0);
  const pendingTripEdit=useRef<{ticket:TripEditTicket;onSuccess:()=>void}|null>(null);
  const csvReadGeneration=useRef(0);
  const backupInput=useRef<HTMLInputElement>(null);
  const backupReadGeneration=useRef(0);
  const initialized=useRef(false);
  const pendingPlan=useRef<{tripId:string;hash:string}|null>(null);
  const pendingExit=useRef<(()=>void)|null>(null);
  const departureGeneration=useRef(0);
  const workspaceRef=useRef(workspaceEdit);
  const mountedRef=useRef(true);
  const modalEpoch=useRef(0);
  const communityRequestRef=useRef<CommunityOperation|null>(null);
  const trip=state.trips.find(t=>t.id===state.selectedTripId)||state.trips[0];
  const day=trip.days[Math.min(dayIndex,trip.days.length-1)];
  const activities=useMemo(()=>day?.activities.filter(a=>!a.alternativeFor)||[],[day]);
  const cost=getTripCost(trip,state.profile);
  const route=getWalkingRoute(activities);
  const mapsRoutes=getGoogleMapsRoutes(activities);
  const shareId=shareTripId??trip.id;
  const shareTrip=state.trips.find(item=>item.id===shareId);
  const managedTrip=managedTrips.find(item=>item.id===shareId);
  const notify=(message:string)=>{setToast(message)};
  const selectPlace=useCallback((id:string)=>setSelected(id),[]);
  const toggleMobileMap=()=>{mapSwitchRequested.current=true;setMobileMap(value=>!value)};
  const close=()=>{modalEpoch.current++;customAlternativeTicket.current=null;pendingTripEdit.current=null;setTripEditPending(false);setModal(null);setError('');setEditing(null);setCustomAlternativeFor(null);setEditingBooking(null);setEventDraft(null);setShareUrl('');setRequests(null);setShareTripId(null)};
  const open=(value:Modal,targetId?:string)=>{modalEpoch.current++;customAlternativeTicket.current=null;pendingTripEdit.current=null;setTripEditPending(false);setCustomAlternativeFor(null);setError('');setShareUrl('');setRequests(null);setShareTripId(value==='share'?(targetId??trip.id):null);setModal(value)};
  const beginCustomAlternative=()=>{if(!editing)return;customAlternativeTicket.current={tripId:trip.id,identity:workspaceEdit.tripIdentities.get(trip.id)};setCustomAlternativeFor(editing);setEditing(null);setError('');setModal('activity')};
  const updateTrip=(updater:(value:Trip)=>Trip)=>setState(s=>({...s,trips:s.trips.map(t=>t.id===trip.id?updater(t):t)}));
  const commitTripEdit=(update:(current:Trip)=>Trip,onSuccess:()=>void)=>{
    if(pendingTripEdit.current){setError('Your previous edit is still being applied. Please wait.');return}
    const ticket:TripEditTicket={tripId:trip.id,identity:workspaceEdit.tripIdentities.get(trip.id),requestId:++tripEditGeneration.current,epoch:modalEpoch.current};
    pendingTripEdit.current={ticket,onSuccess};setTripEditPending(true);
    dispatchWorkspace({type:'trip-edit',ticket,update});
  };
  const updateActivity=(id:string,updater:(a:Activity)=>Activity)=>updateTrip(t=>({...t,days:t.days.map(d=>({...d,activities:d.activities.map(a=>a.id===id?updater(a):a)}))}));
  const selectTrip=(id:string)=>{modalEpoch.current++;setState(s=>({...s,selectedTripId:id}));setDayIndex(0);setSelected(null);setView('itinerary');setBudgetOpen(false);setMobileMap(false)};
  const selectDay=(index:number)=>{setDayIndex(index);setSelected(null)};
  const handleDayKey=(event:KeyboardEvent<HTMLButtonElement>,index:number)=>{
    if(event.altKey||event.ctrlKey||event.metaKey)return;
    let target:number;
    switch(event.key){
      case 'ArrowRight':target=(index+1)%trip.days.length;break;
      case 'ArrowLeft':target=(index+trip.days.length-1)%trip.days.length;break;
      case 'Home':target=0;break;
      case 'End':target=trip.days.length-1;break;
      default:return;
    }
    event.preventDefault();selectDay(target);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[target]?.focus();
  };
  const refreshManagement=(records:ManagedTrip[])=>{setManagedTrips(records);setManagementError('');return records};
  const preserveManagement=(trips:Trip[])=>refreshManagement(preserveManagedStorage(localStorage,trips));
  const beginCommunity=(action:CommunityOperation['action'],id:string)=>{
    if(!mountedRef.current||!ready)return null;
    if(communityRequestRef.current){setError('A community request is still being confirmed. Please wait.');return null}
    const request:CommunityOperation={action,tripId:id,identity:workspaceRef.current.tripIdentities.get(id),epoch:modalEpoch.current,controller:new AbortController()};
    communityRequestRef.current=request;setBusy(true);setError('');return request;
  };
  const ownsCommunity=(request:CommunityOperation)=>mountedRef.current&&communityRequestRef.current===request;
  const ownsCommunityUi=(request:CommunityOperation)=>ownsCommunity(request)&&modalEpoch.current===request.epoch;
  const ownerForPublication=(request:CommunityOperation)=>{
    const existing=localStorage.getItem('trippin.owner');if(existing)return existing;
    if(!navigator.locks)throw new Error('This browser cannot safely initialize publishing access. Try an up-to-date browser.');
    return navigator.locks.request(storagePrefix+'trippin.owner.initialize',{signal:request.controller.signal},()=>{
      const saved=localStorage.getItem('trippin.owner');if(saved)return saved;
      const owner=crypto.randomUUID()+crypto.randomUUID();localStorage.setItem('trippin.owner',owner);return owner;
    });
  };
  const finishCommunity=(request:CommunityOperation)=>{clearTimeout(request.timer);if(communityRequestRef.current===request){communityRequestRef.current=null;if(mountedRef.current)setBusy(false)}};
  const communityDelivery=(request:CommunityOperation,url:string,init?:RequestInit)=>Promise.race([
    fetch(url,{...init,signal:request.controller.signal}).then(async response=>({response,data:await response.json()})),
    new Promise<never>((_,reject)=>{request.timer=setTimeout(()=>{request.controller.abort();reject(new Error('The community response timed out. Its outcome could not be confirmed.'))},COMMUNITY_TIMEOUT_MS)}),
  ]);
  const persistCurrentWorkspace=(value=workspaceRef.current.workspace)=>{
    const pending=pendingPlan.current,includesPlan=pending&&value.trips.some(t=>t.id===pending.tripId);
    const result=persistWorkspace(value,serialized=>{localStorage.setItem(storageKey,serialized);if(localStorage.getItem(storageKey)!==serialized)throw new Error('Save readback failed.')},includesPlan&&pending?()=>{
      const url=new URL(window.location.href);
      if(url.hash===pending.hash){url.hash='';window.history.replaceState(window.history.state,'',url.href)}
    }:undefined);
    if(result==='unsaved')setSaveError(includesPlan?'This itinerary and your latest edits are only here for this visit. Keep the shared link or download a backup before leaving.':'Your latest changes could not be saved in this browser. Retry the save or download a backup before leaving.');
    else{
      setSaveError('');pendingExit.current=null;setLeaveRequested(false);
      if(pending){
        if(result==='link-retained')setToast('Shared itinerary saved. The link could not be cleared; open Trippin home before reloading.');
        else{pendingPlan.current=null;if(includesPlan)setToast('Shared itinerary saved as a new trip in your browser.')}
      }
    }
    return result;
  };
  const leaveWorkspace=(action:()=>void)=>{
    if(pendingTripEdit.current){setError('Your edit is still being applied. Please wait before leaving.');return}
    if(persistCurrentWorkspace()==='unsaved'){pendingExit.current=action;setLeaveRequested(true);return}
    departureGeneration.current++;backupReadGeneration.current++;if(backupInput.current)backupInput.current.value='';if(fileInput.current)fileInput.current.value='';
    action();
  };
  const leaveWithoutSaving=()=>{
    const action=pendingExit.current;pendingExit.current=null;setLeaveRequested(false);
    if(action){departureGeneration.current++;backupReadGeneration.current++;if(backupInput.current)backupInput.current.value='';if(fileInput.current)fileInput.current.value='';action()}
  };
  const exportBackup=()=>{try{const backup=exportWorkspaceBackup(workspaceRef.current.workspace);download(backup.withinWorkspaceLimit?'trippin-backup.json':'trippin-recovery.json',backup.serialized);if(!backup.withinWorkspaceLimit)notify('Recovery archive prepared. Keep the file; it needs repair or a smaller workspace before restoring as a whole.')}catch(e){notify(e instanceof Error?e.message:'Could not export. Keep this tab open.')}};

  useLayoutEffect(()=>{workspaceRef.current=workspaceEdit},[workspaceEdit]);
  useEffect(()=>{
    const notice=workspaceEdit.editNotice,pending=pendingTripEdit.current;
    if(!notice||!pending||notice.ticket.requestId!==pending.ticket.requestId)return;
    pendingTripEdit.current=null;setTripEditPending(false);
    if(notice.ticket.epoch!==modalEpoch.current)return;
    if(!notice.accepted){setError(notice.message);return}
    pending.onSuccess();
  },[workspaceEdit.editNotice]);
  useEffect(()=>{if(modal==='activity')activityForm.current?.querySelector<HTMLInputElement>('input:not([disabled])')?.focus()},[modal,customAlternativeFor?.id]);
  useLayoutEffect(()=>{
    if(!mapSwitchRequested.current)return;
    mapSwitchRequested.current=false;
    tripPanels.current?.scrollIntoView({block:'start'});
  },[mobileMap]);
  useEffect(()=>{
    mountedRef.current=true;
    return()=>{mountedRef.current=false;modalEpoch.current++;backupReadGeneration.current++;const request=communityRequestRef.current;communityRequestRef.current=null;clearTimeout(request?.timer);request?.controller.abort()};
  },[]);
  useEffect(()=>{
    const refresh=(event:StorageEvent)=>{if(event.key===null||event.key.startsWith(storagePrefix+COMMUNITY_MANAGEMENT_KEY+':')){
      try{refreshManagement(readManagedStorage(localStorage).records)}catch{setManagementError('Management entries could not be read. Existing browser data has been kept.')}
    }};
    window.addEventListener('storage',refresh);
    return()=>window.removeEventListener('storage',refresh);
  },[]);

  useEffect(()=>{
    if(initialized.current)return;
    initialized.current=true;
    const restored=initialState;let notice='';
    try{preserveManagement(restored.trips)}catch{setManagementError('Public-plan management entries could not be loaded or saved. Existing browser data has been kept; publishing is unavailable until it can be preserved.')}
    const sharedPlan=initialSharedPlan?{status:'imported' as const,workspace:restored}:importSharedPlan(restored,window.location.href);
    setState(sharedPlan.workspace);
    if(sharedPlan.status==='imported'){
      pendingPlan.current=initialSharedPlan??{tripId:sharedPlan.workspace.selectedTripId,hash:window.location.hash};
      notice=['Shared itinerary added. Saving it in this browser…',notice].filter(Boolean).join(' ');
    }else if(sharedPlan.status==='full')notice=['Adding this itinerary would exceed this browser’s workspace limit. Your existing trips are unchanged.',notice].filter(Boolean).join(' ');
    else if(sharedPlan.status==='invalid')notice=['This itinerary link is invalid. Your existing trips are unchanged.',notice].filter(Boolean).join(' ');
    if(notice)setToast(notice);
    setReady(true);
    void fetch('/api/community').then(r=>r.json()).then(data=>{setSocialReady(data.available===true);setPublicTrips(Array.isArray(data.trips)?data.trips.filter(isTrip):[])}).catch(()=>{});
    const shared=new URLSearchParams(window.location.search).get('trip');
    const epoch=modalEpoch.current;
    if(shared&&/^[a-zA-Z0-9_-]{1,80}$/.test(shared))void fetch(`/api/community?id=${shared}`).then(r=>r.json()).then(data=>{if(mountedRef.current&&modalEpoch.current===epoch&&!communityRequestRef.current&&isTrip(data.trip)){setJoining(data.trip);modalEpoch.current++;setModal('join')}}).catch(()=>{if(mountedRef.current&&modalEpoch.current===epoch)setToast('This shared trip could not be loaded.')});
  },[]);
  useEffect(()=>{if(workspaceEdit.csvNotice)setToast(workspaceEdit.csvNotice.message)},[workspaceEdit.csvNotice]);
  useEffect(()=>{
    if(!ready)return;
    persistCurrentWorkspace(state);
  },[state,ready]);
  useEffect(()=>{
    if(!saveError&&!tripEditPending)return;
    const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue=''};
    window.addEventListener('beforeunload',warn);
    return()=>window.removeEventListener('beforeunload',warn);
  },[saveError,tripEditPending]);
  useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(''),5000);return()=>clearTimeout(timer)},[toast]);
  useEffect(()=>{
    const controller=new AbortController();setWeather(null);
    void fetch(`https://api.open-meteo.com/v1/forecast?latitude=${trip.lat}&longitude=${trip.lng}&current=temperature_2m,weather_code&timezone=auto`,{signal:controller.signal}).then(r=>r.json()).then(data=>{if(data.current)setWeather({temperature:data.current.temperature_2m,code:data.current.weather_code})}).catch(()=>{});
    return()=>controller.abort();
  },[trip.lat,trip.lng]);

  const addTrip=(next:Trip)=>{if(state.trips.length>=40){setError('Keep up to 40 trips in this browser. Export a backup to archive older trips.');return}setState(s=>({...s,trips:[...s.trips,next],selectedTripId:next.id}));setDayIndex(0);setSelected(null);setView('itinerary');close();notify('New trip, fresh possibilities. Your itinerary is ready to shape.')};
  const planEvent=(draft:EventPlanDraft)=>{setEventDraft(draft);open('event')};
  const saveEvent=(activity:Activity,targetDay:number)=>{const targetId=trip.days[targetDay]?.id;commitTripEdit(current=>{
    if(!current.days.some(d=>d.id===targetId))throw new Error('This trip day changed. Reopen the event before adding it.');
    if(activity.event&&current.days.some(d=>d.activities.some(a=>a.event?.provider===activity.event?.provider&&a.event?.id===activity.event?.id)))throw new Error('This event is already in your trip. Edit its stop instead.');
    return{...current,days:current.days.map(d=>d.id===targetId?{...d,activities:[...d.activities,activity].sort((a,b)=>a.time.localeCompare(b.time))}:d)};
  },()=>{setDayIndex(targetDay);setSelected(activity.id);setView('itinerary');setMobileMap(false);close();notify('Event added to your day and admission budget. Save a linked reservation after booking.')})};
  const submitActivity=(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();setError('');const form=new FormData(event.currentTarget);const lat=Number(form.get('lat')),lng=Number(form.get('lng'));
    if(customAlternativeFor){const ticket=customAlternativeTicket.current,current=workspaceRef.current;if(!ticket||ticket.identity===undefined||ticket.tripId!==trip.id||current.workspace.selectedTripId!==ticket.tripId||current.tripIdentities.get(ticket.tripId)!==ticket.identity){setError('This trip was replaced or changed. Reopen its alternatives before saving.');return}}
    if(!editing&&day.activities.length>=60){setError('Keep up to 60 stops and alternatives in a day.');return}
    if(!field(form,'title')||!field(form,'location')){setError('Add a name and place for this stop.');return}
    if(!field(form,'lat')||!field(form,'lng')||!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180){setError('Enter valid map coordinates.');return}
    const duration=Number(form.get('duration')),cost=Number(form.get('cost'));
    if(!field(form,'duration')||!Number.isInteger(duration)||duration<5||duration>1440){setError('Set a duration between 5 and 1,440 whole minutes.');return}
    if(!field(form,'cost')||!Number.isFinite(cost)||cost<0||cost>100_000){setError('Set a cost estimate between €0 and €100,000.');return}
    const url=field(form,'url'),bookingUrl=safeUrl(url);
    if(url&&!bookingUrl){setError('Use a complete http:// or https:// booking or information URL, or leave it blank.');return}
    const activityId=editing?.id||makeId('activity');
    const activity:Activity={id:activityId,title:field(form,'title'),category:field(form,'category') as Activity['category'],description:field(form,'description'),time:customAlternativeFor?.time||field(form,'time'),duration,cost,lat,lng,location:field(form,'location'),status:editing?.status||'planned',source:editing?.source==='demo'?'demo':'custom',bookingUrl,event:form.get('isEvent')?(editing?.event||{provider:'manual',id:`manual-${activityId}`,scheduledDate:day.date}):undefined};
    if(customAlternativeFor){chooseAlternative(activity,customAlternativeFor,true);return}
    const apply=(current:Trip):Trip=>{
      if(editing&&!current.days.some(d=>d.activities.some(a=>a.id===editing.id)))throw new Error('This stop changed. Reopen it before saving.');
      if(!editing&&!current.days.some(d=>d.id===day.id))throw new Error('This trip day changed. Reopen it before adding a stop.');
      return{...current,days:current.days.map(d=>editing?{...d,activities:d.activities.map(a=>a.id===editing.id?{...a,...activity,status:a.status,source:a.source==='demo'?'demo':'custom'}:a)}:d.id===day.id?{...d,activities:[...d.activities,activity].sort((a,b)=>a.time.localeCompare(b.time))}:d)};
    };
    if(!isTrip(apply(trip))){setError('Check this stop’s time, category, and details before saving.');return}
    commitTripEdit(apply,()=>{close();notify(editing?'Plan updated.':'A little more to look forward to.')});
  };
  const submitExpense=(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();setError('');
    if(trip.expenses.length>=1000){setError('Keep up to 1,000 expenses per trip. Export a backup to archive them.');return}
    const form=new FormData(event.currentTarget),linked=field(form,'estimate');
    if(!field(form,'title')){setError('Add a name for this expense.');return}
    const amount=Number(form.get('amount'));
    if(!field(form,'amount')||!Number.isFinite(amount)||amount<0.01||amount>1_000_000){setError('Enter an expense between €0.01 and €1,000,000.');return}
    const expense:Expense={id:makeId('expense'),title:field(form,'title'),category:field(form,'category') as Expense['category'],amount,date:field(form,'date'),...(linked.startsWith('booking:')?{bookingId:linked.slice(8)}:linked.startsWith('activity:')?{activityId:linked.slice(9)}:{})};
    const apply=(current:Trip):Trip=>({...current,expenses:[...current.expenses,expense]});
    if(!isTrip(apply(trip))){setError('Check the expense date and category. Use a date in YYYY-MM-DD format.');return}
    commitTripEdit(apply,()=>{close();notify('Expense recorded. Your budget is up to date.')});
  };
  const submitBooking=(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();setError('');
    if(!editingBooking&&trip.bookings.length>=100){setError('Keep up to 100 reservations per trip.');return}
    const form=new FormData(event.currentTarget),activityId=field(form,'activityId')||undefined;
    if(activityId&&trip.bookings.some(b=>b.activityId===activityId&&b.id!==editingBooking?.id)){setError('That activity already has a linked reservation. Edit it instead.');return}
    if(!field(form,'title')){setError('Add a title for this reservation.');return}
    const cost=Number(form.get('cost'));
    if(!field(form,'cost')||!Number.isFinite(cost)||cost<0||cost>1_000_000){setError('Set a reservation cost between €0 and €1,000,000.');return}
    const url=field(form,'url'),bookingUrl=safeUrl(url);
    if(url&&!bookingUrl){setError('Use a complete http:// or https:// booking or ticket URL, or leave it blank.');return}
    const booking:Booking={id:editingBooking?.id||makeId('booking'),activityId,type:field(form,'type') as Booking['type'],title:field(form,'title'),reference:field(form,'reference'),date:field(form,'date'),url:bookingUrl,cost,notes:field(form,'notes'),status:field(form,'status') as Booking['status'],source:editingBooking?.source==='demo'?'demo':'custom'};
    const apply=(current:Trip):Trip=>{
      if(editingBooking&&!current.bookings.some(b=>b.id===booking.id))throw new Error('This reservation changed. Reopen it before saving.');
      if(activityId&&current.bookings.some(b=>b.activityId===activityId&&b.id!==booking.id))throw new Error('That activity already has a linked reservation. Edit it instead.');
      return{...current,bookings:editingBooking?current.bookings.map(b=>b.id===booking.id?{...b,...booking}:b):[...current.bookings,booking]};
    };
    if(!isTrip(apply(trip))){setError('Check the reservation date, type, status, and details. Use a date in YYYY-MM-DD format.');return}
    commitTripEdit(apply,()=>{close();notify('Reservation saved in your trip wallet.')});
  };
  const reorder=(id:string,direction:number)=>{updateTrip(t=>({...t,days:t.days.map((d,i)=>{if(i!==dayIndex)return d;const next=[...d.activities];const visible=next.map((a,index)=>a.alternativeFor?-1:index).filter(index=>index>=0);const index=visible.findIndex(position=>next[position].id===id),target=index+direction;if(index<0||target<0||target>=visible.length)return d;const from=visible[index],to=visible[target];[next[from],next[to]]=[next[to],next[from]];return{...d,activities:next}})}))};
  const chooseAlternative=(option:Activity,original=editing,keepOptionId=false)=>{
    if(!original)return;
    if(!trip.days.some(d=>d.activities.some(a=>a.id===original.id&&!a.alternativeFor))){setError('This stop is no longer in your agenda. Reopen its alternatives.');return}
    const nextId=keepOptionId||option.alternativeFor===original.id?option.id:makeId('activity');
    const apply=(current:Trip):Trip=>{
      const active=current.days.flatMap(d=>d.activities).find(a=>a.id===original.id&&!a.alternativeFor);
      if(!active)return current;
      const replacement:Activity={...option,id:nextId,time:active.time,status:'planned',alternativeFor:undefined};
      const next:Trip={...current,days:current.days.map(d=>d.activities.some(a=>a.id===original.id)?{...d,activities:d.activities.flatMap(item=>item.id===original.id?[replacement,{...item,status:'skipped' as const,alternativeFor:nextId}]:item.id===option.id&&option.alternativeFor===original.id?[]:[item.alternativeFor===original.id?{...item,alternativeFor:nextId}:item])}:d)};
      return isTrip(next)?next:current;
    };
    if(apply(trip)===trip){setError('Check this alternative’s details. Keep up to 60 stops and alternatives in a day.');return}
    commitTripEdit(apply,()=>{setSelected(nextId);close();notify('A little change of plan. Your budget and map are updated.')});
  };
  const saveTripDetails=(updated:Trip)=>{
    if(workspaceRef.current.tripIdentities.get(trip.id)!==workspaceEdit.tripIdentities.get(trip.id))throw new Error('This trip was replaced. Reopen its details before saving.');
    commitTripEdit(current=>{
      const dates=getTripDays(updated.startDate,updated.endDate);
      if(dates.length<current.days.length&&JSON.stringify(current.days.slice(dates.length))!==JSON.stringify(trip.days.slice(dates.length)))throw new Error('Activities changed in the days you are removing. Reopen trip details and review them before saving.');
      return{...current,title:updated.title,startDate:updated.startDate,endDate:updated.endDate,budget:updated.budget,days:dates.map((date,index)=>current.days[index]?{...current.days[index],date}:updated.days[index])};
    },()=>{setDayIndex(0);setSelected(null);close();notify('Trip details updated. Your agenda is ready to keep moving.')});
  };
  const snapshot=()=>{if(!shareTrip)throw new Error('Open the private trip before sharing its itinerary.');return publicTripSnapshot(shareTrip)};
  const removeBooking=(booking:Booking)=>updateTrip(t=>({...t,bookings:t.bookings.filter(b=>b.id!==booking.id),expenses:t.expenses.map(expense=>expense.bookingId===booking.id&&booking.activityId?{...expense,bookingId:undefined,activityId:booking.activityId}:expense)}));
  const reviewRequests=async()=>{
    const request=beginCommunity('review',shareId);if(!request)return;
    try{
      const {response,data}=await communityDelivery(request,`/api/community?id=${encodeURIComponent(request.tripId)}`,{headers:{'x-trip-owner':localStorage.getItem('trippin.owner')||''}});
      if(!response.ok)throw new Error(data?.error||'Could not load requests.');
      if(data?.available!==true||!isTrip(data.trip)||data.trip.id!==request.tripId||!Array.isArray(data.requests))throw new Error('The community service did not confirm this trip and its requests.');
      if(ownsCommunityUi(request))setRequests(data.requests);
    }catch(e){if(ownsCommunityUi(request))setError(e instanceof Error?e.message:'Could not load requests.')}
    finally{finishCommunity(request)}
  };
  const decideRequest=async(id:string,status:'accepted'|'declined')=>{
    const request=beginCommunity('decision',shareId);if(!request)return;
    try{
      const {response,data}=await communityDelivery(request,'/api/community',{method:'PATCH',headers:{'Content-Type':'application/json','x-trip-owner':localStorage.getItem('trippin.owner')||''},body:JSON.stringify({tripId:request.tripId,requestId:id,action:status})});
      if(!response.ok||data?.updated!==true)throw new Error(data?.error||'The request decision could not be confirmed.');
      if(ownsCommunityUi(request)){setRequests(list=>list?.map(item=>item.id===id?{...item,status}:item)||[]);notify(`Request ${status}. Contact the traveler directly to arrange details.`)}
    }catch(e){if(ownsCommunityUi(request))setError(e instanceof Error?e.message:'Could not update request.')}
    finally{finishCommunity(request)}
  };
  const unpublish=async()=>{
    const request=beginCommunity('unpublish',shareId);if(!request)return;
    try{
      const records=preserveManagement(workspaceRef.current.workspace.trips);
      if(!records.some(item=>item.id===request.tripId))throw new Error('No saved management entry was found for this public plan.');
      const captured=snapshotManagedUnpublish(localStorage,request.tripId);
      const {response,data}=await communityDelivery(request,`/api/community?id=${encodeURIComponent(request.tripId)}`,{method:'DELETE',headers:{'x-trip-owner':localStorage.getItem('trippin.owner')||''}});
      if(!response.ok||data?.deleted!==true)throw new Error(data?.error||'Unpublishing could not be confirmed.');
      if(!ownsCommunity(request))return;
      const remaining=refreshManagement(confirmManagedUnpublishStorage(localStorage,request.tripId,captured));
      dispatchWorkspace({type:'publication-result',tripId:request.tripId,identity:request.identity,isPublic:false});
      setPublicTrips(list=>list.filter(item=>item.id!==request.tripId));
      if(ownsCommunityUi(request)){
        setRequests(null);
        notify(remaining.some(item=>item.id===request.tripId)
          ?'Unpublish acknowledged. Another publication entry is still kept for this plan; review it before deleting.'
          :'Trip unpublished and join requests removed.');
      }
    }catch(e){if(ownsCommunityUi(request))setError(`${e instanceof Error?e.message:'Could not confirm unpublishing.'} Its management entry has been kept.`)}
    finally{finishCommunity(request)}
  };
  const shareSnapshot=async()=>{if(!shareTrip)return;const epoch=modalEpoch.current,value=window.location.origin+'/#plan='+btoa(unescape(encodeURIComponent(JSON.stringify(snapshot()))));if(value.length>24000){setError('This trip is too large for a link. Export a backup instead.');return}setShareUrl(value);try{await navigator.clipboard.writeText(value);if(mountedRef.current&&modalEpoch.current===epoch)notify('Itinerary link copied. Private booking details stay out.')}catch{if(mountedRef.current&&modalEpoch.current===epoch)notify('Your link is ready to copy below.')}};
  const publish=async()=>{
    if(!shareTrip){setError('Open the private trip before publishing its current plan.');return}
    const request=beginCommunity('publish',shareTrip.id);if(!request)return;
    let sent=false;
    try{
      const publicPlan=snapshot(),body=JSON.stringify({trip:publicPlan,host:state.profile.name});
      const ownership=ownerForPublication(request),owner=typeof ownership==='string'?ownership:await ownership;
      if(!ownsCommunity(request))return;
      preserveManagement(workspaceRef.current.workspace.trips);
      const reservation=reserveManagedPublication(localStorage,publicPlan,crypto.randomUUID());
      refreshManagement(reservation.records);
      sent=true;
      const {response,data}=await communityDelivery(request,'/api/community',{method:'POST',headers:{'Content-Type':'application/json','x-trip-owner':owner},body});
      if(!response.ok||data?.published!==true||data.id!==request.tripId)throw new Error(data?.error||'The community service did not confirm publication.');
      if(!ownsCommunity(request))return;
      refreshManagement(confirmManagedPublicationStorage(localStorage,reservation));
      dispatchWorkspace({type:'publication-result',tripId:request.tripId,identity:request.identity,isPublic:true});
      setPublicTrips(list=>[...list.filter(item=>item.id!==request.tripId),{...publicPlan,isPublic:true}]);
      if(ownsCommunityUi(request)){setShareUrl(window.location.origin+'/?trip='+request.tripId);notify('Your trip is open for join requests.')}
    }catch(e){if(ownsCommunityUi(request))setError(sent
      ?'Publication could not be fully confirmed. Its management entry is kept in Your profile; check it before publishing again.'
      :`${e instanceof Error?e.message:'Could not preserve the management entry.'} Nothing was sent.`)}
    finally{finishCommunity(request)}
  };
  const sendJoin=async(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();if(!joining)return;const request=beginCommunity('join',joining.id);if(!request)return;const form=new FormData(event.currentTarget);try{const {response,data}=await communityDelivery(request,'/api/community',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({tripId:request.tripId,name:field(form,'name'),message:field(form,'message'),contact:field(form,'contact')})});if(!response.ok||data?.sent!==true)throw new Error(data?.error||'Sending the join request could not be confirmed.');if(ownsCommunityUi(request)){close();notify('Join request sent. The host can review it in Trippin.')}}catch(e){if(ownsCommunityUi(request))setError(e instanceof Error?e.message:'Could not confirm the request. Check before sending it again.')}finally{finishCommunity(request)}};
  const deleteTrip=()=>{
    const current=workspaceRef.current,target=current.workspace.trips.find(item=>item.id===trip.id);
    if(!target||current.tripIdentities.get(trip.id)!==workspaceEdit.tripIdentities.get(trip.id))throw new Error('This trip changed. Reopen its details before deleting it.');
    const records=preserveManagement(current.workspace.trips);
    if(target.isPublic||records.find(item=>item.id===target.id)?.status==='published')throw new Error('Unpublish this trip before deleting it from this browser.');
    if(current.workspace.trips.length===1&&records.length)throw new Error('Review public plans in your profile before removing your last private trip.');
    if(current.workspace.trips.length===1){const empty={...current.workspace,trips:[],selectedTripId:''};if(persistWorkspace(empty,serialized=>{localStorage.setItem(storageKey,serialized);if(localStorage.getItem(storageKey)!==serialized)throw new Error('Save readback failed.')})!=='saved')throw new Error('This trip could not be removed from browser storage.');onEmpty(empty);return}
    setState(s=>{const remaining=s.trips.filter(item=>item.id!==target.id);return{...s,trips:remaining,selectedTripId:remaining[0].id}});
    setDayIndex(0);setSelected(null);close();notify(records.some(item=>item.id===target.id)?'Private trip deleted. Its public-plan management entry stays in Your profile.':'Trip deleted from this browser.');
  };
  const importCsv=async(file?:File)=>{if(!file)return;const input=fileInput.current,departure=departureGeneration.current,requestId=++csvReadGeneration.current,ticket:CsvImportTicket={tripId:trip.id,identity:workspaceEdit.tripIdentities.get(trip.id),requestId};try{const text=await file.text();if(departure!==departureGeneration.current||!mountedRef.current)return;const rows=parseExpenseCsv(text);const expenses=rows.map(row=>({...row,id:makeId('expense'),category:(categories as readonly string[]).includes(row.category)?row.category as Expense['category']:'other' as const}));dispatchWorkspace({type:'csv-import',ticket,expenses})}catch(e){if(departure===departureGeneration.current&&mountedRef.current)dispatchWorkspace({type:'csv-error',ticket,message:e instanceof Error?e.message:'Could not import CSV.'})}finally{if(input&&fileInput.current===input&&csvReadGeneration.current===requestId)input.value=''}};
  const budgetPercent=trip.budget>0?Math.min(100,Math.round(cost.total/trip.budget*100)):cost.total>0?100:0;
  const aiContext=JSON.stringify({city:trip.city,country:trip.country,startDate:trip.startDate,endDate:trip.endDate,budget:trip.budget,interests:state.profile.interests,openToEvents:getEventPreferences(state.profile),days:trip.days.map(d=>({date:d.date,activities:d.activities.filter(a=>!a.alternativeFor).map(a=>({title:a.title,time:a.time,cost:a.cost,status:a.status}))}))});

  return <><div className="app-shell consumer-workspace" inert={!ready||accountBusy} aria-busy={!ready||accountBusy}>
    <a href="#main-content" className="skip-link" onClick={event=>{event.preventDefault();document.getElementById('main-content')?.focus()}}>Skip to trip</a>
    <header className="traveler-bar">
<button className="brand" onClick={()=>leaveWorkspace(onHome)} aria-label="Trippin home">trippin<span>✳</span></button>
<nav aria-label="Your space"><button onClick={()=>leaveWorkspace(onHome)}>Your trips</button><button aria-current={view==='profile'?'page':undefined} onClick={()=>setView('profile')}>Your profile</button></nav>
{account?<button className="text-button" disabled={accountBusy} onClick={()=>leaveWorkspace(onLogout)}>Log out</button>:<button className="text-button" onClick={()=>leaveWorkspace(onHome)}>Sign in</button>}
</header>
    <main className={`main-area ${view==='itinerary'?'with-map':''}`} id="main-content" tabIndex={-1}>
      {saveError&&<section className="workspace-save-warning" aria-labelledby="workspace-save-title">
        <div role="alert"><strong id="workspace-save-title">Your latest changes aren’t saved</strong><p>{saveError}</p></div>
        <div className="workspace-save-actions"><button className="secondary" onClick={()=>persistCurrentWorkspace()}>Retry save</button><button className="secondary" onClick={()=>exportBackup()}><Download size={16}/>Download backup</button>{leaveRequested&&<button className="text-button" onClick={leaveWithoutSaving}>Leave without saving</button>}</div>
      </section>}
      {accountError&&<p className="home-notice home-error" role="alert">{accountError}</p>}
      {onCheckAccount&&<button className="secondary" disabled={accountBusy} onClick={()=>leaveWorkspace(onCheckAccount)}>Check account status</button>}
      <header className="topbar">
<div className="breadcrumb">Your space <ChevronRight size={13}/>
<strong>{view==='profile'?'Your profile':view==='bookings'?`${trip.city} reservations`:trip.city}</strong>
<select className="trip-switcher" aria-label="Choose your trip" value={trip.id} onChange={e=>selectTrip(e.target.value)}>{state.trips.map(t=><option key={t.id} value={t.id}>{t.city}</option>)}</select>
</div>
<div className="top-actions">
<button className="help-button" onClick={()=>open('settings')}>
<BookOpen size={15}/>
<span>How it works</span>
</button>
<span className="tiny-divider"/>
<button className="avatar small" aria-label="Your profile" onClick={()=>setView('profile')}>{state.profile.name?state.profile.name.slice(0,1).toUpperCase():<Users size={15}/>}</button>
</div>
</header>
      <nav className="trip-sections" aria-label="Selected trip"><button aria-current={view==='itinerary'?'page':undefined} onClick={()=>setView('itinerary')}>Itinerary</button><button aria-current={view==='bookings'?'page':undefined} onClick={()=>setView('bookings')}>Reservations</button><button onClick={()=>{setView('itinerary');setBudgetOpen(true)}} aria-expanded={budgetOpen}>Budget for {trip.city}</button><button onClick={()=>open('trip')}><Plus size={15}/>New trip</button></nav>
      {view==='itinerary'&&<div className="trip-workspace" ref={tripPanels}>
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
<button onClick={()=>setBudgetOpen(value=>!value)} aria-expanded={budgetOpen} aria-controls="trip-budget">
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
      {budgetOpen&&view==='itinerary'&&<section id="trip-budget" className="trip-budget-section" aria-label={`${trip.city} budget`}>
<div className="page-eyebrow">LESS GUESSWORK. MORE GOOD DAYS.</div>
<div className="page-title-line">
<div>
<h2>Your trip budget</h2>
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
<p>Food and transport each have a whole-trip minimum: your daily allowance multiplied by trip days. Known costs replace that minimum when they are higher.</p>
</div>
<form key={`${trip.id}:${trip.budget}:${trip.dailyFoodBudget??state.profile.dailyFoodBudget}:${trip.dailyTransportBudget??state.profile.dailyTransportBudget}`} onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);updateTrip(t=>({...t,budget:Number(f.get('budget')),dailyFoodBudget:Number(f.get('food')),dailyTransportBudget:Number(f.get('transport'))}));notify('This trip’s budget and daily allowances are updated.')}}>
<label>Food / day (€)<input type="number" min="0" max="10000" step="0.01" name="food" defaultValue={trip.dailyFoodBudget??state.profile.dailyFoodBudget} required/>
</label>
<label>Transport / day (€)<input type="number" min="0" max="10000" step="0.01" name="transport" defaultValue={trip.dailyTransportBudget??state.profile.dailyTransportBudget} required/>
</label>
<label>Trip budget (€)<input type="number" min="1" max="1000000" step="0.01" name="budget" defaultValue={trip.budget} required/>
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
<StayComparison nights={Math.max(0,trip.days.length-1)} days={trip.days.length}/>
<BankPreferences onApply={(food,transport)=>{updateTrip(t=>({...t,dailyFoodBudget:food,dailyTransportBudget:transport}));notify('This trip’s allowances are updated from Sandbox estimates.')}}/>
</section>}
      <details className="trip-events"><summary>Events during your trip</summary>
<ProviderPanel key={trip.id} mode="events" city={trip.city} countryCode={trip.countryCode||destinations.find(destination=>destination.city===trip.city&&destination.country===trip.country)?.countryCode} startDate={trip.startDate} endDate={trip.endDate} preferences={getEventPreferences(state.profile)} onAddEvent={planEvent}/>
<EventIdeas trip={trip} preferences={getEventPreferences(state.profile)} onAdd={planEvent}/>
      </details>
      <div className="itinerary-title">
<div>
<h2>Your itinerary<span className="green-dot"/>
</h2>
<p>A plan with plenty of breathing room.</p>
</div>
<button className="text-button" onClick={()=>{setEditing(null);open('activity')}}>
<Plus size={15}/>Add a stop</button>
</div>
      <div className="day-tabs" role="tablist" aria-label="Trip days" aria-orientation="horizontal">{trip.days.map((d,i)=>
<button key={d.id} id={`day-tab-${i}`} role="tab" aria-controls="day-plan" aria-selected={i===dayIndex} tabIndex={i===dayIndex?0:-1} className={i===dayIndex?'active':''} onClick={()=>selectDay(i)} onKeyDown={event=>handleDayKey(event,i)}>
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
      <div className="timeline" id="day-plan" role="tabpanel" aria-labelledby={`day-tab-${dayIndex}`} tabIndex={0}>
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
<div id="trip-map-panel" className={`map-column ${mobileMap?'show-mobile-map':''}`}>
<TripMap trip={trip} activities={activities} selected={selected} onSelect={selectPlace}/>
<div className="map-bottom-tip">
<Sparkles size={17}/>
<div>
<strong>A little room for serendipity.</strong>
<p>Tap a stop to see where the day takes you.</p>
<div className="day-map-links">{mapsRoutes.map(link=><a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer"><Route size={15}/>{mapsRoutes.length===1?'Open day in Google Maps':`Maps · stops ${link.first}–${link.last}`}<ArrowUpRight size={13}/></a>)}</div>
</div>
<button className="icon-button" aria-label="Open travel assistant" onClick={()=>setAiOpen(true)}>
<ArrowUpRight size={18}/>
</button>
</div>
</div>
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
<p className="form-note">These choices filter events within each trip. You can change them whenever you want to try something different.</p>
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
<section className="dialog-form" aria-label="Public plans you manage">
<h3>Public plans you manage</h3>
<p className="form-note">These management entries stay in this browser when you restore a workspace or remove a private trip. Publishing access is not included in workspace backups; clearing browser data loses it.</p>
{managementError&&<p role="alert" className="form-error">{managementError}</p>}
<button className="text-button" onClick={()=>{try{preserveManagement(workspaceRef.current.workspace.trips)}catch{setManagementError('Management entries could not be loaded or saved. Existing browser data has been kept.')}}}>Reload management entries</button>
{managedTrips.length===0&&!managementError?<p>No public plans are managed in this browser yet.</p>:<div className="join-requests">{managedTrips.map(item=><article key={item.id}>
<strong>{item.title}<small>{item.city}</small></strong>
<p>{item.status==='published'?'Marked public in this browser.':'Publication needs checking. An earlier request may have reached the service.'}</p>
{!state.trips.some(local=>local.id===item.id)&&<p>The private copy is not in this workspace. Its public plan can still be managed here.</p>}
<button className="secondary" onClick={()=>open('share',item.id)}>Manage public plan</button>
</article>)}</div>}
</section>
<div className="integration-notice">
<ShieldCheck size={21}/>
<div>
<strong>Your travels, in your hands.</strong>
<p>Profiles, expenses, and reservations save in this browser. Export a backup to take them with you.</p>
</div>
<button className="secondary" onClick={()=>exportBackup()}>
<Download size={15}/>Export backup</button>
</div>
<button className="text-button" onClick={()=>backupInput.current?.click()}>
<Upload size={14}/>Restore a Trippin backup</button>
<input ref={backupInput} type="file" accept="application/json,.json" hidden onChange={async e=>{const input=e.currentTarget,file=input.files?.[0],generation=++backupReadGeneration.current;if(!file)return;try{if(file.size>MAX_BACKUP_FILE_BYTES)throw new Error('Choose a backup of 16 MiB or smaller. Your current trips are unchanged.');const bytes=new Uint8Array(await file.arrayBuffer());if(generation!==backupReadGeneration.current)return;const restored=parseWorkspaceBackup(bytes);const retained=preserveManagement([...workspaceRef.current.workspace.trips,...restored.trips]);if(restored.trips.length===0&&retained.length)throw new Error('Review public plans in your profile before restoring an empty travel space.');if(persistWorkspace(restored,serialized=>{localStorage.setItem(storageKey,serialized);if(localStorage.getItem(storageKey)!==serialized)throw new Error('Save readback failed.')})!=='saved')throw new Error('The backup could not be saved in this browser. Your current trips are unchanged; keep the backup file.');close();pendingPlan.current=null;if(restored.trips.length===0){onEmpty(restored);return}setState(restored);setDayIndex(0);setSelected(null);notify('Backup restored and saved in this browser. Public-plan management entries are kept in Your profile.')}catch(e){if(generation===backupReadGeneration.current)notify(e instanceof Error?e.message:'This is not a valid Trippin backup. Your current trips are unchanged.')}finally{if(generation===backupReadGeneration.current)input.value=''}}}/>
</div>}
    </main>
    {view==='itinerary'&&<button type="button" className="mobile-map-toggle primary" aria-expanded={mobileMap} aria-controls="trip-map-panel" onClick={toggleMobileMap}>{mobileMap?<>
<LayoutList size={17}/>Show itinerary</>:<>
<Map size={17}/>Show map</>}</button>}
    {toast&&<div className="toast" role="status">
<CheckCircle2 size={17}/>{toast}<button className="icon-button" aria-label="Dismiss notification" onClick={()=>setToast('')}>
<X size={15}/>
</button>
</div>}
    {modal&&<Dialog title={modal==='trip'?'A new chapter.':modal==='event'?'Make it part of your trip.':modal==='activity'?(customAlternativeFor?'A new alternative.':editing?'Change the plan.':'A good little detour.'):modal==='expense'?'A little expense.':modal==='booking'?'Keep the details close.':modal==='share'?'Good plans are worth sharing.':modal==='alternatives'?'A different kind of good.':modal==='join'?'A few new faces.':'A few helpful details.'} onClose={close} wide={modal==='settings'}>
      {error&&<div role="alert" className="form-error">{error}</div>}
      {modal==='trip'&&<NewTripForm onCreate={addTrip} initialCity={newTripCity}/>}
      {modal==='event'&&eventDraft&&<EventPlanForm draft={eventDraft} trip={trip} busy={tripEditPending} onSave={saveEvent}/>}
      {modal==='tripSettings'&&<TripSettings trip={trip} busy={tripEditPending} canDelete={state.trips.length>1||managedTrips.length===0} publicationStatus={managedTrips.find(item=>item.id===trip.id)?.status} onSave={saveTripDetails} onDelete={deleteTrip}/>}
      {modal==='activity'&&<form ref={activityForm} className="dialog-form" onSubmit={submitActivity}>
{customAlternativeFor&&<p className="form-note">Replace “{customAlternativeFor.title}” at {customAlternativeFor.time}. Your original stop stays available to swap back; its reservations and recorded expenses stay linked to it.</p>}
<label>What’s the plan?<input name="title" defaultValue={editing?.title} required maxLength={140} placeholder="Coffee, then see where we end up"/>
</label>
<div className="form-grid">
<label>Kind of moment<select name="category" defaultValue={editing?.category||'culture'}>{categories.map(c=>
<option value={c} key={c}>{categoryLabel[c]}</option>)}</select>
</label>
<label>Start time<input name="time" type="time" defaultValue={customAlternativeFor?.time||editing?.time||'10:00'} readOnly={Boolean(customAlternativeFor)} required/>
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
<button className="primary" type="submit" disabled={tripEditPending}>{tripEditPending?'Applying…':customAlternativeFor?'Use this alternative':editing?'Save changes':'Add to my day'} <Check size={16}/>
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
<button className="primary" type="submit" disabled={tripEditPending}>{tripEditPending?'Applying…':'Log expense'} <Check size={16}/>
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
<button className="primary" type="submit" disabled={tripEditPending}>{tripEditPending?'Applying…':'Save reservation'} <Ticket size={16}/>
</button>
</form>}
      {modal==='share'&&<div className="dialog-form">
<h3>{shareTrip?.title??managedTrip?.title??'Saved public plan'}</h3>
<p>Share the places and plans. Booking references and expenses stay private.</p>
{managedTrip?.status==='uncertain'&&<p role="status" className="form-note">A publication could not be confirmed. Its management entry stays here even after an unpublish acknowledgement, because an earlier request may still arrive.</p>}
{!shareTrip&&<p className="form-note">This private copy is not in your workspace. Review or unpublish its public plan below.</p>}
<button className="share-choice" disabled={!shareTrip} onClick={()=>void shareSnapshot()}>
<LinkIcon size={22}/>
<span>
<strong>Share an itinerary link</strong>
<small>A snapshot of your plan. Anyone with the link can save a copy.</small>
</span>
<ArrowUpRight size={18}/>
</button>
<button className="share-choice" disabled={!shareTrip||!socialReady||busy||!ready||Boolean(managementError)} onClick={()=>void publish()}>
<Users size={22}/>
<span>
<strong>{busy?'Opening your trip…':'Open your trip to new people'}</strong>
<small>{socialReady?'Publish to Discover and receive join requests.':'Shared community service needs setup.'}</small>
</span>
<ArrowUpRight size={18}/>
</button>{shareUrl&&<label>Your share link<input readOnly value={shareUrl} onFocus={e=>e.target.select()}/>
</label>}{(shareTrip?.isPublic||managedTrip)&&<div className="host-actions"><button className="secondary" disabled={busy} onClick={()=>void reviewRequests()}>Review join requests</button><button className="text-button" disabled={busy} onClick={()=>void unpublish()}>Unpublish trip</button></div>}
{requests&&<div className="join-requests">{requests.length===0?<p>No requests yet. Your next travel friend might be on their way.</p>:requests.map(request=><article key={request.id}><strong>{request.name}<small>{request.status}</small></strong><p>{request.message}</p><span>{request.contact}</span>{request.status==='pending'&&<div className="button-row"><button className="primary" disabled={busy} onClick={()=>void decideRequest(request.id,'accepted')}>Accept</button><button className="secondary" disabled={busy} onClick={()=>void decideRequest(request.id,'declined')}>Decline</button></div>}</article>)}</div>}
<button className="text-button" disabled={!shareTrip} onClick={()=>{if(shareTrip)download(`${shareTrip.city.toLowerCase()}-trip.json`,JSON.stringify(snapshot(),null,2))}}>
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
</button>})}<button className="secondary" onClick={beginCustomAlternative}>
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
</div>{accountBusy&&<p className="workspace-account-pending" role="status">Updating your account. Keeping your saved space ready…</p>}</>;
}
