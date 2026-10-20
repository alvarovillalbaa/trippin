export type ActivityCategory =
  | "culture"
  | "food"
  | "outdoors"
  | "nightlife"
  | "community"
  | "transport"
  | "stay"
  | "other";

export type ActivityStatus = "planned" | "done" | "skipped";
export type DataSource = "demo" | "custom" | "ai";

export interface Activity {
  id: string;
  title: string;
  category: ActivityCategory;
  description: string;
  time: string;
  duration: number;
  cost: number;
  lat: number;
  lng: number;
  location: string;
  image?: string;
  status: ActivityStatus;
  /** This option starts skipped and replaces the named activity when selected. */
  alternativeFor?: string;
  bookingUrl?: string;
  source: DataSource;
}

export interface TripDay {
  id: string;
  date: string;
  label: string;
  activities: Activity[];
}

export interface Expense {
  id: string;
  title: string;
  category: ActivityCategory;
  amount: number;
  date: string;
  /** Linked expenses replace the corresponding estimate in projected totals. */
  activityId?: string;
  bookingId?: string;
}

export interface Booking {
  id: string;
  type: "flight" | "stay" | "event";
  title: string;
  reference: string;
  date: string;
  url?: string;
  cost: number;
  notes?: string;
  status: "estimate" | "reserved";
  source: "demo" | "custom";
}

export interface DemoPerson {
  id: string;
  name: string;
  initials: string;
  homeCity: string;
  bio: string;
  interests: string[];
  color: string;
  source: "demo";
}

export interface JoinRequest {
  id: string;
  personId: string;
  message: string;
  status: "pending" | "accepted" | "declined";
  source: "demo";
}

export interface Trip {
  id: string;
  title: string;
  city: string;
  country: string;
  startDate: string;
  endDate: string;
  lat: number;
  lng: number;
  image: string;
  description: string;
  budget: number;
  currency: "EUR";
  days: TripDay[];
  expenses: Expense[];
  bookings: Booking[];
  isPublic: boolean;
  joinRequests: JoinRequest[];
  companions: DemoPerson[];
}

export interface Badge {
  id: string;
  title: string;
  description: string;
  icon: string;
  earned: boolean;
  source: "demo" | "derived";
}

export interface Profile {
  name: string;
  bio: string;
  homeCity: string;
  interests: string[];
  dailyFoodBudget: number;
  dailyTransportBudget: number;
  badges: Badge[];
}

export interface Destination {
  id: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
  image: string;
  description: string;
  suggestedBudget: number;
  centerTransfer: string;
  tags: string[];
}

export interface DemoEvent {
  id: string;
  title: string;
  city: string;
  location: string;
  date: string;
  time: string;
  category: ActivityCategory;
  description: string;
  cost: number;
  duration: number;
  lat: number;
  lng: number;
  image: string;
  source: "demo";
}

export interface WorkspaceState {
  version: 1;
  trips: Trip[];
  profile: Profile;
  selectedTripId: string;
}

export interface TripCost {
  total: number;
  spent: number;
  remaining: number;
  budget: number;
  activities: number;
  bookings: number;
  food: number;
  transport: number;
  manual: number;
  days: number;
}
