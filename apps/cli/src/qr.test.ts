import { describe, expect, it } from "vitest";
import QRCode from "qrcode";
import { terminalQr } from "./qr.js";

describe("terminalQr", () => {
  it("renders at one column and half a row per padded QR module", () => {
    const value = "https://sealdrop.io/s/example#key=" + "A".repeat(80);
    const moduleCount = QRCode.create(value, { errorCorrectionLevel: "M" }).modules.size + 4;
    const lines = terminalQr(value).split("\n");
    const visible = lines.map((line) => line.replace(/\u001b\[[0-9;]*m/g, ""));

    expect(lines).toHaveLength(Math.ceil(moduleCount / 2));
    expect(visible.every((line) => [...line].length === moduleCount)).toBe(true);
    expect(lines.every((line) => line.endsWith("\u001b[0m"))).toBe(true);
  });
});
