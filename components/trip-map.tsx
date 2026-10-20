'use client';

import {useEffect, useRef, useState} from 'react';
import type {Map as LeafletMap} from 'leaflet';
import type {Activity, Trip} from '@/lib/types';
import {Navigation, Layers3, MapPin, ExternalLink} from 'lucide-react';

export default function TripMap({trip,activities,selected,onSelect}:{trip:Trip;activities:Activity[];selected:string|null;onSelect:(id:string)=>void}) {
  const element=useRef<HTMLDivElement>(null);
  const map=useRef<LeafletMap|null>(null);
  const [failed,setFailed]=useState(false);
  const [mode,setMode]=useState<'street'|'terrain'>('street');
  useEffect(()=>{
    let disposed=false;
    void import('leaflet').then(L=>{
      if(disposed||!element.current)return;
      const instance=L.map(element.current,{zoomControl:false,scrollWheelZoom:false}).setView([trip.lat,trip.lng],13);
      map.current=instance;
      L.control.zoom({position:'bottomright'}).addTo(instance);
      const tile=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(instance);
      tile.on('tileerror',()=>{if(!disposed)setFailed(true)});
      const active=activities.filter(a=>a.status!=='skipped'&&!a.alternativeFor);
      active.forEach((activity,index)=>{
        const marker=L.marker([activity.lat,activity.lng],{icon:L.divIcon({className:'place-marker',html:`<span class="${activity.id===selected?'is-selected':''}">${index+1}</span>`,iconSize:[34,40],iconAnchor:[17,38]})}).addTo(instance);
        const tooltip=document.createElement('span');
        tooltip.textContent=activity.title;
        marker.bindTooltip(tooltip,{direction:'top',offset:[0,-32]});
        marker.on('click',()=>onSelect(activity.id));
      });
      if(active.length>1){
        L.polyline(active.map(a=>[a.lat,a.lng] as [number,number]),{color:'#2b6350',weight:3,dashArray:'5 9',opacity:.65}).addTo(instance);
        instance.fitBounds(L.latLngBounds(active.map(a=>[a.lat,a.lng] as [number,number])),{padding:[65,65],maxZoom:15});
      }
      const resize=new ResizeObserver(()=>instance.invalidateSize());
      resize.observe(element.current);
      instance.on('unload',()=>resize.disconnect());
      const focus=active.find(a=>a.id===selected);
      if(focus)instance.panTo([focus.lat,focus.lng]);
    }).catch(()=>{if(!disposed)setFailed(true)});
    return()=>{disposed=true;map.current?.remove();map.current=null};
  },[trip.id,trip.lat,trip.lng,activities,selected,onSelect]);
  const point=activities.find(a=>a.id===selected);
  return <section className={`map-panel ${mode==='terrain'?'map-muted':''}`} aria-label={`Map of ${trip.city}`}>
    <div ref={element} className="leaflet-map"/>
    <div className="map-label"><span className="live-dot"/>Your day, mapped out <span>{activities.filter(a=>a.status!=='skipped'&&!a.alternativeFor).length} stops</span></div>
    <button className="map-layers icon-button" aria-label="Toggle muted map colors" onClick={()=>setMode(mode==='street'?'terrain':'street')}><Layers3 size={19}/></button>
    {failed&&<div className="map-error">Map tiles are unavailable. Your places and directions are still here.</div>}
    <div className="map-place"><span className="map-place-icon"><MapPin size={20}/></span><div><small>{point?'SELECTED PLACE':'YOUR EXPLORING GROUND'}</small><strong>{point?.title||`${trip.city}, ${trip.country}`}</strong><span>{point?.location||'A good place to get a little lost.'}</span></div><a className="icon-button" aria-label="Open directions in Google Maps" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${point?`${point.lat},${point.lng}`:`${trip.lat},${trip.lng}`}&travelmode=walking`}><Navigation size={19}/></a></div>
    <a className="map-attribution" target="_blank" rel="noreferrer" href="https://www.openstreetmap.org">Explore on OpenStreetMap <ExternalLink size={11}/></a>
  </section>;
}
