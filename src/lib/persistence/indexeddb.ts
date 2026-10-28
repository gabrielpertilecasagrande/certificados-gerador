import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { AssetRecord, ID, Project, ProjectSummary } from "@/lib/model/types";
import { migrateProject } from "@/lib/model/migrate";
import { summarize, type ProjectRepository } from "./repository";

interface CertDB extends DBSchema {
  projects: { key: string; value: Project };
  summaries: { key: string; value: ProjectSummary };
  assets: { key: string; value: AssetRecord; indexes: { byProject: string } };
}

const DB_NAME = "estudio-certificados";
const DB_VERSION = 1;

export class IndexedDbRepository implements ProjectRepository {
  private db: Promise<IDBPDatabase<CertDB>>;

  constructor(name = DB_NAME) {
    this.db = openDB<CertDB>(name, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore("projects", { keyPath: "id" });
        db.createObjectStore("summaries", { keyPath: "id" });
        const assets = db.createObjectStore("assets", { keyPath: "id" });
        assets.createIndex("byProject", "projectId");
      },
    });
  }

  async listProjects(): Promise<ProjectSummary[]> {
    const all = await (await this.db).getAll("summaries");
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async getProject(id: ID): Promise<Project | undefined> {
    const p = await (await this.db).get("projects", id);
    return p ? migrateProject(p) : undefined;
  }

  async saveProject(project: Project): Promise<void> {
    const db = await this.db;
    const tx = db.transaction(["projects", "summaries"], "readwrite");
    await Promise.all([tx.objectStore("projects").put(project), tx.objectStore("summaries").put(summarize(project)), tx.done]);
  }

  async deleteProject(id: ID): Promise<void> {
    const db = await this.db;
    const tx = db.transaction(["projects", "summaries", "assets"], "readwrite");
    const assetKeys = await tx.objectStore("assets").index("byProject").getAllKeys(id);
    await Promise.all([
      tx.objectStore("projects").delete(id),
      tx.objectStore("summaries").delete(id),
      ...assetKeys.map((k) => tx.objectStore("assets").delete(k)),
      tx.done,
    ]);
  }

  async putAsset(asset: AssetRecord): Promise<void> {
    await (await this.db).put("assets", asset);
  }

  async getAsset(id: ID): Promise<AssetRecord | undefined> {
    return (await this.db).get("assets", id);
  }

  async listAssets(projectId: ID): Promise<AssetRecord[]> {
    return (await this.db).getAllFromIndex("assets", "byProject", projectId);
  }

  async deleteAsset(id: ID): Promise<void> {
    await (await this.db).delete("assets", id);
  }
}

let instance: IndexedDbRepository | null = null;

export function getRepository(): ProjectRepository {
  if (typeof indexedDB === "undefined") throw new Error("IndexedDB indisponível neste ambiente");
  instance ??= new IndexedDbRepository();
  return instance;
}
