import { readFile } from "node:fs/promises";
import { createInterface, emitKeypressEvents } from "node:readline";
import { stdin, stderr } from "node:process";

export async function readSecret(label: string, file?: string): Promise<string> {
  if (file) {
    if (file === "-") return readAllStdin();
    return (await readFile(file, "utf8")).replace(/[\r\n]+$/, "");
  }
  if (!stdin.isTTY) throw new Error(`${label} requires an interactive terminal or a secret file`);
  return hiddenPrompt(`${label}: `);
}

async function readAllStdin(): Promise<string> {
  let value = "";
  stdin.setEncoding("utf8");
  for await (const chunk of stdin) value += chunk;
  return value.replace(/[\r\n]+$/, "");
}

async function hiddenPrompt(prompt: string): Promise<string> {
  stderr.write(prompt);
  emitKeypressEvents(stdin);
  stdin.setRawMode(true);
  stdin.resume();
  let value = "";
  return new Promise((resolve, reject) => {
    const done = () => { stdin.setRawMode(false); stdin.pause(); stdin.off("keypress", onKey); stderr.write("\n"); };
    const onKey = (text: string, key: { name?: string; ctrl?: boolean }) => {
      if (key.ctrl && key.name === "c") { done(); reject(new Error("cancelled")); return; }
      if (key.name === "return" || key.name === "enter") { done(); resolve(value); return; }
      if (key.name === "backspace") { value = value.slice(0, -1); return; }
      if (text && !key.ctrl) value += text;
    };
    stdin.on("keypress", onKey);
  });
}

export function progress(message: string, json = false): void {
  if (!json) stderr.write(`${message}\n`);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KiB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MiB`;
  return `${(bytes / 1073741824).toFixed(2)} GiB`;
}

export class ProgressBar {
  private total = 0;
  private current = 0;
  private label = "";
  private startTime = 0;
  private lastDraw = 0;
  private speeds: number[] = [];
  private lastSpeedTime = 0;
  private lastSpeedBytes = 0;
  private active = false;

  start(total: number, label: string): void {
    this.total = total;
    this.current = 0;
    this.label = label;
    this.startTime = performance.now();
    this.lastDraw = 0;
    this.speeds = [];
    this.lastSpeedTime = this.startTime;
    this.lastSpeedBytes = 0;
    this.active = true;
    this.draw();
  }

  update(current: number): void {
    if (!this.active) return;
    this.current = current;
    const now = performance.now();
    const elapsed = now - this.lastSpeedTime;
    if (elapsed >= 300) {
      const bytesUploaded = current - this.lastSpeedBytes;
      this.speeds.push((bytesUploaded / elapsed) * 1000);
      if (this.speeds.length > 3) this.speeds.shift();
      this.lastSpeedBytes = current;
      this.lastSpeedTime = now;
    }
    if (now - this.lastDraw >= 40) {
      this.draw();
      this.lastDraw = now;
    }
  }

  stop(): void {
    if (!this.active) return;
    this.active = false;
    this.draw();
    if (stderr.isTTY) stderr.write("\n");
  }

  private draw(): void {
    if (!stderr.isTTY) return;
    const pct = this.total > 0 ? this.current / this.total : 0;
    const barWidth = 20;
    const filled = Math.round(pct * barWidth);
    const bar = "\u2588".repeat(filled) + "\u2591".repeat(barWidth - filled);
    const pctStr = `${(pct * 100).toFixed(0)}%`.padStart(4);
    const avgSpeed = this.speeds.length > 0 ? this.speeds.reduce((a, b) => a + b, 0) / this.speeds.length : 0;
    const speedStr = avgSpeed > 0 ? ` │ ${formatBytes(avgSpeed)}/s` : "";
    const eta = avgSpeed > 0 && this.current < this.total
      ? ` │ ETA: ${Math.ceil((this.total - this.current) / avgSpeed)}s`
      : "";
    const sizeStr = ` │ ${formatBytes(this.current)} / ${formatBytes(this.total)}`;
    const line = `${this.label} [${bar}] ${pctStr}${speedStr}${eta}${sizeStr}`;
    stderr.write(`\r\x1b[K${line}`);
  }
}
