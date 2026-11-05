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
    setFailed(false);
    let disposed=false;
    let ownedInstance:LeafletMap|null=null;
    let ownedHost:HTMLDivElement|null=null;
    let resize:ResizeObserver|null=null;
    let zooming=false;
    const removeOwned=()=>{
      const instance=ownedInstance;
      ownedInstance=null;
      if(instance){instance.off('zoomstart',onZoomStart);instance.off('zoomend',onZoomEnd);instance.remove()}
      ownedHost?.remove();ownedHost=null;
    };
    const onZoomStart=()=>{zooming=true};
    // Leaflet dispatches moveend after zoomend; retire only after both handlers return.
    const onZoomEnd=()=>{zooming=false;if(disposed)queueMicrotask(removeOwned)};
    void import('leaflet').then(L=>{
      if(disposed||!element.current)return;
      const host=document.createElement('div');
      host.style.width='100%';host.style.height='100%';
      element.current.appendChild(host);ownedHost=host;
      const instance=L.map(host,{zoomControl:false,scrollWheelZoom:false});
      ownedInstance=instance;
      map.current=instance;
      const isCurrent=()=>!disposed&&map.current===instance;
      instance.on('zoomstart',onZoomStart);instance.on('zoomend',onZoomEnd);
      const active=activities.filter(a=>a.status!=='skipped'&&!a.alternativeFor);
      if(active.length>1)instance.fitBounds(L.latLngBounds(active.map(a=>[a.lat,a.lng] as [number,number])),{padding:[65,65],maxZoom:15});
      else instance.setView([trip.lat,trip.lng],13);
      L.control.zoom({position:'bottomright'}).addTo(instance);
      const tile=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(instance);
      tile.on('tileerror',()=>{if(isCurrent())setFailed(true)});
      active.forEach((activity,index)=>{
        const marker=L.marker([activity.lat,activity.lng],{icon:L.divIcon({className:'place-marker',html:`<span class="${activity.id===selected?'is-selected':''}">${index+1}</span>`,iconSize:[34,40],iconAnchor:[17,38]})}).addTo(instance);
        const tooltip=document.createElement('span');
        tooltip.textContent=activity.title;
        marker.bindTooltip(tooltip,{direction:'top',offset:[0,-32]});
        marker.on('click',()=>{if(isCurrent())onSelect(activity.id)});
      });
      if(active.length>1){
        L.polyline(active.map(a=>[a.lat,a.lng] as [number,number]),{color:'#2b6350',weight:3,dashArray:'5 9',opacity:.65}).addTo(instance);
      }
      resize=new ResizeObserver(()=>{if(isCurrent())instance.invalidateSize()});
      resize.observe(element.current);
      instance.on('unload',()=>resize?.disconnect());
      const focus=active.find(a=>a.id===selected);
      if(focus)instance.panTo([focus.lat,focus.lng]);
    }).catch(()=>{if(!disposed)setFailed(true)});
    return()=>{disposed=true;resize?.disconnect();if(map.current===ownedInstance)map.current=null;ownedHost?.remove();if(!zooming)removeOwned()};
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
