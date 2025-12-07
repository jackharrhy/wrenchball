import type { Conference } from "~/database/schema";

interface ConferencePinProps {
  conference: Conference | { id: number; name: string; color: string | null };
}

export function ConferencePin({ conference }: ConferencePinProps) {
  return (
    <span
      className="inline-flex w-2.5 h-2.5 rounded-full opacity-40"
      style={{ backgroundColor: conference.color ?? "#888" }}
      title={conference.name}
    />
  );
}
