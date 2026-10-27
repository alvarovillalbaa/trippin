import { serializeWorkspace } from './trip';
import type { Expense, WorkspaceState } from './types';

export interface CsvImportTicket {
  tripId: string;
  identity: number | undefined;
  requestId: number;
}

interface CsvNotice {
  requestId: number;
  message: string;
  accepted: boolean;
}

/** Runtime metadata stays outside the portable workspace model. */
export interface WorkspaceEditorState {
  workspace: WorkspaceState;
  tripIdentities: ReadonlyMap<string, number>;
  nextIdentity: number;
  csvNotice: CsvNotice | null;
}

export type WorkspaceUpdate = WorkspaceState | ((current: WorkspaceState) => WorkspaceState);
export type WorkspaceAction =
  | { type: 'update'; update: WorkspaceUpdate }
  | { type: 'csv-import'; ticket: CsvImportTicket; expenses: Expense[] }
  | { type: 'csv-error'; ticket: CsvImportTicket; message: string };

export function createWorkspaceEditor(workspace: WorkspaceState): WorkspaceEditorState {
  return {
    workspace,
    tripIdentities: new Map(workspace.trips.map((trip, index) => [trip.id, index + 1])),
    nextIdentity: workspace.trips.length + 1,
    csvNotice: null,
  };
}

export function workspaceReducer(current: WorkspaceEditorState, action: WorkspaceAction): WorkspaceEditorState {
  if (action.type === 'update') {
    const replacing = typeof action.update !== 'function';
    const workspace = typeof action.update === 'function' ? action.update(current.workspace) : action.update;
    if (!replacing && workspace === current.workspace) return current;
    let nextIdentity = current.nextIdentity;
    const tripIdentities = new Map<string, number>();
    for (const trip of workspace.trips) {
      const previous = replacing ? undefined : current.tripIdentities.get(trip.id);
      tripIdentities.set(trip.id, previous ?? nextIdentity++);
    }
    return { workspace, tripIdentities, nextIdentity, csvNotice: replacing ? null : current.csvNotice };
  }

  const { ticket } = action;
  // Replacements and deletion/recreation must not revive an old file read.
  if (ticket.identity === undefined || current.tripIdentities.get(ticket.tripId) !== ticket.identity) return current;
  const target = current.workspace.trips.find(trip => trip.id === ticket.tripId);
  if (!target) return current;
  const reject = (message: string): WorkspaceEditorState => ({
    ...current, csvNotice: { requestId: ticket.requestId, message, accepted: false },
  });
  if (action.type === 'csv-error') return reject(action.message);
  if (target.expenses.length + action.expenses.length > 1000) {
    return reject('Keep up to 1,000 expenses per trip. No CSV rows were imported.');
  }
  const workspace: WorkspaceState = {
    ...current.workspace,
    trips: current.workspace.trips.map(trip => trip.id === target.id
      ? { ...trip, expenses: [...trip.expenses, ...action.expenses] } : trip),
  };
  try { serializeWorkspace(workspace, 0); }
  catch (error) {
    return reject(`${error instanceof Error ? error.message : 'The import would make this workspace invalid.'} No CSV rows were imported.`);
  }
  return {
    ...current,
    workspace,
    csvNotice: { requestId: ticket.requestId, message: `${action.expenses.length} expenses imported into ${target.city}.`, accepted: true },
  };
}
