import { apiFetch } from "./client";
import type { Pathway, PathwayCreate } from "../types/pathway";

export function fetchPathways() {
  return apiFetch<Pathway[]>("/pathways");
}

export function createPathway(body: PathwayCreate) {
  return apiFetch<Pathway>("/pathways", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function deletePathway(id: string) {
  return apiFetch<void>(`/pathways/${id}`, { method: "DELETE" });
}
