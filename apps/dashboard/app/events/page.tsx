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
          <p className="mt-1.5 text-sm text-text-secondary leading-relaxed">
            Live stream across every bridge. Pulled from the public{" "}
            <code className="font-mono bg-surface-2 px-1.5 py-0.5 rounded text-accent text-xs">/v1/ws</code> endpoint.
          </p>
        </div>
      </Reveal>
      <Reveal delayMs={80}>
        <LiveFeed initial={events} bridgeOptions={bridgeOptions} />
      </Reveal>
    </div>
  );
}
