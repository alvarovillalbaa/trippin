'use client';
import {useState} from 'react';
import {Building2,Clock,ArrowRight} from 'lucide-react';
import {formatMoney} from '@/lib/trip';

export default function StayComparison({nights,days}:{nights:number;days:number}){
  const [a,setA]=useState({nightly:95,fees:20,transit:0,minutes:10});
  const [b,setB]=useState({nightly:65,fees:30,transit:9,minutes:35});
  const [timeValue,setTimeValue]=useState(0);
  const total=(stay:typeof a)=>stay.nightly*nights+stay.fees+stay.transit*days;
  const time=(stay:typeof a)=>stay.minutes*2*days/60;
  return <section className="stay-comparison"><div className="section-heading"><div><h2>Cheaper stay. Longer way?</h2><p>Compare the whole cost of a place, including the journey into the city.</p></div><Building2 size={22}/></div><div className="stay-options">{[{value:a,set:setA,label:'Stay A · closer in'},{value:b,set:setB,label:'Stay B · further out'}].map(option=><div className="stay-option" key={option.label}><h3>{option.label}</h3><div className="form-grid">{[{key:'nightly',label:'Per night (€)'},{key:'fees',label:'Total fees (€)'},{key:'transit',label:'Daily commute (€)'},{key:'minutes',label:'Minutes to center'}].map(item=><label key={item.key}>{item.label}<input aria-label={`${option.label} ${item.label}`} type="number" min="0" max={item.key==='minutes'?600:100000} value={option.value[item.key as keyof typeof a]} onChange={e=>option.set({...option.value,[item.key]:Math.max(0,Math.min(100000,Number(e.target.value)))})}/></label>)}</div><div className="stay-total"><strong>{formatMoney(total(option.value))}</strong><span><Clock size={12}/>{time(option.value).toFixed(1)} hrs commuting</span></div></div>)}</div><div className="stay-conclusion"><label>Your time, if you’d like to price it (€ / hour)<input type="number" min="0" max="10000" value={timeValue} onChange={e=>setTimeValue(Math.max(0,Number(e.target.value)))}/></label><p><ArrowRight size={15}/>{total(a)+time(a)*timeValue<=total(b)+time(b)*timeValue?'Stay A':'Stay B'} has the lower total by {formatMoney(Math.abs((total(a)+time(a)*timeValue)-(total(b)+time(b)*timeValue)))}{timeValue>0?' including your time value':''}.<small>{nights} nights · {days} days · two journeys per day. Enter estimates from the accommodation and transit providers.</small></p></div></section>
}
