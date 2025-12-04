/**
 * Format a date as a human-readable relative time string.
 * e.g., "just now", "5 minutes ago", "2 hours ago", "3 days ago", "1 week ago"
 */
export function formatTimeAgo(date: Date): string {
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (seconds < 3600) {
    return minutes === 1 ? "1 minute ago" : `${minutes} minutes ago`;
  }

  const hours = Math.floor(seconds / 3600);
  if (seconds < 86400) {
    return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  }

  const days = Math.floor(seconds / 86400);
  if (seconds < 604800) {
    return days === 1 ? "1 day ago" : `${days} days ago`;
  }

  const weeks = Math.floor(seconds / 604800);
  if (seconds < 2592000) {
    return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
  }

  return date.toLocaleDateString();
}
