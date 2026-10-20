import { none, type AuthFn } from "eve/channels/auth";
import { eveChannel } from "eve/channels/eve";
import { assistantReadiness } from "../lib/readiness";

const publicDemo = none();

const publicPlanningOnly: AuthFn<Request> = async (request) => {
  if (!assistantReadiness().enabled) return null;
  if (request.headers.get("sec-fetch-site") === "cross-site") return null;

  // This channel admits anonymous planning conversations only. It has no
  // private-data connections, purchasing tools, or access to browser storage.
  return publicDemo(request);
};

export default eveChannel({ auth: publicPlanningOnly });
