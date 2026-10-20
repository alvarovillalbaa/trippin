'use client';

import {useEffect,useId,useMemo,useRef,useState,type FormEvent} from 'react';
import {ArrowRight,Check,LoaderCircle,MapPin,Search} from 'lucide-react';
import {destinations} from '@/lib/data';
import {createTrip,getTripDays} from '@/lib/trip';
import type {Destination,Trip} from '@/lib/types';

type CityResult={id:number;name:string;country:string;countryCode?:string;region:string;lat:number;lng:number};

function localDate(date:Date){
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

function upcomingWeekend(){
  const start=new Date();
  start.setHours(12,0,0,0);
  start.setDate(start.getDate()+(5-start.getDay()+7)%7);
  const end=new Date(start);
  end.setDate(end.getDate()+3);
  return {start:localDate(start),end:localDate(end)};
}

function readCity(value:unknown):CityResult|null{
  if(!value||typeof value!=='object')return null;
  const city=value as Record<string,unknown>;
  if(typeof city.id!=='number'||!Number.isInteger(city.id)||typeof city.name!=='string'||!city.name.trim()||city.name.length>100
    ||typeof city.latitude!=='number'||!Number.isFinite(city.latitude)||Math.abs(city.latitude)>90
    ||typeof city.longitude!=='number'||!Number.isFinite(city.longitude)||Math.abs(city.longitude)>180)return null;
  if(typeof city.feature_code==='string'&&!city.feature_code.startsWith('PPL'))return null;
  const country=typeof city.country==='string'&&city.country.trim()?city.country:typeof city.country_code==='string'?city.country_code:'';
  if(!country||country.length>100)return null;
  const countryCode=typeof city.country_code==='string'&&/^[A-Z]{2}$/.test(city.country_code)?city.country_code:undefined;
  return {id:city.id,name:city.name,country,countryCode,region:typeof city.admin1==='string'?city.admin1.slice(0,100):'',lat:city.latitude,lng:city.longitude};
}

/** Public Open-Meteo/GeoNames search is for non-commercial use; see docs/integrations.md. */
export default function NewTripForm({onCreate,initialCity}:{onCreate:(trip:Trip)=>void;initialCity?:string}){
  const id=useId();
  const [dates]=useState(upcomingWeekend);
  const [destinationId,setDestinationId]=useState(destinations.find(d=>d.city===initialCity)?.id||destinations[0].id);
  const [startDate,setStartDate]=useState(dates.start);
  const [endDate,setEndDate]=useState(dates.end);
  const [budget,setBudget]=useState(String((destinations.find(d=>d.city===initialCity)||destinations[0]).suggestedBudget));
  const [query,setQuery]=useState('');
  const [results,setResults]=useState<CityResult[]>([]);
  const [selectedCity,setSelectedCity]=useState<CityResult|null>(null);
  const [searching,setSearching]=useState(false);
  const [searched,setSearched]=useState(false);
  const [searchError,setSearchError]=useState('');
  const [error,setError]=useState('');
  const request=useRef<AbortController|null>(null);
  const custom=destinationId==='custom';
  const dayCount=useMemo(()=>{try{return getTripDays(startDate,endDate).length}catch{return null}},[startDate,endDate]);

  useEffect(()=>()=>{request.current?.abort();request.current=null},[]);

  const resetSearch=()=>{
    request.current?.abort();request.current=null;
    setSearching(false);setResults([]);setSelectedCity(null);setSearched(false);setSearchError('');
  };

  async function searchCities(){
    const name=query.trim();
    if(name.length<3){setSearchError('Enter at least three characters. Add a country to narrow the search.');return}
    request.current?.abort();
    const controller=new AbortController();request.current=controller;
    setSearching(true);setSearched(false);setSearchError('');setResults([]);setSelectedCity(null);
    let timedOut=false;
    const timeout=setTimeout(()=>{timedOut=true;controller.abort()},12000);
    try{
      const parameters=new URLSearchParams({name,count:'6',language:'en',format:'json'});
      const response=await fetch(`https://geocoding-api.open-meteo.com/v1/search?${parameters}`,{signal:controller.signal});
      if(!response.ok)throw new Error('City search is unavailable right now. Try again in a moment.');
      const data:unknown=await response.json();
      if(!data||typeof data!=='object')throw new Error('City search returned an unexpected response. Please try again.');
      if(request.current!==controller)return;
      const payload=data as Record<string,unknown>;
      if(payload.error===true)throw new Error('That location could not be searched. Try a city and country.');
      const cities=Array.isArray(payload.results)?payload.results.map(readCity).filter((city):city is CityResult=>city!==null):[];
      setResults(cities);setSearched(true);
    }catch(caught){
      if(request.current!==controller)return;
      if(timedOut)setSearchError('City search took too long. Check your connection and try again.');
      else if(!controller.signal.aborted)setSearchError(caught instanceof Error?caught.message:'City search could not connect. Try again.');
    }finally{
      clearTimeout(timeout);
      if(request.current===controller){request.current=null;setSearching(false)}
    }
  }

  function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setError('');
    try{
      let destination:Destination|undefined=destinations.find(place=>place.id===destinationId);
      if(custom){
        if(!selectedCity)throw new Error('Search for your city and choose a result first.');
        destination={id:`place-${selectedCity.id}`,city:selectedCity.name,country:selectedCity.country,countryCode:selectedCity.countryCode,lat:selectedCity.lat,lng:selectedCity.lng,image:'/images/world.svg',description:`Your own little chapter in ${selectedCity.name}. Start with open days and make the plan yours.`,suggestedBudget:0,centerTransfer:'Add airport and city transfer details after checking local transport.',tags:[]};
      }
      if(!destination)throw new Error('Choose a destination.');
      const amount=Number(budget);
      if(!Number.isFinite(amount)||amount<1||amount>1_000_000)throw new Error('Set a total budget between €1 and €1,000,000.');
      const form=new FormData(event.currentTarget);
      const trip=createTrip(destination,startDate,endDate,String(form.get('title')||'').trim()||undefined);
      trip.budget=Math.round(amount*100)/100;
      onCreate(trip);
    }catch(caught){setError(caught instanceof Error?caught.message:'Check your trip details and try again.')}
  }

  return <form onSubmit={submit} className="dialog-form">
    <p>A weekend escape or a few days to follow your curiosity.</p>
    {error&&<div role="alert" className="form-error">{error}</div>}
    <label>Where to?<select value={destinationId} onChange={event=>{resetSearch();setError('');setDestinationId(event.target.value);setBudget(String(destinations.find(d=>d.id===event.target.value)?.suggestedBudget||900))}}>
      {destinations.map(place=><option key={place.id} value={place.id}>{place.city}, {place.country}</option>)}
      <option value="custom">Somewhere else</option>
    </select></label>
    {custom&&<>
      <div>
        <label htmlFor={`${id}-city`}>Find your city</label>
        <div className="button-row" style={{marginTop:8}}>
          <input id={`${id}-city`} type="search" value={query} maxLength={120} placeholder="Kyoto, Japan" autoComplete="off" style={{flex:1,width:'100%'}} aria-describedby={`${id}-search-note`}
            onChange={event=>{resetSearch();setQuery(event.target.value)}}
            onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();void searchCities()}}}/>
          <button type="button" className="secondary" disabled={searching||query.trim().length<3} onClick={()=>void searchCities()}>{searching?<LoaderCircle size={15}/>:<Search size={15}/>}Search</button>
        </div>
        <p className="form-note" id={`${id}-search-note`} style={{marginTop:8}}>Search a city or town, then confirm the right place. Adding a country helps.</p>
      </div>
      {searching&&<p role="status" className="form-note">Finding places…</p>}
      {searchError&&<div role="alert" className="form-error">{searchError}</div>}
      {searched&&results.length===0&&<p role="status" className="form-note">No matching cities found. Try another spelling or add the country.</p>}
      {results.length>0&&<div role="group" aria-label="Choose a destination" style={{display:'grid',gap:8}}>
        {results.map(city=><button key={city.id} type="button" className="alternative-option" aria-pressed={selectedCity?.id===city.id} style={selectedCity?.id===city.id?{borderColor:'#31593f',background:'#edf2e5'}:undefined} onClick={()=>{setSelectedCity(city);setError('')}}>
          <MapPin size={17}/><span><strong>{city.name}</strong><small>{[city.region,city.country].filter(Boolean).join(', ')}</small></span>{selectedCity?.id===city.id?<Check size={17}/>:<ArrowRight size={15}/>}
        </button>)}
      </div>}
      <p className="form-note">Places by <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a>, based on <a href="https://www.geonames.org/" target="_blank" rel="noreferrer">GeoNames</a>.</p>
    </>}
    <label>Give it a name<input name="title" placeholder="A few days of something good" maxLength={100}/></label>
    <div className="form-grid">
      <label>First day<input type="date" value={startDate} onChange={event=>setStartDate(event.target.value)} required/></label>
      <label>Last day<input type="date" value={endDate} min={startDate||undefined} onChange={event=>setEndDate(event.target.value)} required/></label>
    </div>
    <label>Whole-trip budget (€)<input type="number" min="1" max="1000000" step="0.01" value={budget} onChange={event=>setBudget(event.target.value)} required/></label>
    <p className="form-note">{dayCount?`${dayCount} ${dayCount===1?'day':'days'}, ready to shape. `:''}Start with a blank itinerary. Add your stops, flights, and stay as you go. Trips can be up to 31 days.</p>
    <button className="primary" type="submit" disabled={searching}>Let’s go <ArrowRight size={16}/></button>
  </form>;
}
