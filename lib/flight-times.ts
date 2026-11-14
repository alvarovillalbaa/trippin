import type {FlightLookupResult} from './providers';

type Flight = FlightLookupResult['flights'][number];

export function formatFlightTime(value: string | null, timeZone: string | null): string {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Unavailable';
  const date = new Date(value);
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'shortOffset',
  };
  if (timeZone) {
    try {
      return `${new Intl.DateTimeFormat('en-GB', {...options, timeZone}).format(date)} · ${timeZone}`;
    } catch { /* An unsupported airport zone must not use the viewer's clock. */ }
  }
  return `${new Intl.DateTimeFormat('en-GB', {...options, timeZone: 'UTC'}).format(date)} · UTC (airport time zone unavailable)`;
}

export function flightTimeRows(flight: Flight): {label: string; value: string}[] {
  const rows = [];
  for (const [direction, zone, scheduled, estimated, actual] of [
    ['departure', flight.origin.timezone, flight.scheduledDeparture, flight.estimatedDeparture, flight.actualDeparture],
    ['arrival', flight.destination.timezone, flight.scheduledArrival, flight.estimatedArrival, flight.actualArrival],
  ]) {
    rows.push({label: `Scheduled ${direction}`, value: formatFlightTime(scheduled, zone)});
    if (actual) rows.push({label: `Actual ${direction}`, value: formatFlightTime(actual, zone)});
    else if (estimated) rows.push({label: `Estimated ${direction}`, value: formatFlightTime(estimated, zone)});
  }
  return rows;
}
