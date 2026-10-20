import { destinations, seedProfile, seedTrips } from "./data";
import type {
  Activity, ActivityCategory, Badge, Booking, DemoPerson, Destination, Expense,
  JoinRequest, Profile, Trip, TripCost, TripDay, WorkspaceState,
} from "./types";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const categories: ActivityCategory[] = ["culture", "food", "outdoors", "nightlife", "community", "transport", "stay", "other"];
const dayMilliseconds = 86_400_000;

export function makeId(prefix = "item"): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `${prefix}-${random}`;
}

function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !datePattern.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function getTripDays(startDate: string, endDate: string): string[] {
  if (!isDate(startDate) || !isDate(endDate)) throw new Error("Choose valid arrival and departure dates.");
  const start = Date.parse(`${startDate}T12:00:00.000Z`);
  const end = Date.parse(`${endDate}T12:00:00.000Z`);
  const length = Math.round((end - start) / dayMilliseconds) + 1;
  if (length < 1) throw new Error("Departure must be on or after arrival.");
  if (length > 31) throw new Error("Keep each trip to 31 days or fewer.");
  return Array.from({ length }, (_, index) => new Date(start + index * dayMilliseconds).toISOString().slice(0, 10));
}

export function createTrip(destination: Destination | string, startDate: string, endDate: string, title?: string): Trip {
  const place = typeof destination === "string"
    ? destinations.find((item) => item.id === destination.toLowerCase() || item.city.toLowerCase() === destination.toLowerCase())
    : destination;
  if (!place) throw new Error("Choose one of the available destinations.");
  const dates = getTripDays(startDate, endDate);
  return {
    id: makeId("trip"), title: title?.trim() || `${place.city}, at your pace`,
    city: place.city, country: place.country, startDate, endDate,
    lat: place.lat, lng: place.lng, image: place.image, description: place.description,
    budget: place.suggestedBudget, currency: "EUR", isPublic: false,
    days: dates.map((date, index) => ({ id: makeId("day"), date, label: index === 0 ? "Find your rhythm" : index === dates.length - 1 ? "A slower goodbye" : "Room for the unexpected", activities: [] })),
    expenses: [], bookings: [], joinRequests: [], companions: [],
  };
}

export function formatMoney(amount: number, currency = "EUR"): string {
  return new Intl.NumberFormat("en-IE", { style: "currency", currency, minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2 }).format(amount);
}

export function formatDate(value: string, options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }): string {
  if (!isDate(value)) return "Invalid date";
  return new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" }).format(new Date(`${value}T12:00:00.000Z`));
}

const roundMoney = (amount: number): number => Math.round((amount + Number.EPSILON) * 100) / 100;

/** Flight/stay estimates and linked actual expenses contribute once, never twice. */
export function getTripCost(trip: Trip, profile: Profile): TripCost {
  const usedExpenses = new Set<string>();
  let activities = 0;
  let bookings = 0;
  let knownFood = 0;
  let knownTransport = 0;
  let manual = 0;

  const addLocalCost = (category: ActivityCategory, cost: number, source: "activity" | "manual") => {
    if (category === "food") knownFood += cost;
    else if (category === "transport") knownTransport += cost;
    else if (source === "activity") activities += cost;
    else manual += cost;
  };

  for (const day of trip.days) {
    for (const activity of day.activities) {
      if (trip.bookings.some((booking) => booking.activityId === activity.id)) continue;
      const linked = trip.expenses.filter((expense) => expense.activityId === activity.id);
      if (activity.status !== "skipped" || linked.length) {
        const cost = linked.length ? linked.reduce((sum, item) => sum + item.amount, 0) : activity.cost;
        addLocalCost(activity.category, cost, "activity");
        linked.forEach((expense) => usedExpenses.add(expense.id));
      }
    }
  }

  for (const booking of trip.bookings) {
    const linked = trip.expenses.filter((expense) => (expense.bookingId === booking.id || (booking.activityId && expense.activityId === booking.activityId)) && !usedExpenses.has(expense.id));
    bookings += linked.length ? linked.reduce((sum, item) => sum + item.amount, 0) : booking.cost;
    linked.forEach((expense) => usedExpenses.add(expense.id));
  }

  for (const expense of trip.expenses) {
    if (!usedExpenses.has(expense.id)) addLocalCost(expense.category, expense.amount, "manual");
  }

  const days = trip.days.length;
  const food = Math.max(knownFood, profile.dailyFoodBudget * days);
  const transport = Math.max(knownTransport, profile.dailyTransportBudget * days);
  const total = roundMoney(activities + bookings + food + transport + manual);
  const spent = roundMoney(trip.expenses.reduce((sum, item) => sum + item.amount, 0));
  return {
    total, spent, remaining: roundMoney(trip.budget - total), budget: trip.budget,
    activities: roundMoney(activities), bookings: roundMoney(bookings),
    food: roundMoney(food), transport: roundMoney(transport), manual: roundMoney(manual), days,
  };
}

export function haversineDistance(from: Pick<Activity, "lat" | "lng">, to: Pick<Activity, "lat" | "lng">): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(to.lat - from.lat);
  const dLng = radians(to.lng - from.lng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(from.lat)) * Math.cos(radians(to.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

/** A city-walking heuristic (straight line × 1.25 at 4.5 km/h), not routed directions. */
export function getWalkingRoute(activities: Activity[]) {
  const stops = activities.filter((activity) => activity.status !== "skipped");
  const legs = stops.slice(1).map((to, index) => {
    const from = stops[index];
    const distanceKm = haversineDistance(from, to) * 1.25;
    return { from, to, distanceKm, minutes: Math.ceil(distanceKm / 4.5 * 60) };
  });
  return {
    legs,
    distanceKm: legs.reduce((sum, leg) => sum + leg.distanceKm, 0),
    minutes: legs.reduce((sum, leg) => sum + leg.minutes, 0),
  };
}

export function initialWorkspace(): WorkspaceState {
  const state: WorkspaceState = { version: 1, trips: seedTrips, profile: seedProfile, selectedTripId: seedTrips[0].id };
  return structuredClone(state);
}

/** Badges describe saved activity completion; they do not verify a physical visit. */
export function getTravelBadges(trips: Trip[]): Badge[] {
  const completed = trips.flatMap((trip) => trip.days.flatMap((day) => day.activities.filter((activity) => activity.status === "done").map((activity) => ({ activity, trip }))));
  const countries = [...new Set(completed.map(({ trip }) => trip.country))];
  const countryBadges: Badge[] = countries.map((country) => ({
    id: `country-${country.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    title: country, description: `An activity marked complete in ${country}. Based on your saved trip, not location verification.`,
    icon: "flag", earned: true, source: "derived",
  }));
  return [
    { id: "first-step", title: "The first step", description: "Mark your first activity complete.", icon: "compass", earned: completed.length > 0, source: "derived" },
    { id: "culture-curious", title: "Culture curious", description: "Complete three culture activities.", icon: "landmark", earned: completed.filter(({ activity }) => activity.category === "culture").length >= 3, source: "derived" },
    { id: "outdoors-person", title: "Take it outside", description: "Complete three outdoor activities.", icon: "tree", earned: completed.filter(({ activity }) => activity.category === "outdoors").length >= 3, source: "derived" },
    { id: "new-faces", title: "New faces", description: "Complete a community activity.", icon: "users", earned: completed.some(({ activity }) => activity.category === "community"), source: "derived" },
    ...countryBadges,
  ];
}

/** Import EUR spending, with a header row: title, amount, category, date. */
export function parseExpenseCsv(csv: string, defaultDate: string): Expense[] {
  if (!isDate(defaultDate)) throw new Error("Choose a valid default expense date.");
  if (!csv.trim() || csv.length > 200_000) throw new Error("Choose a non-empty CSV smaller than 200 KB.");
  const firstLine = csv.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0];
  const delimiter = firstLine.includes(";") ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const source = csv.replace(/^\uFEFF/, "");
  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') { field += '"'; index++; }
      else if (!quoted && field.trim()) throw new Error("CSV quotation marks must surround the whole value.");
      else quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      row.push(field.trim()); field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && source[index + 1] === "\n") index++;
      row.push(field.trim()); field = "";
      if (row.some((value) => value.length)) rows.push(row);
      row = [];
    } else field += character;
    if (rows.length > 501) throw new Error("Import at most 500 expenses at a time.");
  }
  if (quoted) throw new Error("A quoted CSV value is missing its closing quotation mark.");
  row.push(field.trim());
  if (row.some((value) => value.length)) rows.push(row);
  if (rows.length < 2) throw new Error("Include a header row and at least one expense.");
  if (rows.length > 501) throw new Error("Import at most 500 expenses at a time.");
  const header = rows[0].map((value) => value.toLowerCase());
  const titleIndex = header.indexOf("title") >= 0 ? header.indexOf("title") : header.indexOf("description");
  const amountIndex = header.indexOf("amount");
  const categoryIndex = header.indexOf("category");
  const dateIndex = header.indexOf("date");
  const currencyIndex = header.indexOf("currency");
  if (titleIndex < 0 || amountIndex < 0) throw new Error("CSV headers must include title (or description) and amount.");
  return rows.slice(1).map((values, index) => {
    const error = (message: string) => new Error(`CSV row ${index + 2}: ${message}`);
    if (values.length !== header.length) throw error("the number of fields does not match the header.");
    const title = values[titleIndex];
    if (!title || title.length > 200) throw error("include a title with 1–200 characters.");
    let numeric = values[amountIndex].replace(/€/g, "").replace(/\s/g, "");
    if (!numeric.includes(".") && /^\d+,\d{1,2}$/.test(numeric)) numeric = numeric.replace(",", ".");
    if (!/^\d+(\.\d{1,2})?$/.test(numeric) || !amount(Number(numeric))) throw error("amount must be a positive EUR value with at most two decimals.");
    if (currencyIndex >= 0 && values[currencyIndex].toUpperCase() !== "EUR") throw error("only EUR expenses are supported; convert other currencies before importing.");
    const date = dateIndex >= 0 && values[dateIndex] ? values[dateIndex] : defaultDate;
    if (!isDate(date)) throw error("use YYYY-MM-DD dates.");
    const expenseCategory = categoryIndex >= 0 ? values[categoryIndex].toLowerCase() : "other";
    if (expenseCategory && !category(expenseCategory)) throw error(`unknown category; use ${categories.join(", ")}.`);
    return { id: makeId("expense"), title, amount: Number(numeric), category: (expenseCategory || "other") as ActivityCategory, date };
  });
}

type RecordValue = Record<string, unknown>;
const record = (value: unknown): value is RecordValue => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, maximum = 500): value is string => typeof value === "string" && value.length <= maximum;
const id = (value: unknown): value is string => text(value, 160) && value.length > 0;
const amount = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 10_000_000;
const latitude = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 90;
const longitude = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 180;
const category = (value: unknown): value is ActivityCategory => typeof value === "string" && categories.includes(value as ActivityCategory);
const optionalText = (value: unknown, maximum = 500): boolean => value === undefined || text(value, maximum);
const optionalId = (value: unknown): boolean => value === undefined || id(value);
const strings = (value: unknown, maximum = 30): value is string[] => Array.isArray(value) && value.length <= maximum && value.every((item) => text(item, 100));
const uniqueIds = (items: { id: string }[]) => new Set(items.map((item) => item.id)).size === items.length;
const publicUrl = (value: unknown): boolean => {
  if (value === undefined) return true;
  if (!text(value, 2000)) return false;
  try { const parsed = new URL(value); return parsed.protocol === "https:" || parsed.protocol === "http:"; } catch { return false; }
};
const imagePath = (value: unknown): boolean => text(value, 2000) && (value.startsWith("/images/") || publicUrl(value));

function isActivity(value: unknown): value is Activity {
  if (!record(value)) return false;
  return id(value.id) && text(value.title, 200) && category(value.category) && text(value.description, 4000)
    && typeof value.time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value.time)
    && amount(value.duration) && value.duration <= 1440 && amount(value.cost)
    && latitude(value.lat) && longitude(value.lng) && text(value.location, 300)
    && (value.image === undefined || imagePath(value.image))
    && ["planned", "done", "skipped"].includes(value.status as string)
    && optionalId(value.alternativeFor) && publicUrl(value.bookingUrl)
    && ["demo", "custom", "ai"].includes(value.source as string);
}

function isExpense(value: unknown): value is Expense {
  if (!record(value)) return false;
  return id(value.id) && text(value.title, 200) && category(value.category) && amount(value.amount)
    && isDate(value.date) && optionalId(value.activityId) && optionalId(value.bookingId)
    && !(value.activityId && value.bookingId);
}

function isBooking(value: unknown): value is Booking {
  if (!record(value)) return false;
  return id(value.id) && ["flight", "stay", "event"].includes(value.type as string)
    && text(value.title, 200) && text(value.reference, 200) && isDate(value.date)
    && publicUrl(value.url) && amount(value.cost) && optionalText(value.notes, 4000) && optionalId(value.activityId)
    && ["estimate", "reserved"].includes(value.status as string) && ["demo", "custom"].includes(value.source as string);
}

function isPerson(value: unknown): value is DemoPerson {
  return record(value) && id(value.id) && text(value.name, 100) && text(value.initials, 6)
    && text(value.homeCity, 100) && text(value.bio, 1000) && strings(value.interests)
    && typeof value.color === "string" && /^#[0-9a-f]{6}$/i.test(value.color) && value.source === "demo";
}

function isRequest(value: unknown): value is JoinRequest {
  return record(value) && id(value.id) && id(value.personId) && text(value.message, 2000)
    && ["pending", "accepted", "declined"].includes(value.status as string) && value.source === "demo";
}

function isBadge(value: unknown): value is Badge {
  return record(value) && id(value.id) && text(value.title, 100) && text(value.description, 1000)
    && text(value.icon, 40) && typeof value.earned === "boolean" && ["demo", "derived"].includes(value.source as string);
}

function isProfile(value: unknown): value is Profile {
  return record(value) && text(value.name, 100) && text(value.bio, 1000) && text(value.homeCity, 100)
    && strings(value.interests) && amount(value.dailyFoodBudget) && amount(value.dailyTransportBudget)
    && Array.isArray(value.badges) && value.badges.length <= 100 && value.badges.every(isBadge) && uniqueIds(value.badges);
}

function isDay(value: unknown): value is TripDay {
  return record(value) && id(value.id) && isDate(value.date) && text(value.label, 200)
    && Array.isArray(value.activities) && value.activities.length <= 60 && value.activities.every(isActivity) && uniqueIds(value.activities);
}

export function isTrip(value: unknown): value is Trip {
  if (!record(value) || !id(value.id) || !text(value.title, 200) || !text(value.city, 100)
    || !text(value.country, 100) || !isDate(value.startDate) || !isDate(value.endDate)
    || !latitude(value.lat) || !longitude(value.lng) || !imagePath(value.image) || !text(value.description, 4000)
    || !amount(value.budget) || value.currency !== "EUR" || typeof value.isPublic !== "boolean"
    || !Array.isArray(value.days) || value.days.length < 1 || value.days.length > 31 || !value.days.every(isDay)
    || !Array.isArray(value.expenses) || value.expenses.length > 1000 || !value.expenses.every(isExpense)
    || !Array.isArray(value.bookings) || value.bookings.length > 100 || !value.bookings.every(isBooking)
    || !Array.isArray(value.joinRequests) || value.joinRequests.length > 100 || !value.joinRequests.every(isRequest)
    || !Array.isArray(value.companions) || value.companions.length > 100 || !value.companions.every(isPerson)) return false;

  let dates: string[];
  try { dates = getTripDays(value.startDate, value.endDate); } catch { return false; }
  if (dates.length !== value.days.length || value.days.some((day, index) => day.date !== dates[index])) return false;
  const activities = value.days.flatMap((day) => day.activities);
  const linkedBookings = value.bookings.filter((booking) => booking.activityId);
  if (new Set(linkedBookings.map((booking) => booking.activityId)).size !== linkedBookings.length) return false;
  return uniqueIds(value.days) && uniqueIds(activities) && uniqueIds(value.expenses) && uniqueIds(value.bookings)
    && uniqueIds(value.joinRequests) && uniqueIds(value.companions);
}

export function isWorkspace(value: unknown): value is WorkspaceState {
  return record(value) && value.version === 1 && Array.isArray(value.trips) && value.trips.length > 0
    && value.trips.length <= 40 && value.trips.every(isTrip) && uniqueIds(value.trips)
    && isProfile(value.profile) && id(value.selectedTripId)
    && value.trips.some((trip) => trip.id === value.selectedTripId);
}

/** Only fully validated data can enter the workspace from local storage or a backup. */
export function restoreWorkspace(raw: string | null): WorkspaceState {
  if (!raw || raw.length > 2_000_000) return initialWorkspace();
  try {
    const parsed: unknown = JSON.parse(raw);
    return isWorkspace(parsed) ? parsed : initialWorkspace();
  } catch { return initialWorkspace(); }
}

export function serializeWorkspace(state: WorkspaceState): string {
  if (!isWorkspace(state)) throw new Error("The trip backup contains invalid or unsupported data.");
  return JSON.stringify(state, null, 2);
}
