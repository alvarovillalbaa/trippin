// T2: authored normalized flights; native Intl only, no provider/network/browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import {formatFlightTime, flightTimeRows} from '../../lib/flight-times.ts';

const flight = () => ({
  origin: {timezone: 'Europe/Madrid'}, destination: {timezone: 'Asia/Tokyo'},
  scheduledDeparture: '2026-01-15T08:00:00Z', estimatedDeparture: null, actualDeparture: null,
  scheduledArrival: '2026-01-15T23:30:00Z', estimatedArrival: null, actualArrival: null,
});

test('departure and arrival use their own airport dates, including next-day arrival', () => {
  const rows = flightTimeRows(flight());
  assert.deepEqual(rows.map(row => row.label), ['Scheduled departure', 'Scheduled arrival']);
  assert.match(rows[0].value, /15 Jan 2026, 09:00 GMT\+1 · Europe\/Madrid$/);
  assert.match(rows[1].value, /16 Jan 2026, 08:30 GMT\+9 · Asia\/Tokyo$/);
});

test('airport daylight saving follows the instant across the spring jump', () => {
  assert.match(formatFlightTime('2026-03-29T00:30:00Z', 'Europe/Madrid'), /29 Mar 2026, 01:30 GMT\+1/);
  assert.match(formatFlightTime('2026-03-29T01:30:00Z', 'Europe/Madrid'), /29 Mar 2026, 03:30 GMT\+2/);
});

test('repeated autumn local hour is disambiguated by its offset', () => {
  assert.match(formatFlightTime('2026-10-25T00:30:00Z', 'Europe/Madrid'), /25 Oct 2026, 02:30 GMT\+2/);
  assert.match(formatFlightTime('2026-10-25T01:30:00Z', 'Europe/Madrid'), /25 Oct 2026, 02:30 GMT\+1/);
});

test('half-hour zones and midnight retain the calendar date and 24-hour clock', () => {
  assert.match(formatFlightTime('2026-01-15T18:30:00Z', 'Asia/Kolkata'), /16 Jan 2026, 00:00 GMT\+5:30/);
});

test('missing and unsupported airport zones explicitly fall back to UTC', () => {
  for (const zone of [null, '', 'Unknown/Airport']) {
    assert.match(formatFlightTime('2026-01-15T08:00:00Z', zone),
      /^15 Jan 2026, 08:00 GMT(?:\+0)? · UTC \(airport time zone unavailable\)$/);
  }
});

test('absent or invalid times are unavailable instead of a date or crash', () => {
  for (const value of [null, '', 'not-an-instant']) assert.equal(formatFlightTime(value, 'Europe/Madrid'), 'Unavailable');
  const rows = flightTimeRows({...flight(), scheduledDeparture: null, scheduledArrival: null});
  assert.deepEqual(rows.map(row => row.value), ['Unavailable', 'Unavailable']);
});

test('estimates keep schedules and use the matching airport zone', () => {
  const rows = flightTimeRows({...flight(), estimatedDeparture: '2026-01-15T09:00:00Z', estimatedArrival: '2026-01-16T00:30:00Z'});
  assert.deepEqual(rows.map(row => row.label), ['Scheduled departure', 'Estimated departure', 'Scheduled arrival', 'Estimated arrival']);
  assert.match(rows[1].value, /15 Jan 2026, 10:00 GMT\+1/);
  assert.match(rows[3].value, /16 Jan 2026, 09:30 GMT\+9/);
});

test('actual times supersede estimates independently while schedules remain visible', () => {
  const rows = flightTimeRows({...flight(),
    estimatedDeparture: '2026-01-15T09:00:00Z', actualDeparture: '2026-01-15T09:15:00Z',
    estimatedArrival: '2026-01-16T00:30:00Z',
  });
  assert.deepEqual(rows.map(row => row.label), ['Scheduled departure', 'Actual departure', 'Scheduled arrival', 'Estimated arrival']);
  assert.match(rows[1].value, /15 Jan 2026, 10:15 GMT\+1/);
  const landed = flightTimeRows({...flight(), actualArrival: '2026-01-16T00:45:00Z', estimatedArrival: '2026-01-16T00:30:00Z'});
  assert.deepEqual(landed.map(row => row.label), ['Scheduled departure', 'Scheduled arrival', 'Actual arrival']);
  assert.match(landed[2].value, /16 Jan 2026, 09:45 GMT\+9/);
});
