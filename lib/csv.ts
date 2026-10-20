export function parseExpenseCsv(input:string): {title:string;amount:number;date:string;category:string}[] {
  if(input.length>500_000)throw new Error('Choose a CSV smaller than 500 KB.');
  const rows:string[][]=[];let row:string[]=[],cell='',quoted=false;
  for(let i=0;i<input.length;i++){
    const c=input[i];
    if(c==='"'){if(quoted&&input[i+1]==='"'){cell+='"';i++}else quoted=!quoted}
    else if(c===','&&!quoted){row.push(cell);cell=''}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&input[i+1]==='\n')i++;row.push(cell);if(row.some(Boolean))rows.push(row);row=[];cell=''}
    else cell+=c;
  }
  if(quoted)throw new Error('The CSV has an unclosed quoted field.');
  row.push(cell);if(row.some(Boolean))rows.push(row);
  const header=rows.shift()?.map(v=>v.replace(/^\uFEFF/,'').trim().toLowerCase())||[];
  const indexes=['title','amount','date','category'].map(v=>header.indexOf(v));
  if(indexes.slice(0,3).some(i=>i<0))throw new Error('Use the CSV headers title,amount,date,category.');
  if(rows.length>500)throw new Error('Import up to 500 expense rows at a time.');
  return rows.map((r,i)=>{
    const amount=Number(r[indexes[1]]);const date=r[indexes[2]]?.trim();
    const parsed=new Date(`${date}T12:00:00.000Z`);
    if(!r[indexes[0]]?.trim()||!Number.isFinite(amount)||amount<=0||amount>1_000_000||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date)throw new Error(`Check the title, positive EUR amount, and YYYY-MM-DD date in row ${i+2}.`);
    return{title:r[indexes[0]].trim().slice(0,160),amount,date,category:r[indexes[3]]?.trim()||'other'};
  });
}
