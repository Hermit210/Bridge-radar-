import { LiveFeed } from "@/components/live-feed";
import { apiUrls, listEvents } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const { events } = await listEvents({ limit: 50 }).catch(() => ({ events: [] }));
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="relative gradient-bg py-2">
        <div className="relative z-10">
          <h1 className="text-4xl font-bold tracking-tight">All events</h1>
          <p className="mt-2 text-sm text-text-secondary leading-relaxed">
            Live stream across every bridge. Pulled from the public{" "}
            <span className="badge font-mono text-accent">/v1/ws</span> endpoint.
          </p>
        </div>
      </div>
      <div className="section-divider" />
      <LiveFeed initial={events} wsUrl={apiUrls.ws} />
    </div>
  );
}
