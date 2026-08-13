// Real automated Telegram delivery of the weekly digest to every real
// subscriber in telegram_subscriptions. The digest itself is
// wallet-independent (see weekly-digest.ts), so it's computed exactly once
// per run and the identical real message is sent to every real chat_id --
// not recomputed per subscriber, and never a different message per person.

import cron from "node-cron";
import type { RadarDb } from "./db.js";
import { computeWeeklyDigest, formatWeeklyDigestMessage } from "./weekly-digest.js";

export interface WeeklyDigestSendResult {
  subscriberCount: number;
  sent: number;
  failed: { walletAddress: string; chatId: string; reason: string }[];
  /** Telegram's real raw response for each successful send -- proof of
   * real delivery (a real message_id Telegram assigned), not just a count. */
  deliveries: { walletAddress: string; chatId: string; text: string; telegramResponse: unknown }[];
}

/** Real Telegram sendMessage call — https://core.telegram.org/bots/api#sendmessage.
 * Returns Telegram's real raw JSON response body on success (proof of real
 * delivery: a real message_id), or throws with the real error description
 * on failure (e.g. the user blocked the bot: ok:false, error_code:403). */
async function sendTelegramMessage(botToken: string, chatId: string, text: string): Promise<unknown> {
  const r = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });
  const body = await r.json().catch(() => null);
  if (!r.ok || !body || typeof body !== "object" || (body as { ok?: boolean }).ok !== true) {
    const description =
      body && typeof body === "object" && "description" in body ? String((body as { description: unknown }).description) : `HTTP ${r.status}`;
    throw new Error(description);
  }
  return body;
}

/** Computes the real digest once and fans it out to every real subscriber.
 * A failed send (blocked bot, deactivated chat, rate limit, ...) is logged
 * and skipped -- it never aborts the rest of the batch. Callable directly
 * (see scripts/send-weekly-digest.ts for the manual-trigger path) and from
 * the scheduled cron job below, so there's exactly one send implementation. */
export async function runWeeklyDigestSend(db: RadarDb, botToken: string): Promise<WeeklyDigestSendResult> {
  const [digest, subscribers] = await Promise.all([computeWeeklyDigest(db), db.listTelegramSubscriptions()]);
  const text = formatWeeklyDigestMessage(digest);

  const failed: WeeklyDigestSendResult["failed"] = [];
  const deliveries: WeeklyDigestSendResult["deliveries"] = [];
  for (const sub of subscribers) {
    try {
      const telegramResponse = await sendTelegramMessage(botToken, sub.chatId, text);
      deliveries.push({ walletAddress: sub.walletAddress, chatId: sub.chatId, text, telegramResponse });
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      console.error(`[telegram-digest] send failed for wallet=${sub.walletAddress} chat=${sub.chatId}: ${reason}`);
      failed.push({ walletAddress: sub.walletAddress, chatId: sub.chatId, reason });
    }
  }
  return { subscriberCount: subscribers.length, sent: deliveries.length, failed, deliveries };
}

/** Real weekly schedule: Sunday 20:00 UTC (`0 20 * * 0`, node-cron's real
 * five-field cron syntax — https://www.npmjs.com/package/node-cron). No-op
 * (with a clear log line) if TELEGRAM_BOT_TOKEN isn't configured, matching
 * the existing alerter's honest dry-run behavior rather than crashing.
 *
 * Also a no-op when WEEKLY_DIGEST_EXTERNAL_CRON is set (Render deploy only)
 * — node-cron is a purely in-process, in-memory timer with no catch-up: it
 * only fires while this exact process is running, and Render's free tier
 * both spins down on inactivity and reserves the right to restart a free
 * service at any time. A scheduled GitHub Actions workflow now calls
 * POST /internal/weekly-digest instead, which doesn't depend on this
 * process being alive at the exact scheduled moment. Both mechanisms
 * calling runWeeklyDigestSend in the same week would double-send to every
 * subscriber, so exactly one is ever active per deploy target. */
export function scheduleWeeklyDigest(db: RadarDb, botToken: string | undefined): void {
  if (!botToken) {
    console.log("[telegram-digest] TELEGRAM_BOT_TOKEN not set — weekly digest scheduling disabled");
    return;
  }
  if (process.env.WEEKLY_DIGEST_EXTERNAL_CRON === "true") {
    console.log(
      "[telegram-digest] in-process schedule disabled — WEEKLY_DIGEST_EXTERNAL_CRON is set, " +
        "a scheduled GitHub Actions workflow calling POST /internal/weekly-digest handles this instead",
    );
    return;
  }
  cron.schedule(
    "0 20 * * 0",
    async () => {
      console.log("[telegram-digest] running scheduled weekly digest send");
      const result = await runWeeklyDigestSend(db, botToken).catch((e) => {
        console.error("[telegram-digest] scheduled send failed:", e);
        return null;
      });
      if (result) {
        console.log(
          `[telegram-digest] scheduled send complete: ${result.sent}/${result.subscriberCount} sent, ${result.failed.length} failed`,
        );
      }
    },
    { timezone: "UTC" },
  );
  console.log("[telegram-digest] weekly digest scheduled: Sunday 20:00 UTC");
}
