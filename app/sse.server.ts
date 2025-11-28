import type { User } from "~/database/schema";

type Client = {
  connectionId: string;
  userId: number;
  rooms: Set<string>;
  send: (data: string) => void;
};

const clients: Map<string, Client> = new Map();

export function addClient(client: Client) {
  clients.set(client.connectionId, client);
}

export function removeClient(connectionId: string) {
  clients.delete(connectionId);
}

export function joinRoom(connectionId: string, room: string) {
  const client = clients.get(connectionId);
  if (client) {
    client.rooms.add(room);
  }
}

export function leaveRoom(connectionId: string, room: string) {
  const client = clients.get(connectionId);
  if (client) {
    client.rooms.delete(room);
  }
}

export function broadcast(
  user: Pick<User, "id" | "name">,
  room: string,
  event: string,
  payload: any,
) {
  const msg = `event: ${event}\ndata: ${JSON.stringify({
    user: {
      id: user.id,
      name: user.name,
    },
    payload,
  })}\n\n`;

  clients.forEach((client) => {
    if (client.rooms.has(room)) {
      client.send(msg);
    }
  });
}
