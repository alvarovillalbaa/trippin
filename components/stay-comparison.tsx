'use client';
import {useState} from 'react';
import {Building2,Clock,ArrowRight} from 'lucide-react';
import {formatMoney} from '@/lib/trip';

type StayEstimate={nightly:number;fees:number;transit:number;minutes:number};
const fields:{key:keyof StayEstimate;label:string;max:number;step:number}[]=[
  {key:'nightly',label:'Per night (€)',max:100000,step:0.01},
  {key:'fees',label:'Total fees (€)',max:100000,step:0.01},
  {key:'transit',label:'Daily commute (€)',max:100000,step:0.01},
  {key:'minutes',label:'Minutes to center',max:600,step:1},
];
function boundedInput(value:string,max:number){
  const number=Number(value);
  return Number.isFinite(number)?Math.max(0,Math.min(max,number)):0;
}

export default function StayComparison({nights,days}:{nights:number;days:number}){
  const [a,setA]=useState<StayEstimate>({nightly:95,fees:20,transit:0,minutes:10});
  const [b,setB]=useState<StayEstimate>({nightly:65,fees:30,transit:9,minutes:35});
  const [timeValue,setTimeValue]=useState(0);
  const time=(stay:StayEstimate)=>stay.minutes*2*days/60;
  // Round complete option totals before comparing the amounts shown to the user.
  const totalCents=(stay:StayEstimate)=>{
    const cents=(stay.nightly*nights+stay.fees+stay.transit*days+time(stay)*timeValue)*100;
    return Math.round(cents+Math.max(1,Math.abs(cents))*Number.EPSILON);
  };
  const aCents=totalCents(a),bCents=totalCents(b),difference=Math.abs(aCents-bCents);
  const qualifier=timeValue>0?' including your time value':'';
  const conclusion=difference===0
    ?`Both stays have the same total of ${formatMoney(aCents/100)}${qualifier}.`
    :`${aCents<bCents?'Stay A':'Stay B'} has the lower total by ${formatMoney(difference/100)}${qualifier}.`;
  return <section className="stay-comparison">
    <div className="section-heading"><div><h2>Cheaper stay. Longer way?</h2><p>Compare the whole cost of a place, including the journey into the city.</p></div><Building2 size={22}/></div>
    <div className="stay-options">{[{value:a,set:setA,label:'Stay A · closer in'},{value:b,set:setB,label:'Stay B · further out'}].map(option=><div className="stay-option" key={option.label}>
      <h3>{option.label}</h3>
      <div className="form-grid">{fields.map(item=><label key={item.key}>{item.label}<input
        aria-label={`${option.label} ${item.label}`} type="number" min="0" max={item.max} step={item.step} value={option.value[item.key]}
        onChange={event=>{const value=boundedInput(event.currentTarget.value,item.max);option.set(current=>({...current,[item.key]:value}));}}
      /></label>)}</div>
      <div className="stay-total" style={{flexWrap:'wrap'}}><strong aria-label={`${option.label} comparison total`}>{formatMoney(totalCents(option.value)/100)}</strong><span><Clock size={12}/>{time(option.value).toFixed(1)} hrs commuting</span></div>
      <p className="estimate-note">{timeValue>0?'Including your time value':'Stay and commute costs'}</p>
    </div>)}</div>
    <div className="stay-conclusion">
      <label>Your time, if you’d like to price it (€ / hour)<input
        aria-label="Your time, if you’d like to price it (€ / hour)" type="number" min="0" max="10000" step="0.01" value={timeValue}
        onChange={event=>setTimeValue(boundedInput(event.currentTarget.value,10000))}
      /></label>
      <p aria-label="Stay comparison conclusion" aria-live="polite"><ArrowRight size={15}/>{conclusion}<small>{nights} nights · {days} days · two journeys per day. Enter estimates from the accommodation and transit providers.</small></p>
    </div>
  </section>
}
