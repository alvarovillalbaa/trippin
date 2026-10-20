import type { Activity, DemoEvent, DemoPerson, Destination, Profile, Trip } from "./types";

/** Every price, itinerary, profile, event and social interaction here is demo data. */
export const destinations: Destination[] = [
  {
    id: "munich", city: "Munich", country: "Germany", countryCode: "DE", lat: 48.1372, lng: 11.5756,
    image: "/images/munich.jpg", description: "Old-world streets, green escapes, and a table worth staying for.",
    suggestedBudget: 850, centerTransfer: "Airport → center: allow around 45 min by S-Bahn. Check the current timetable and fare.",
    tags: ["Culture", "Outdoors", "Good food"],
  },
  {
    id: "lisbon", city: "Lisbon", country: "Portugal", countryCode: "PT", lat: 38.7223, lng: -9.1393,
    image: "/images/lisbon.jpg", description: "A little slower. A little sunnier. Follow the hills to the sea.",
    suggestedBudget: 620, centerTransfer: "Airport → center: allow around 35 min by metro. Check the current timetable and fare.",
    tags: ["Food", "Architecture", "Nightlife"],
  },
  {
    id: "copenhagen", city: "Copenhagen", country: "Denmark", countryCode: "DK", lat: 55.6761, lng: 12.5683,
    image: "/images/copenhagen.jpg", description: "Design-minded days, harbor walks, and very good coffee.",
    suggestedBudget: 940, centerTransfer: "Airport → center: allow around 20 min by metro. Check current fares in DKK; trip estimates use EUR.",
    tags: ["Design", "Coffee", "Cycling"],
  },
  {
    id: "barcelona", city: "Barcelona", country: "Spain", countryCode: "ES", lat: 41.3874, lng: 2.1686,
    image: "/images/barcelona.jpg", description: "Architecture on every corner. Sea air at the end of the day.",
    suggestedBudget: 760, centerTransfer: "Airport → center: allow around 40 min by bus. Check the current timetable and fare.",
    tags: ["Architecture", "Beach", "Food"],
  },
];

const activity = (value: Omit<Activity, "status" | "source"> & Partial<Pick<Activity, "status">>): Activity => ({
  status: "planned", source: "demo", ...value,
});

export const demoPeople: DemoPerson[] = [
  { id: "person-maya", name: "Maya Chen", initials: "MC", homeCity: "London", bio: "A fictional traveler who never skips a gallery or a good bakery.", interests: ["Art", "Coffee", "Architecture"], color: "#cb9b83", source: "demo" },
  { id: "person-luca", name: "Luca Rossi", initials: "LR", homeCity: "Milan", bio: "A fictional traveler here for early runs and long lunches.", interests: ["Running", "Food", "Outdoors"], color: "#93a58b", source: "demo" },
  { id: "person-noor", name: "Noor Malik", initials: "NM", homeCity: "Amsterdam", bio: "A fictional solo traveler collecting small live-music moments.", interests: ["Music", "Design", "Culture"], color: "#99a6bd", source: "demo" },
];

export const demoEvents: DemoEvent[] = [
  { id: "event-run", title: "An easy run by the Isar", city: "Munich", location: "Wittelsbacherbrücke", date: "2026-10-23", time: "08:00", category: "community", description: "Demo event · A conversational 5 km and a coffee afterward. No real organizer or ticket availability.", cost: 0, duration: 60, lat: 48.1205, lng: 11.5684, image: "/images/munich.jpg", source: "demo" },
  { id: "event-design", title: "Design, drinks & new faces", city: "Munich", location: "Glockenbachviertel", date: "2026-10-23", time: "18:30", category: "community", description: "Demo event · A small creative meetup for curious people. No real organizer or ticket availability.", cost: 12, duration: 120, lat: 48.1280, lng: 11.5690, image: "/images/munich.jpg", source: "demo" },
  { id: "event-jazz", title: "A little jazz, a late night", city: "Munich", location: "Maxvorstadt", date: "2026-10-24", time: "20:30", category: "nightlife", description: "Demo event · An imagined intimate jazz night. No real organizer or ticket availability.", cost: 18, duration: 120, lat: 48.1485, lng: 11.5650, image: "/images/munich.jpg", source: "demo" },
  { id: "event-lisbon", title: "Golden-hour photo walk", city: "Lisbon", location: "Miradouro de Santa Luzia", date: "2026-11-13", time: "16:00", category: "community", description: "Demo event · Find the light and swap travel stories. No real organizer or ticket availability.", cost: 0, duration: 90, lat: 38.7119, lng: -9.1303, image: "/images/lisbon.jpg", source: "demo" },
  { id: "event-copenhagen", title: "Coffee & design walk", city: "Copenhagen", location: "Nørrebro", date: "2026-12-04", time: "10:00", category: "community", description: "Demo event · Independent shops and fresh perspectives. No real organizer or ticket availability.", cost: 8, duration: 90, lat: 55.6890, lng: 12.5530, image: "/images/copenhagen.jpg", source: "demo" },
];

export const seedProfile: Profile = {
  name: "Alex Morgan", homeCity: "Madrid", bio: "Travel light. Take the scenic route. Leave room for the unexpected.",
  interests: ["Architecture", "Coffee", "Art", "Outdoors", "Local food"], dailyFoodBudget: 38, dailyTransportBudget: 10,
  openToEvents: ["culture", "food", "outdoors", "community"],
  badges: [
    { id: "badge-solo", title: "Solo, together", description: "Demo badge · your first independent adventure.", icon: "compass", earned: true, source: "demo" },
    { id: "badge-germany", title: "Hallo, Germany", description: "Demo badge · a little Bavarian curiosity.", icon: "flag", earned: true, source: "demo" },
    { id: "badge-meet", title: "A new connection", description: "Demo badge · make space for someone new.", icon: "users", earned: false, source: "demo" },
    { id: "badge-portugal", title: "Olá, Portugal", description: "Demo badge · a future chapter by the Atlantic.", icon: "sun", earned: false, source: "demo" },
  ],
};

export const seedTrips: Trip[] = [
  {
    id: "trip-munich", title: "A little Munich escape", city: "Munich", country: "Germany", countryCode: "DE",
    startDate: "2026-10-22", endDate: "2026-10-25", lat: 48.1372, lng: 11.5756,
    image: "/images/munich.jpg", description: "Four days of good coffee, art, and getting a little lost. A demo trip, ready to make your own.",
    budget: 850, currency: "EUR", isPublic: false, companions: [],
    joinRequests: [{ id: "request-maya", personId: "person-maya", message: "Demo request · Would love to join your gallery afternoon and grab a coffee!", status: "pending", source: "demo" }],
    days: [
      { id: "munich-day-1", date: "2026-10-22", label: "Arrive & find your rhythm", activities: [
        activity({ id: "m1-coffee", title: "Coffee, then whatever", category: "food", description: "Start slowly with a flat white and something flaky. All prices are sample estimates.", time: "09:30", duration: 45, cost: 9, lat: 48.1327, lng: 11.5748, location: "Viktualienmarkt", image: "/images/munich.jpg" }),
        activity({ id: "m1-square", title: "Meet Munich at Marienplatz", category: "culture", description: "Follow the old-town lanes and get your bearings around the square.", time: "10:30", duration: 75, cost: 0, lat: 48.1374, lng: 11.5755, location: "Marienplatz" }),
        activity({ id: "m1-market", title: "Lunch at the market", category: "food", description: "Pick a market stall, find a seat, and see where the afternoon goes.", time: "12:30", duration: 60, cost: 16, lat: 48.1351, lng: 11.5760, location: "Viktualienmarkt" }),
        activity({ id: "m1-garden", title: "An English Garden kind of afternoon", category: "outdoors", description: "Wide paths, autumn colors, and a stop by the Eisbach. Keep some time unplanned.", time: "14:30", duration: 120, cost: 0, lat: 48.1488, lng: 11.5878, location: "Englischer Garten", image: "/images/munich.jpg" }),
        activity({ id: "m1-museum", title: "Rain plan: a modern-art detour", category: "culture", description: "A flexible indoor alternative. Check opening hours and current admission before you go.", time: "14:30", duration: 120, cost: 12, lat: 48.1468, lng: 11.5723, location: "Pinakothek der Moderne", status: "skipped", alternativeFor: "m1-garden", bookingUrl: "https://www.pinakothek-der-moderne.de/en/" }),
      ] },
      { id: "munich-day-2", date: "2026-10-23", label: "Art, side streets & new faces", activities: [
        activity({ id: "m2-bakery", title: "A proper bakery morning", category: "food", description: "Your morning coffee ritual, with no rush to get anywhere.", time: "09:00", duration: 45, cost: 10, lat: 48.1498, lng: 11.5762, location: "Maxvorstadt" }),
        activity({ id: "m2-art", title: "Get a little lost in modern art", category: "culture", description: "Art, architecture, and design in one generous afternoon. Admission is a demo estimate.", time: "10:30", duration: 150, cost: 12, lat: 48.1468, lng: 11.5723, location: "Pinakothek der Moderne", bookingUrl: "https://www.pinakothek-der-moderne.de/en/" }),
        activity({ id: "m2-lunch", title: "A long lunch in Maxvorstadt", category: "food", description: "Choose a neighborhood kitchen and leave a little room for dessert.", time: "13:30", duration: 75, cost: 20, lat: 48.1510, lng: 11.5669, location: "Maxvorstadt" }),
        activity({ id: "m2-meet", title: "Design, drinks & new faces", category: "community", description: "Demo meetup · an imagined gathering to show how events fit into your trip. No real event or ticket.", time: "18:30", duration: 120, cost: 12, lat: 48.1280, lng: 11.5690, location: "Glockenbachviertel", event: { provider: "demo", id: "event-design", scheduledDate: "2026-10-23" } }),
      ] },
      { id: "munich-day-3", date: "2026-10-24", label: "A different side of the city", activities: [
        activity({ id: "m3-isar", title: "An easy morning by the Isar", category: "outdoors", description: "Walk the river, stop when you feel like it, and let the city wake up.", time: "09:00", duration: 90, cost: 0, lat: 48.1289, lng: 11.5830, location: "Isar riverbanks" }),
        activity({ id: "m3-brunch", title: "Brunch in Glockenbach", category: "food", description: "Neighborhood energy, a second coffee, and nowhere urgent to be.", time: "11:00", duration: 75, cost: 22, lat: 48.1279, lng: 11.5703, location: "Glockenbachviertel" }),
        activity({ id: "m3-palace", title: "A quiet palace-garden afternoon", category: "outdoors", description: "Wander the grounds. Allow additional time for public transport; map walking estimates are direct distances.", time: "14:00", duration: 150, cost: 0, lat: 48.1583, lng: 11.5033, location: "Nymphenburg Palace park" }),
        activity({ id: "m3-jazz", title: "A little jazz, a late night", category: "nightlife", description: "Demo event · an imagined small-venue jazz set. Check a real listing before making plans.", time: "20:30", duration: 120, cost: 18, lat: 48.1485, lng: 11.5650, location: "Maxvorstadt", event: { provider: "demo", id: "event-jazz", scheduledDate: "2026-10-24" } }),
      ] },
      { id: "munich-day-4", date: "2026-10-25", label: "One last slow morning", activities: [
        activity({ id: "m4-breakfast", title: "Your last Munich coffee", category: "food", description: "One more coffee and a few favorite moments in your journal.", time: "09:00", duration: 60, cost: 12, lat: 48.1372, lng: 11.5756, location: "Old town" }),
        activity({ id: "m4-hofgarten", title: "A final lap through Hofgarten", category: "outdoors", description: "A little greenery before the journey home.", time: "10:30", duration: 60, cost: 0, lat: 48.1427, lng: 11.5800, location: "Hofgarten" }),
        activity({ id: "m4-airport", title: "Leave room for the airport", category: "transport", description: "Demo transfer estimate. Check your terminal, live timetable, and fare; allow an appropriate flight check-in buffer.", time: "12:30", duration: 60, cost: 16, lat: 48.1371, lng: 11.5754, location: "Marienplatz S-Bahn" }),
      ] },
    ],
    expenses: [],
    bookings: [
      { id: "m-flight", type: "flight", title: "Madrid ↔ Munich", reference: "DEMO · no reservation", date: "2026-10-22", cost: 168, status: "estimate", source: "demo", notes: "Sample return-flight budget only. No real ticket, flight number, or live status.", url: "https://www.google.com/travel/flights" },
      { id: "m-stay", type: "stay", title: "A small stay in Glockenbach", reference: "DEMO · no reservation", date: "2026-10-22", cost: 285, status: "estimate", source: "demo", notes: "Sample estimate: 3 nights × €95. No real accommodation or availability. Around 20 minutes' walk to Marienplatz (illustrative estimate).", url: "https://www.airbnb.com/s/Munich--Germany/homes" },
    ],
  },
  {
    id: "trip-lisbon", title: "Chasing the Lisbon light", city: "Lisbon", country: "Portugal", countryCode: "PT", startDate: "2026-11-13", endDate: "2026-11-15",
    lat: 38.7223, lng: -9.1393, image: "/images/lisbon.jpg", description: "A demo weekend of tiled streets, long lunches, and Atlantic light.", budget: 620, currency: "EUR", isPublic: false, joinRequests: [], companions: [], expenses: [],
    bookings: [{ id: "l-stay", type: "stay", title: "A guesthouse near Baixa", reference: "DEMO · no reservation", date: "2026-11-13", cost: 180, status: "estimate", source: "demo", notes: "Sample estimate: 2 nights × €90. No real availability." }],
    days: [
      { id: "lisbon-day-1", date: "2026-11-13", label: "Follow the light", activities: [
        activity({ id: "l1-coffee", title: "A bica and a pastel de nata", category: "food", description: "Ease into the city, one small coffee at a time.", time: "09:30", duration: 45, cost: 7, lat: 38.7106, lng: -9.1426, location: "Chiado" }),
        activity({ id: "l1-alfama", title: "Take the long way through Alfama", category: "culture", description: "Follow the tiled streets uphill and pause at the viewpoints.", time: "11:00", duration: 120, cost: 0, lat: 38.7119, lng: -9.1303, location: "Alfama" }),
        activity({ id: "l1-sunset", title: "Golden-hour photo walk", category: "community", description: "Demo event · a fictional walk to explore how travel and meeting people can fit together.", time: "16:00", duration: 90, cost: 0, lat: 38.7119, lng: -9.1303, location: "Miradouro de Santa Luzia", event: { provider: "demo", id: "event-lisbon", scheduledDate: "2026-11-13" } }),
      ] },
      { id: "lisbon-day-2", date: "2026-11-14", label: "By the river", activities: [
        activity({ id: "l2-belem", title: "A morning in Belém", category: "culture", description: "Riverside walks and monastery views. Admission and transport are separate from this free outdoor stop.", time: "10:00", duration: 120, cost: 0, lat: 38.6979, lng: -9.2065, location: "Belém" }),
        activity({ id: "l2-lunch", title: "Lunch, made local", category: "food", description: "Find a neighborhood table and linger a little.", time: "13:00", duration: 90, cost: 20, lat: 38.7074, lng: -9.1440, location: "Cais do Sodré" }),
        activity({ id: "l2-miradouro", title: "Sunset above the rooftops", category: "outdoors", description: "Leave time for the climb and stay for the colors.", time: "17:00", duration: 75, cost: 0, lat: 38.7165, lng: -9.1442, location: "Miradouro de São Pedro de Alcântara" }),
      ] },
      { id: "lisbon-day-3", date: "2026-11-15", label: "A slower goodbye", activities: [
        activity({ id: "l3-breakfast", title: "One last bakery stop", category: "food", description: "A quiet breakfast before packing up.", time: "09:30", duration: 60, cost: 10, lat: 38.7114, lng: -9.1394, location: "Baixa" }),
        activity({ id: "l3-square", title: "Meet the river at Praça do Comércio", category: "outdoors", description: "A final walk by the water before heading home.", time: "11:00", duration: 60, cost: 0, lat: 38.7078, lng: -9.1366, location: "Praça do Comércio" }),
      ] },
    ],
  },
  {
    id: "trip-copenhagen", title: "Copenhagen, at your pace", city: "Copenhagen", country: "Denmark", countryCode: "DK", startDate: "2026-12-04", endDate: "2026-12-06",
    lat: 55.6761, lng: 12.5683, image: "/images/copenhagen.jpg", description: "A demo design-minded weekend, with room for a second coffee. EUR amounts are illustrative, not currency quotes.", budget: 940, currency: "EUR", isPublic: false, joinRequests: [], companions: [], expenses: [],
    bookings: [{ id: "c-stay", type: "stay", title: "A cozy base in Nørrebro", reference: "DEMO · no reservation", date: "2026-12-04", cost: 250, status: "estimate", source: "demo", notes: "Sample estimate: 2 nights × €125. No real accommodation or current exchange rate." }],
    days: [
      { id: "copenhagen-day-1", date: "2026-12-04", label: "Coffee & good design", activities: [
        activity({ id: "c1-coffee", title: "Coffee & design walk", category: "community", description: "Demo event · an imagined walk around independent Nørrebro shops.", time: "10:00", duration: 90, cost: 8, lat: 55.6890, lng: 12.5530, location: "Nørrebro", event: { provider: "demo", id: "event-copenhagen", scheduledDate: "2026-12-04" } }),
        activity({ id: "c1-market", title: "A market lunch", category: "food", description: "Let the counters at Torvehallerne do the choosing.", time: "12:30", duration: 75, cost: 24, lat: 55.6835, lng: 12.5714, location: "Torvehallerne" }),
        activity({ id: "c1-lakes", title: "A lap around the lakes", category: "outdoors", description: "Take the scenic route back and stop for a warm drink.", time: "14:30", duration: 90, cost: 0, lat: 55.6867, lng: 12.5650, location: "The Lakes" }),
      ] },
      { id: "copenhagen-day-2", date: "2026-12-05", label: "Harbor air & quiet galleries", activities: [
        activity({ id: "c2-nyhavn", title: "A harbor morning", category: "outdoors", description: "Colorful facades and crisp air by the water.", time: "10:00", duration: 60, cost: 0, lat: 55.6799, lng: 12.5905, location: "Nyhavn" }),
        activity({ id: "c2-design", title: "An afternoon of Danish design", category: "culture", description: "Check opening hours and admission before visiting. The EUR price is a demo estimate.", time: "12:00", duration: 120, cost: 20, lat: 55.6862, lng: 12.5930, location: "Designmuseum Danmark", bookingUrl: "https://designmuseum.dk/en/" }),
        activity({ id: "c2-dinner", title: "Dinner worth slowing down for", category: "food", description: "Find a neighborhood table for the evening.", time: "18:30", duration: 90, cost: 35, lat: 55.6720, lng: 12.5580, location: "Vesterbro" }),
      ] },
      { id: "copenhagen-day-3", date: "2026-12-06", label: "A little more hygge", activities: [
        activity({ id: "c3-breakfast", title: "Pastries before you go", category: "food", description: "One more bakery, one more good coffee.", time: "09:30", duration: 60, cost: 15, lat: 55.6815, lng: 12.5691, location: "City center" }),
        activity({ id: "c3-garden", title: "A walk in the King's Garden", category: "outdoors", description: "A final pocket of green in the center of the city.", time: "11:00", duration: 60, cost: 0, lat: 55.6858, lng: 12.5797, location: "Kongens Have" }),
      ] },
    ],
  },
];
