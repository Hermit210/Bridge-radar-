import { LiveFeed } from "@/components/live-feed";
import { apiUrls, listEvents } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const { events } = await listEvents({ limit: 50 }).catch(() => ({ events: [] }));
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">All events</h1>
        <p className="mt-1 text-sm text-muted">
          Live stream across every bridge. Pulled from the public{" "}
          <code className="text-text">/v1/ws</code> endpoint.
        </p>
      </div>
      <LiveFeed initial={events} wsUrl={apiUrls.ws} />
    </div>
  );
}
