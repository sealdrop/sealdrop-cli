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
