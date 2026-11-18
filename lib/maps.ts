import type { Activity } from './types';

/** Five stops fit Google's documented three-waypoint mobile-browser limit. */
export function getGoogleMapsRoutes(activities: Activity[]) {
  const stops = activities.filter(stop => stop.status !== 'skipped' && !stop.alternativeFor
    && Number.isFinite(stop.lat) && Math.abs(stop.lat) <= 90 && Number.isFinite(stop.lng) && Math.abs(stop.lng) <= 180);
  const routes: { url: string; first: number; last: number }[] = [];
  for (let start = 0; start < stops.length; start += 4) {
    const segment = stops.slice(start, start + 5);
    if (segment.length === 1 && start > 0) break;
    const coordinate = (stop: Activity) => `${stop.lat},${stop.lng}`;
    const url = new URL('https://www.google.com/maps/dir/');
    url.searchParams.set('api', '1'); url.searchParams.set('travelmode', 'walking');
    url.searchParams.set('destination', coordinate(segment.at(-1)!));
    if (segment.length > 1) url.searchParams.set('origin', coordinate(segment[0]));
    if (segment.length > 2) url.searchParams.set('waypoints', segment.slice(1, -1).map(coordinate).join('|'));
    routes.push({ url: url.href, first: start + 1, last: start + segment.length });
  }
  return routes;
}
