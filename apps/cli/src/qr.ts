import QRCode from "qrcode";

export function terminalQr(text: string): string {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const size = qr.modules.size;
  const margin = 2;
  const paddedSize = size + margin * 2;
  const lines: string[] = [];

  function isDark(x: number, y: number): boolean {
    const row = y - margin;
    const column = x - margin;
    return row >= 0 && column >= 0 && row < size && column < size
      ? Boolean(qr.modules.get(row, column))
      : false;
  }

  // A terminal cell is roughly twice as tall as it is wide. One half-block
  // therefore represents two QR rows while keeping the symbol square.
  for (let y = 0; y < paddedSize; y += 2) {
    let line = "";
    for (let x = 0; x < paddedSize; x++) {
      const top = isDark(x, y);
      const bottom = isDark(x, y + 1);
      line += top ? (bottom ? "█" : "▀") : (bottom ? "▄" : " ");
    }
    // Black foreground modules on a white quiet-zone background, independent
    // of whether the user's terminal theme itself is light or dark.
    lines.push(`\u001b[30;107m${line}\u001b[0m`);
  }
  return lines.join("\n");
}
