import type { User } from "~/database/schema";

type Client = {
  id: string;
  send: (data: string) => void;
};

let clients: Client[] = [];

export function addClient(client: Client) {
  clients.push(client);
}

export function removeClient(id: string) {
  clients = clients.filter((c) => c.id !== id);
}

export function broadcast(
  user: Pick<User, "id" | "name">,
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
  clients.forEach((c) => c.send(msg));
}
