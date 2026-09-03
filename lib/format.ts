// Absolute dates are ambiguous right after something happens — a UTC
// timestamp from moments ago can display as "yesterday" once converted to
// a browser far enough behind UTC. Show relative time for anything recent
// so "did this just work?" has an obvious answer; fall back to a plain
// date for anything old enough that the day boundary doesn't matter.
export function formatWhen(iso: string): string {
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) return "Just now";
  if (diffMs < hour) {
    const m = Math.floor(diffMs / minute);
    return `${m} min${m === 1 ? "" : "s"} ago`;
  }
  if (diffMs < day) {
    const h = Math.floor(diffMs / hour);
    return `${h} hr${h === 1 ? "" : "s"} ago`;
  }
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
