import { existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { CopilotReply } from "@shared/contracts";
import type { LocalDatabase } from "./database";

type LlamaModule = {
  getLlama(): Promise<{ loadModel(input: { modelPath: string }): Promise<{ createContext(): Promise<{ getSequence(): unknown }> }> }>;
  LlamaChatSession: new (input: { contextSequence: unknown }) => { prompt(input: string): Promise<string> };
};

export class LocalCopilot {
  private modelAttempted = false;
  private session?: { prompt(input: string): Promise<string> };
  constructor(private readonly database: LocalDatabase, private readonly resourcesPath: string) {}

  async ask(prompt: string): Promise<CopilotReply> {
    const clean = prompt.trim();
    if (!clean) throw new Error("Write a question or command first.");
    this.database.db.prepare("INSERT INTO copilot_messages(id,role,content,created_at) VALUES(lower(hex(randomblob(16))),'user',?,datetime('now'))").run(clean);
    const result = await this.answer(clean);
    this.database.db.prepare("INSERT INTO copilot_messages(id,role,content,created_at) VALUES(lower(hex(randomblob(16))),'assistant',?,datetime('now'))").run(result.message);
    return result;
  }

  history() { return this.database.db.prepare("SELECT id, role, content, created_at AS createdAt FROM copilot_messages ORDER BY created_at DESC LIMIT 100").all() as Array<{ id: string; role: "user" | "assistant"; content: string; createdAt: string }>; }
  forget() { this.database.db.prepare("DELETE FROM copilot_messages").run(); }

  private async answer(prompt: string): Promise<CopilotReply> {
    const records = this.database.search(prompt).slice(0, 8);
    const citations = records.map((item) => `${item.kind}:${item.title}`);
    const action = this.previewAction(prompt);
    const generated = await this.tryBundledModel(prompt, records.map((item) => `${item.kind}: ${item.title} (${item.status})`).join("\n"));
    const message = generated ?? (records.length
      ? `I found ${records.length} local match${records.length === 1 ? "" : "es"}: ${records.map((item) => item.title).join(", ")}. I only used data stored on this computer.`
      : "I could not find a local record supporting that answer. I will not invent customer or financial information.");
    return { id: randomUUID(), message, mode: "offline", requiresApproval: action, citations };
  }

  private previewAction(prompt: string) {
    const normalized = prompt.toLowerCase();
    if (/(create|add|make)\s+(a\s+)?(customer|lead|task|invoice)/.test(normalized)) return { action: "Create a record", payload: { prompt } };
    if (/(delete|remove|change|update|move|send)/.test(normalized)) return { action: "Review a proposed change", payload: { prompt } };
    return undefined;
  }

  private async tryBundledModel(prompt: string, context: string) {
    if (!context || this.modelAttempted && !this.session) return undefined;
    try {
      if (!this.session) {
        this.modelAttempted = true;
        const modelPath = join(this.resourcesPath, "assets", "models", "tasko-qwen2.5-0.5b-q3_k_s.gguf");
        if (!existsSync(modelPath)) return undefined;
        const llama = await import("node-llama-cpp") as unknown as LlamaModule;
        const runtime = await llama.getLlama();
        const model = await runtime.loadModel({ modelPath });
        const contextWindow = await model.createContext();
        this.session = new llama.LlamaChatSession({ contextSequence: contextWindow.getSequence() });
      }
      return await this.session.prompt(`You are Tasko running locally. Use only this context. If absent, say you do not know. Never promise an action.\nContext:\n${context}\n\nQuestion: ${prompt}\nAnswer in two concise sentences.`);
    } catch { return undefined; }
  }
}
