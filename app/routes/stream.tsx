import { requireUser } from "~/auth.server";
import type { Route } from "./+types/stream";
import { addClient, removeClient } from "~/sse.server";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);

  // Generate unique connection ID for this specific connection
  const connectionId = `${user.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  // Parse room from query param
  const url = new URL(request.url);
  const room = url.searchParams.get("room") || "global";

  let interval: NodeJS.Timeout | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (msg: string) => {
        try {
          controller.enqueue(new TextEncoder().encode(msg));
        } catch (error) {
          // Client disconnected, will be cleaned up in cancel handler
        }
      };

      addClient({
        connectionId,
        userId: user.id,
        rooms: new Set([room]),
        send,
      });

      send(`data: "connected"\n\n`);

      interval = setInterval(() => send(`: keepalive\n\n`), 15000);

      const cleanup = () => {
        if (interval) {
          clearInterval(interval);
          interval = null;
        }
        removeClient(connectionId);
      };

      if (request.signal) {
        request.signal.addEventListener("abort", cleanup);
      }
    },
    cancel() {
      // Cleanup when stream is cancelled
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
      removeClient(connectionId);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
