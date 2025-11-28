import { useEffect, useRef } from "react";
import { create } from "zustand";

type Callback = (data: any) => void;

interface StreamState {
  es: EventSource | null;
  currentRoom: string | null;
  subscribers: Map<string, Set<Callback>>;
}

interface StreamActions {
  connect: (room: string) => void;
  disconnect: () => void;
  subscribe: (eventType: string, callback: Callback) => () => void;
  _handleEvent: (eventType: string, data: any) => void;
}

type StreamStore = StreamState & StreamActions;

export const useStreamStore = create<StreamStore>((set, get) => ({
  es: null,
  currentRoom: null,
  subscribers: new Map(),

  connect: (room: string) => {
    const { es, currentRoom } = get();

    // Already connected to this room
    if (es && currentRoom === room) {
      return;
    }

    // Close existing connection if switching rooms
    if (es) {
      es.close();
    }

    const newEs = new EventSource(`/stream?room=${encodeURIComponent(room)}`);

    newEs.addEventListener("message", (e) => {
      if (e.data === '"connected"') {
        console.log(`Stream connected to room: ${room}`);
      }
    });

    newEs.addEventListener("error", () => {
      console.log("Stream disconnected");
    });

    // Set up listeners for all currently subscribed event types
    const { subscribers } = get();
    subscribers.forEach((_, eventType) => {
      newEs.addEventListener(eventType, (e) => {
        get()._handleEvent(eventType, JSON.parse(e.data));
      });
    });

    set({ es: newEs, currentRoom: room });
  },

  disconnect: () => {
    const { es } = get();
    if (es) {
      es.close();
      set({ es: null, currentRoom: null });
    }
  },

  subscribe: (eventType: string, callback: Callback) => {
    const { subscribers, es } = get();

    // Get or create the set of callbacks for this event type
    let callbacks = subscribers.get(eventType);
    if (!callbacks) {
      callbacks = new Set();
      subscribers.set(eventType, callbacks);

      // If we have an active connection, add listener for this new event type
      if (es) {
        es.addEventListener(eventType, (e) => {
          get()._handleEvent(eventType, JSON.parse(e.data));
        });
      }
    }

    callbacks.add(callback);
    set({ subscribers: new Map(subscribers) });

    // Return unsubscribe function
    return () => {
      const { subscribers } = get();
      const callbacks = subscribers.get(eventType);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          subscribers.delete(eventType);
        }
        set({ subscribers: new Map(subscribers) });
      }

      // Disconnect if no more subscribers
      const totalSubscribers = Array.from(get().subscribers.values()).reduce(
        (sum, set) => sum + set.size,
        0,
      );
      if (totalSubscribers === 0) {
        get().disconnect();
      }
    };
  },

  _handleEvent: (eventType: string, data: any) => {
    const { subscribers } = get();
    const callbacks = subscribers.get(eventType);
    if (callbacks) {
      callbacks.forEach((cb) => cb(data));
    }
  },
}));

export function useStream(
  onMessage: (data: any) => void,
  eventType: string = "draft-update",
  room: string = "global",
) {
  const onMessageRef = useRef(onMessage);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    const store = useStreamStore.getState();

    // Connect to the room (will reuse existing connection if same room)
    store.connect(room);

    // Subscribe to the event type with a stable callback wrapper
    const unsubscribe = store.subscribe(eventType, (data) => {
      onMessageRef.current(data);
    });

    return () => {
      unsubscribe();
    };
  }, [eventType, room]);
}
