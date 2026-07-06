"use client";

import { Check, Link2, LogOut, Users } from "lucide-react";
import { useState } from "react";
import { useCollab } from "@/lib/collab/use-collab";
import type { CollabPeer } from "@/lib/collab/session";

export function CollabControls() {
  const { available, roomId, status, peers, shareUrl, startSharing, stopSharing } = useCollab();
  const [copied, setCopied] = useState(false);

  if (!available) {
    return null;
  }

  if (!roomId) {
    return (
      <button
        type="button"
        onClick={startSharing}
        title="Start a shared session and invite a friend"
        aria-label="Start a shared session"
        className="inline-flex h-9 items-center justify-center gap-1.5 rounded border border-emerald-700 bg-emerald-600 px-2.5 text-sm text-white hover:bg-emerald-500"
      >
        <Users className="h-4 w-4" />
        <span>Share</span>
      </button>
    );
  }

  const copyLink = async () => {
    if (!shareUrl) {
      return;
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked; the URL still carries the room so a manual copy works.
    }
  };

  const otherPeers = peers.filter((peer) => !peer.isSelf);

  return (
    <div className="inline-flex h-9 items-center gap-2 rounded border border-neutral-300 bg-white px-2">
      <StatusDot status={status} />
      <PeerAvatars peers={peers} />
      {otherPeers.length === 0 ? (
        <span className="text-xs text-neutral-500">Waiting for others…</span>
      ) : null}
      <button
        type="button"
        onClick={() => void copyLink()}
        title="Copy invite link"
        aria-label="Copy invite link"
        className="inline-flex h-7 items-center gap-1 rounded border border-neutral-300 bg-white px-1.5 text-xs text-neutral-800 hover:bg-neutral-50"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Link2 className="h-3.5 w-3.5" />}
        <span>{copied ? "Copied" : "Invite"}</span>
      </button>
      <button
        type="button"
        onClick={stopSharing}
        title="Leave the shared session"
        aria-label="Leave the shared session"
        className="inline-flex h-7 w-7 items-center justify-center rounded border border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-50"
      >
        <LogOut className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function StatusDot({ status }: { status: "connecting" | "connected" | "disconnected" }) {
  const color =
    status === "connected"
      ? "bg-emerald-500"
      : status === "connecting"
        ? "bg-amber-500"
        : "bg-neutral-400";
  return (
    <span
      title={status}
      aria-label={`Connection: ${status}`}
      className={`h-2.5 w-2.5 shrink-0 rounded-full ${color}`}
    />
  );
}

function PeerAvatars({ peers }: { peers: CollabPeer[] }) {
  return (
    <div className="flex -space-x-1.5">
      {peers.map((peer) => (
        <span
          key={peer.clientId}
          title={peer.isSelf ? `${peer.name} (you)` : peer.name}
          style={{ backgroundColor: peer.color }}
          className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white text-[10px] font-bold uppercase text-white shadow"
        >
          {peer.name.slice(0, 2)}
        </span>
      ))}
    </div>
  );
}
