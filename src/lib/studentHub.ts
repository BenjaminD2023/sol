import { makeAutoObservable, runInAction } from "mobx";
import { Linking } from "react-native";
import { v4 as uuid } from "uuid";
import { solNative } from "./SolNative";

export type HubTask = {
  id: string; title: string; details: string; course: string;
  dueDate?: string | null; includesDueTime: boolean; isCompleted: boolean; url: string;
};
export type HubCountdown = {
  id: string; title: string; date: string; nextOccurrence: string;
  daysRemaining: number; isArchived: boolean; repeatsYearly: boolean; url: string;
};
type Snapshot = {
  schemaVersion: number; generatedAt: string; bridgeToken: string;
  tasks: HubTask[]; countdowns: HubCountdown[];
  lastRequest?: { id: string; success: boolean; error?: string };
};
export function hubURL(route: string, values: Record<string, string>): string {
  return `studenthub://${route}?${Object.entries(values).map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join("&")}`;
}

class StudentHub {
  snapshot: Snapshot | null = null;
  error = "";
  pendingID = "";
  editing = false;
  private lastJSON = "";
  private timer: ReturnType<typeof setInterval> | undefined;
  private timeout: ReturnType<typeof setTimeout> | undefined;
  constructor() { makeAutoObservable(this, {}, { autoBind: true }); }
  get tasks() { return this.snapshot?.tasks ?? []; }
  get countdowns() { return this.snapshot?.countdowns.filter(item => !item.isArchived) ?? []; }
  refresh() {
    const path = `/Users/${solNative.userName()}/Library/Application Support/StudentHub/Integrations/sol.json`;
    try {
      if (!solNative.exists(path)) { this.snapshot = null; return; }
      const raw = solNative.readFile(path);
      if (!raw || raw === this.lastJSON) return;
      const data = JSON.parse(raw) as Snapshot;
      if (data.schemaVersion !== 1 || !Array.isArray(data.tasks) || !Array.isArray(data.countdowns)) throw new Error("Unsupported Student Hub snapshot");
      this.snapshot = data;
      this.lastJSON = raw;
      if (data.lastRequest?.id === this.pendingID) {
        this.error = data.lastRequest.success ? "" : data.lastRequest.error ?? "Student Hub could not save this change.";
        this.pendingID = "";
        if (this.timeout) clearTimeout(this.timeout);
      }
    } catch { this.error = "Could not read Student Hub. Open it and try Refresh."; }
  }
  async requestRefresh() {
    this.refresh();
    if (this.snapshot?.bridgeToken) {
      try { await solNative.openStudentHubURL(hubURL("sol-refresh", { token: this.snapshot.bridgeToken })); } catch { this.error = "Could not refresh Student Hub."; }
    } else {
      try { await solNative.openStudentHubURL("studenthub://tasks"); } catch { this.error = "Could not open Student Hub."; }
    }
  }
  start() { this.refresh(); if (!this.timer) this.timer = setInterval(this.refresh, 800); }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = undefined; if (this.timeout) clearTimeout(this.timeout); }
  async capture(text: string) {
    try { await Linking.openURL(hubURL("quick-command", { text })); }
    catch { this.error = "Could not open Student Hub."; }
  }
  async mutate(action: "create" | "update" | "complete" | "delete", task: HubTask | null, values: Record<string, string> = {}) {
    if (this.pendingID) return false;
    this.refresh();
    if (!this.snapshot?.bridgeToken) { this.error = "Open Student Hub to connect first."; return false; }
    const requestID = uuid();
    this.pendingID = requestID;
    this.error = "";
    this.timeout = setTimeout(() => runInAction(() => {
      if (this.pendingID === requestID) { this.pendingID = ""; this.error = "Student Hub has not confirmed the change. Refresh before trying again."; }
    }), 15000);
    try {
      await solNative.openStudentHubURL(hubURL("sol-task", { action, ...(task ? { id: task.id } : {}), requestID, token: this.snapshot.bridgeToken, ...values }));
      return true;
    } catch {
      runInAction(() => { this.pendingID = ""; this.error = "Could not send the change to Student Hub."; });
      return false;
    }
  }
}
export const studentHub = new StudentHub();
