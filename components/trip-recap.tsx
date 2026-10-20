'use client';
import {useState} from 'react';
import {Download,ArrowUpRight} from 'lucide-react';
import type {Profile,Trip} from '@/lib/types';

export default function TripRecap({trip,profile}:{trip:Trip;profile:Profile}){
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const completed=trip.days.flatMap(d=>d.activities).filter(a=>a.status==='done');
  const places=new Set(completed.map(a=>a.location)).size;
  const imagePath=trip.image.startsWith('/images/')?trip.image:'/images/world.svg';
  async function exportCard(){
    setBusy(true);setError('');
    try{
      const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1350;
      const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Export is unavailable in this browser.');
      const img=new Image();img.src=imagePath;await img.decode();
      const scale=Math.max(1080/img.width,1350/img.height),w=img.width*scale,h=img.height*scale;
      ctx.drawImage(img,(1080-w)/2,(1350-h)/2,w,h);
      const shade=ctx.createLinearGradient(0,0,0,1350);shade.addColorStop(0,'#15322655');shade.addColorStop(.4,'#15322615');shade.addColorStop(1,'#102e22f5');ctx.fillStyle=shade;ctx.fillRect(0,0,1080,1350);
      ctx.fillStyle='#faf8e9';ctx.font='700 58px Manrope, sans-serif';ctx.fillText('trippin',74,109);ctx.fillStyle='#e69b6c';ctx.font='55px serif';ctx.fillText('✳',258,108);
      ctx.fillStyle='#e2e9cd';ctx.font='500 23px "DM Sans", sans-serif';ctx.fillText(profile.name.toUpperCase().slice(0,35),76,808);
      ctx.fillStyle='#fffdf1';ctx.font='600 92px Manrope, sans-serif';const title=trip.city.length>18?trip.city.slice(0,17)+'…':trip.city;ctx.fillText(title,70,930,930);ctx.fillStyle='#e59b6e';ctx.fillText('.',Math.min(1000,75+ctx.measureText(title).width),930);
      ctx.fillStyle='#dce4cc';ctx.font='400 28px "DM Sans", sans-serif';ctx.fillText('A little less planned. A lot more lived.',76,997);
      ctx.strokeStyle='#dce5c550';ctx.beginPath();ctx.moveTo(76,1060);ctx.lineTo(1004,1060);ctx.stroke();
      const stats=[{value:String(trip.days.length),label:'DAYS AWAY'},{value:String(places),label:'PLACES EXPLORED'},{value:String(completed.length),label:'LITTLE MOMENTS'}];
      stats.forEach((stat,i)=>{const x=76+i*325;ctx.fillStyle='#f2f5e6';ctx.font='500 59px Manrope, sans-serif';ctx.fillText(stat.value,x,1155);ctx.fillStyle='#b5c3a3';ctx.font='400 17px "DM Sans", sans-serif';ctx.fillText(stat.label,x,1193)});
      ctx.fillStyle='#b9c7a6';ctx.font='400 19px "DM Sans", sans-serif';ctx.fillText(`${trip.country}  ·  ${trip.startDate} — ${trip.endDate}`,76,1282);
      const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('Could not export this card.')),'image/png'));
      const url=URL.createObjectURL(blob);const link=document.createElement('a');link.download=`trippin-${trip.city.toLowerCase().replace(/[^a-z0-9]+/g,'-')}.png`;link.href=url;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(e){setError(e instanceof Error?e.message:'Could not export this card.')}finally{setBusy(false)}
  }
  return <section className="recap-section"><div className="section-heading"><div><h2>A story worth taking home.</h2><p>Your own travel overlay, made from the moments you mark done.</p></div><button className="secondary" disabled={busy} onClick={()=>void exportCard()}><Download size={15}/>{busy?'Making your card…':'Download story'}</button></div><div className="recap-card" style={{backgroundImage:`linear-gradient(0deg,#123322f5,#12332230 90%),url(${imagePath})`}}><span className="recap-brand">trippin<span>✳</span></span><div className="recap-content"><span>{profile.name.toUpperCase()} · {trip.country.toUpperCase()}</span><h2>{trip.city}<em>.</em></h2><p>A little less planned. A lot more lived.</p><div className="recap-stats"><span><strong>{trip.days.length}</strong><small>DAYS AWAY</small></span><span><strong>{places}</strong><small>PLACES EXPLORED</small></span><span><strong>{completed.length}</strong><small>LITTLE MOMENTS</small></span></div></div><ArrowUpRight className="recap-arrow" size={26}/></div>{error&&<p className="form-error" role="alert">{error}</p>}</section>;
}
