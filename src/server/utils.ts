import { randomUUID } from "crypto";

export function newId(): string {
  return randomUUID();
}
