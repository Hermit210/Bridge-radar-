import { LiveFeed } from "@/components/live-feed";
import { apiUrls, listEvents } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const { events } = await listEvents({ limit: 50 }).catch(() => ({ events: [] }));
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">All events</h1>
        <p className="mt-2 text-sm text-text-secondary leading-relaxed">
          Live stream across every bridge. Pulled from the public{" "}
          <code className="font-mono bg-surface-2 px-2 py-0.5 rounded text-accent text-sm">/v1/ws</code> endpoint.
        </p>
      </div>
      <LiveFeed initial={events} wsUrl={apiUrls.ws} />
    </div>
  );
}
