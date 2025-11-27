import { useEffect, useRef } from "react";

export function useStream(
  onMessage: (data: any) => void,
  eventType: string = "draft-update",
) {
  const onMessageRef = useRef(onMessage);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    const es = new EventSource("/stream");

    es.addEventListener("message", (e) => {
      if (e.data === '"connected"') {
        console.log("Stream connected");
      }
    });

    es.addEventListener("error", (e) => {
      console.log("Stream disconnected");
    });

    es.addEventListener(eventType, (e) => {
      onMessageRef.current(JSON.parse(e.data));
    });

    return () => {
      es.close();
    };
  }, [eventType]);
}
