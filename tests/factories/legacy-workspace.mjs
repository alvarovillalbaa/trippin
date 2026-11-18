// T2: the old authored portfolio sample remains a fixture, never a new user's data.
import { seedProfile, seedTrips } from '../../lib/data.ts';
export function legacyWorkspace() {
  return structuredClone({ version: 1, trips: seedTrips, profile: seedProfile, selectedTripId: seedTrips[0].id });
}
