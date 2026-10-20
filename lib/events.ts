import type {ActivityCategory} from './types';

export interface EventPlanDraft {
  id: string;
  provider: 'ticketmaster' | 'demo';
  title: string;
  date: string;
  time: string | null;
  category: ActivityCategory;
  description: string;
  location: string;
  lat: number | null;
  lng: number | null;
  url?: string;
  price: {min:number;max:number|null;currency:string} | null;
  fetchedAt?: string;
}

export function describeEventPrice(price: EventPlanDraft['price']): string {
  if (!price) return 'No admission price supplied';
  const money = (amount:number) => new Intl.NumberFormat('en-GB', {style:'currency',currency:price.currency,maximumFractionDigits:2}).format(amount);
  return price.max === null || price.max === price.min
    ? `From ${money(price.min)}`
    : `${money(price.min)}–${money(price.max)}`;
}
