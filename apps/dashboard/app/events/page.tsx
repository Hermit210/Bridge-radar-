import { LiveFeed } from "@/components/live-feed";
import { Reveal } from "@/components/reveal";
import { listEvents, listRegistry } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const [{ events }, registry] = await Promise.all([
    listEvents({ limit: 50 }).catch(() => ({ events: [] })),
    listRegistry().catch(() => null),
  ]);
  const bridgeOptions = (registry?.implemented ?? [])
    .map((b) => ({ id: b.id, displayName: b.name }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  return (
    <div className="space-y-6 animate-fade-in">
      <Reveal>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">All events</h1>
        </div>
      </Reveal>
      <Reveal delayMs={80}>
        <LiveFeed initial={events} bridgeOptions={bridgeOptions} />
      </Reveal>
    </div>
  );
}
