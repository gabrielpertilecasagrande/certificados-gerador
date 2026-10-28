import type { ID, Project } from "@/lib/model/types";

export interface WorkerStart {
  type: "start";
  project: Project;
  participantIds: ID[];
  mode: "individual" | "merged";
  fonts: Record<string, Uint8Array>;
  assets: Record<string, { bytes: Uint8Array; mime: string }>;
  title: string;
}

export type WorkerMessage =
  | { type: "item"; id: ID; bytes: Uint8Array }
  | { type: "error"; id: ID; message: string }
  | { type: "progress"; done: number }
  | { type: "merged"; bytes: Uint8Array }
  | { type: "fatal"; message: string }
  | { type: "done" };
