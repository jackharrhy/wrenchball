import { redirect } from "react-router";
import type { Route } from "./+types/admin._index";

export function loader({}: Route.LoaderArgs) {
  throw redirect("/admin/matches");
}

export default function AdminIndex() {
  return null;
}

