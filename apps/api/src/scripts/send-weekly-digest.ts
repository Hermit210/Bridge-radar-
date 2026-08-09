// Manual trigger for the real weekly Telegram digest send — the same
// runWeeklyDigestSend the Sunday-20:00-UTC cron job calls (see
// telegram-digest.ts), invoked directly instead of waiting for the
// schedule. Run with: pnpm --filter @radar/api send-weekly-digest

import "../load-env.js";
import { createDb } from "../db.js";
import { runWeeklyDigestSend } from "../telegram-digest.js";

async function main() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.error("TELEGRAM_BOT_TOKEN not set in .env — nothing to send with.");
    process.exit(1);
  }
  const dbUrl = process.env.DATABASE_URL ?? "sqlite://./data/radar.db";
  const db = createDb(dbUrl);
  console.log(`[send-weekly-digest] storage: ${dbUrl.startsWith("sqlite") ? "sqlite" : "postgres"}`);

  const result = await runWeeklyDigestSend(db, botToken);
  console.log(`[send-weekly-digest] ${result.sent}/${result.subscriberCount} sent, ${result.failed.length} failed`);
  if (result.deliveries.length > 0) {
    console.log("[send-weekly-digest] real deliveries (message content + real Telegram API response):");
    console.log(JSON.stringify(result.deliveries, null, 2));
  }
  if (result.failed.length > 0) {
    console.log("[send-weekly-digest] failures:", JSON.stringify(result.failed, null, 2));
  }
  await db.close();
}

main().catch((e) => {
  console.error("[send-weekly-digest] fatal:", e);
  process.exit(1);
});
