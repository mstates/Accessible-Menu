// A fuse on the address route, per owner (the Build plan's Places note): so
// many route requests a day, counted in memory by owner and UTC day. It is
// per server instance and starts over on a cold start, so it stops a loop
// in a browser from spending the key and nothing more; Google's own
// per-day caps are the quota (Q-111). Pure: no React, no network.

export const ADDRESS_LOOKUPS_PER_DAY = 200;

export type LookupCounts = Map<string, { day: string; count: number }>;

export function allowLookup(
  counts: LookupCounts,
  ownerId: string,
  now: Date,
): boolean {
  const day = now.toISOString().slice(0, 10);
  const held = counts.get(ownerId);
  const count = held && held.day === day ? held.count : 0;
  if (count >= ADDRESS_LOOKUPS_PER_DAY) return false;
  counts.set(ownerId, { day, count: count + 1 });
  return true;
}
