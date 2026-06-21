export const SEND_EXPIRY_PRESETS = ["open-once", "1h", "today", "3d", "7d"] as const;
export type SendExpiryPreset = (typeof SEND_EXPIRY_PRESETS)[number];

export const RECEIVE_EXPIRY_PRESETS = ["one-file", "1h", "today", "3-files", "7d"] as const;
export type ReceiveExpiryPreset = (typeof RECEIVE_EXPIRY_PRESETS)[number];

export const DEFAULT_SEND_EXPIRY: SendExpiryPreset = "open-once";
export const DEFAULT_RECEIVE_EXPIRY: ReceiveExpiryPreset = "one-file";

export interface SendExpiryConfig {
  preset: SendExpiryPreset;
  label: string;
  expiresAt: Date;
  remainingDownloads: number;
}

export interface ReceiveExpiryConfig {
  preset: ReceiveExpiryPreset;
  label: string;
  expiresAt: Date;
  maxFiles: number;
}

export function resolveSendExpiry(preset: SendExpiryPreset, now = new Date()): SendExpiryConfig {
  switch (preset) {
    case "open-once":
      return {
        preset,
        label: "Open once",
        expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        remainingDownloads: 1,
      };
    case "1h":
      return {
        preset,
        label: "1 hour",
        expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
        remainingDownloads: -1,
      };
    case "today": {
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      return { preset, label: "Today", expiresAt: end, remainingDownloads: -1 };
    }
    case "3d":
      return {
        preset,
        label: "3 days",
        expiresAt: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000),
        remainingDownloads: -1,
      };
    case "7d":
      return {
        preset,
        label: "7 days",
        expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        remainingDownloads: -1,
      };
  }
}

export function resolveReceiveExpiry(preset: ReceiveExpiryPreset, now = new Date()): ReceiveExpiryConfig {
  switch (preset) {
    case "one-file": {
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      return { preset, label: "Accept one file, expires today", expiresAt: end, maxFiles: 1 };
    }
    case "1h":
      return {
        preset,
        label: "Accept files for 1 hour",
        expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
        maxFiles: 999,
      };
    case "today": {
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      return { preset, label: "Accept files until today", expiresAt: end, maxFiles: 999 };
    }
    case "3-files": {
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      return { preset, label: "Accept up to 3 files", expiresAt: end, maxFiles: 3 };
    }
    case "7d":
      return {
        preset,
        label: "Accept files for 7 days",
        expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        maxFiles: 999,
      };
  }
}
