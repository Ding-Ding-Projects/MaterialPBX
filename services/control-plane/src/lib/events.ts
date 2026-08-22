import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import type { RuntimeEvent } from "@materialpbx/protocol";

export class RuntimeEventBus {
  readonly emitter = new EventEmitter({ captureRejections: true });
  #sequence = 0;

  publish(event: Omit<RuntimeEvent, "id" | "sequence" | "occurredAt">): RuntimeEvent {
    const complete: RuntimeEvent = {
      ...event,
      id: randomUUID(),
      sequence: ++this.#sequence,
      occurredAt: new Date().toISOString()
    };
    this.emitter.emit("event", complete);
    return complete;
  }
}
