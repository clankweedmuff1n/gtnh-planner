"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    umami?: {
      track?: (eventName: string, eventData?: Record<string, unknown>) => Promise<unknown>;
    };
  }
}

const HEARTBEAT_INTERVAL_MS = 15000;
const MIN_VISIBLE_MS = 3000;

export function AnalyticsHeartbeat() {
  useEffect(() => {
    let active = document.visibilityState === "visible" && document.hasFocus();
    let activeSince = Date.now();

    const isActive = () => document.visibilityState === "visible" && document.hasFocus();

    const sendHeartbeat = () => {
      if (!isActive()) {
        return;
      }

      window.umami?.track?.("heartbeat");
    };

    const sendFinalHeartbeat = () => {
      if (Date.now() - activeSince >= MIN_VISIBLE_MS) {
        window.umami?.track?.("heartbeat");
      }
    };

    const handleActive = () => {
      active = true;
      activeSince = Date.now();
    };

    const handleInactive = () => {
      if (active && !isActive()) {
        sendFinalHeartbeat();
        active = false;
      }
    };

    const handleVisibilityChange = () => {
      if (isActive()) {
        handleActive();
        return;
      }

      handleInactive();
    };

    const intervalId = window.setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
    window.addEventListener("focus", handleActive);
    window.addEventListener("blur", handleInactive);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", sendFinalHeartbeat);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleActive);
      window.removeEventListener("blur", handleInactive);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", sendFinalHeartbeat);
    };
  }, []);

  return null;
}
