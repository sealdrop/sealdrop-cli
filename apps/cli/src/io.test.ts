import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { formatBytes, ProgressBar } from "./io.js";
import { stderr } from "node:process";

describe("formatBytes", () => {
  it("formats bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1023)).toBe("1023 B");
  });

  it("formats kibibytes", () => {
    expect(formatBytes(1024)).toBe("1.0 KiB");
    expect(formatBytes(1536)).toBe("1.5 KiB");
    expect(formatBytes(1048575)).toBe("1024.0 KiB");
  });

  it("formats mebibytes", () => {
    expect(formatBytes(1048576)).toBe("1.0 MiB");
    expect(formatBytes(1572864)).toBe("1.5 MiB");
    expect(formatBytes(1073741823)).toBe("1024.0 MiB");
  });

  it("formats gibibytes", () => {
    expect(formatBytes(1073741824)).toBe("1.00 GiB");
    expect(formatBytes(1610612736)).toBe("1.50 GiB");
  });
});

describe("ProgressBar", () => {
  let writes: string[];
  let originalIsTTY: boolean | undefined;
  let writeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    writes = [];
    originalIsTTY = stderr.isTTY;
    Object.defineProperty(stderr, "isTTY", { value: true, configurable: true });
    writeSpy = vi.spyOn(stderr, "write").mockImplementation((msg: string | Uint8Array) => {
      writes.push(typeof msg === "string" ? msg : new TextDecoder().decode(msg));
      return true;
    });
  });

  afterEach(() => {
    Object.defineProperty(stderr, "isTTY", { value: originalIsTTY, configurable: true });
    writeSpy.mockRestore();
  });

  it("does nothing when not a TTY", () => {
    Object.defineProperty(stderr, "isTTY", { value: false, configurable: true });
    const bar = new ProgressBar();
    bar.start(100, "Test");
    bar.update(50);
    bar.stop();
    expect(writes).toHaveLength(0);
  });

  it("does nothing when start is not called", () => {
    const bar = new ProgressBar();
    bar.update(50);
    bar.stop();
    expect(writes).toHaveLength(0);
  });

  it("renders start with 0%", () => {
    const bar = new ProgressBar();
    bar.start(1000, "Uploading");
    expect(writes.length).toBeGreaterThanOrEqual(1);
    const last = writes[writes.length - 1];
    expect(last).toContain("Uploading");
    expect(last).toContain("0%");
    expect(last).toContain("0 B / 1000 B");
  });

  it("renders update with progress", () => {
    const bar = new ProgressBar();
    bar.start(1000, "Uploading");
    writes.length = 0;
    bar.update(500);
    expect(writes.length).toBeGreaterThanOrEqual(1);
    const last = writes[writes.length - 1];
    expect(last).toContain("50%");
    expect(last).toContain("500 B / 1000 B");
  });

  it("renders stop with 100%", () => {
    const bar = new ProgressBar();
    bar.start(1000, "Uploading");
    writes.length = 0;
    bar.update(1000);
    writes.length = 0;
    bar.stop();
    expect(writes.some((w) => w.includes("100%"))).toBe(true);
    expect(writes.some((w) => w === "\n")).toBe(true);
  });

  it("throttles redraws to ~40ms", async () => {
    vi.useFakeTimers();
    const bar = new ProgressBar();
    bar.start(10000, "Uploading");

    writes.length = 0;
    bar.update(100);
    const afterFirst = writes.length;

    vi.advanceTimersByTime(20);
    bar.update(200);
    const afterSecond = writes.length;

    // Should not have redrawn within 40ms
    expect(afterSecond).toBe(afterFirst);

    vi.advanceTimersByTime(30);
    bar.update(300);
    const afterThird = writes.length;

    // Should have redrawn after 40ms
    expect(afterThird).toBeGreaterThan(afterSecond);

    bar.stop();
    vi.useRealTimers();
  });

  it("computes speed after 300ms of data", async () => {
    vi.useFakeTimers();
    const bar = new ProgressBar();
    bar.start(10000, "Uploading");

    vi.advanceTimersByTime(400);
    bar.update(1000);

    writes.length = 0;
    vi.advanceTimersByTime(400);
    bar.update(2000);

    const last = writes[writes.length - 1];
    expect(last).toContain("/s");

    bar.stop();
    vi.useRealTimers();
  });

  it("computes ETA before completion", async () => {
    vi.useFakeTimers();
    const bar = new ProgressBar();
    bar.start(10000, "Uploading");

    vi.advanceTimersByTime(400);
    bar.update(2000);

    writes.length = 0;
    vi.advanceTimersByTime(400);
    bar.update(4000);

    const last = writes[writes.length - 1];
    expect(last).toContain("ETA:");

    bar.stop();
    vi.useRealTimers();
  });

  it("shows no ETA at 100%", () => {
    const bar = new ProgressBar();
    bar.start(1000, "Uploading");
    bar.update(1000);

    const last = writes[writes.length - 1];
    expect(last).not.toContain("ETA:");
  });
});
