import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const spikeRowData = z.object({
  requestId: z.string(),
  status: z.enum(["pending", "done"]),
});

export const spikeDone = defineRpc({
  name: "spike.done",
  input: z.object({ requestId: z.string(), text: z.string() }),
  output: z.object({ ok: z.boolean() }),
});
