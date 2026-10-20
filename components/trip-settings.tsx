'use client';

import {useEffect,useMemo,useState,type FormEvent} from 'react';
import {Check,Trash2} from 'lucide-react';
import {getTripDays,isTrip,makeId} from '@/lib/trip';
import type {Trip,TripDay} from '@/lib/types';

type Props={trip:Trip;onSave:(trip:Trip)=>void;onDelete:()=>void;canDelete:boolean};

export default function TripSettings({trip,onSave,onDelete,canDelete}:Props){
  const [title,setTitle]=useState(trip.title);
  const [startDate,setStartDate]=useState(trip.startDate);
  const [endDate,setEndDate]=useState(trip.endDate);
  const [budget,setBudget]=useState(String(trip.budget));
  const [removeConfirmed,setRemoveConfirmed]=useState(false);
  const [deleteConfirmed,setDeleteConfirmed]=useState(false);
  const [error,setError]=useState('');

  useEffect(()=>{
    setTitle(trip.title);setStartDate(trip.startDate);setEndDate(trip.endDate);setBudget(String(trip.budget));
    setRemoveConfirmed(false);setDeleteConfirmed(false);setError('');
  },[trip.id]);

  const range=useMemo(()=>{
    try{return {dates:getTripDays(startDate,endDate),error:''}}
    catch(caught){return {dates:[] as string[],error:caught instanceof Error?caught.message:'Choose valid trip dates.'}}
  },[startDate,endDate]);
  const removedDays=range.dates.length?trip.days.slice(range.dates.length):[];
  const removedActivityCount=removedDays.reduce((count,day)=>count+day.activities.length,0);
  const hasRemovedActivities=removedActivityCount>0;
  const datesChanged=startDate!==trip.startDate||endDate!==trip.endDate;
  const extraDays=Math.max(0,range.dates.length-trip.days.length);

  function save(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setError('');
    try{
      const name=title.trim();
      if(!name||name.length>200)throw new Error('Give your trip a name with 1–200 characters.');
      const dates=getTripDays(startDate,endDate);
      const amount=Number(budget);
      if(!budget.trim()||!Number.isFinite(amount)||amount<1||amount>1_000_000)throw new Error('Set a total budget between €1 and €1,000,000.');
      if(hasRemovedActivities&&!removeConfirmed)throw new Error('Confirm the days and activities to remove before saving this shorter trip.');
      const days:TripDay[]=dates.map((date,index)=>{
        const existing=trip.days[index];
        return existing?{...existing,date}:{id:makeId('day'),date,label:'Room for the unexpected',activities:[]};
      });
      const updated:Trip={...trip,title:name,startDate,endDate,budget:Math.round(amount*100)/100,days};
      if(!isTrip(updated))throw new Error('These changes could not be saved. Check your trip details.');
      onSave(updated);
    }catch(caught){setError(caught instanceof Error?caught.message:'Your trip could not be updated. Please try again.')}
  }

  function remove(){
    setError('');
    if(trip.isPublic){setError('Unpublish this trip before deleting it from this browser.');return}
    if(!canDelete){setError('Keep at least one trip in your workspace. Create another trip before deleting this one.');return}
    if(!deleteConfirmed){setError('Confirm that you want to delete this trip from this browser.');return}
    try{onDelete()}catch(caught){setError(caught instanceof Error?caught.message:'This trip could not be deleted. Please try again.')}
  }

  return <div className="dialog-form">
    {error&&<div role="alert" className="form-error">{error}</div>}
    <form className="dialog-form" onSubmit={save} noValidate>
      <p>Keep the plan flexible, from the first day to the last.</p>
      <label>Trip name<input value={title} onChange={event=>setTitle(event.target.value)} maxLength={200} required/></label>
      <div className="form-grid">
        <label>First day<input type="date" value={startDate} onChange={event=>{setStartDate(event.target.value);setRemoveConfirmed(false);setError('')}} required/></label>
        <label>Last day<input type="date" value={endDate} min={startDate||undefined} onChange={event=>{setEndDate(event.target.value);setRemoveConfirmed(false);setError('')}} required/></label>
      </div>
      <label>Whole-trip budget (€)<input type="number" min="1" max="1000000" step="0.01" value={budget} onChange={event=>setBudget(event.target.value)} required/></label>
      {range.error&&datesChanged&&<p className="form-note" role="status">{range.error}</p>}
      {datesChanged&&!range.error&&<p className="form-note">Your agenda stays in the same day order: day one moves to the new first date.{extraDays>0?` ${extraDays} extra ${extraDays===1?'day starts':'days start'} blank.`:''} Reservations and recorded expenses stay saved; review their dates separately.</p>}
      {removedDays.length>0&&<div className="form-error" role="status">
        This shorter trip removes {removedDays.length} {removedDays.length===1?'day':'days'} and {removedActivityCount} saved {removedActivityCount===1?'activity':'activities'} from the end of your agenda, including any alternatives.
        {hasRemovedActivities&&<label style={{flexDirection:'row',alignItems:'flex-start',marginTop:12}}>
          <input type="checkbox" checked={removeConfirmed} onChange={event=>setRemoveConfirmed(event.target.checked)} style={{width:'auto',marginTop:2}}/>
          <span>Remove these {removedDays.length} {removedDays.length===1?'day':'days'} and {removedActivityCount} {removedActivityCount===1?'activity':'activities'} when I save.</span>
        </label>}
      </div>}
      {trip.isPublic&&<p className="form-note">These edits update your saved trip. Publish it again to update the public plan.</p>}
      <button className="primary" type="submit">Save trip <Check size={16}/></button>
    </form>
    <section className="dialog-form" style={{borderTop:'1px solid #dfe5d6',paddingTop:20}} aria-label="Delete trip">
      <h3>Delete this trip</h3>
      {trip.isPublic?<p className="form-note">Unpublish this trip before deleting it. This keeps its public plan and join requests from being left behind.</p>
        :!canDelete?<p className="form-note">Keep at least one trip in your workspace. Create another trip before deleting this one.</p>
        :<>
          <p className="form-note">This removes its itinerary, reservations, and recorded expenses from this browser. Export a backup first if you want to keep a copy.</p>
          <label style={{flexDirection:'row',alignItems:'flex-start'}}>
            <input type="checkbox" checked={deleteConfirmed} onChange={event=>setDeleteConfirmed(event.target.checked)} style={{width:'auto',marginTop:2}}/>
            <span>Delete this trip from this browser.</span>
          </label>
        </>}
      <button type="button" className="secondary" style={{color:'#a34735',alignSelf:'flex-start'}} disabled={!canDelete||trip.isPublic||!deleteConfirmed} onClick={remove}><Trash2 size={15}/>Delete trip</button>
    </section>
  </div>;
}
