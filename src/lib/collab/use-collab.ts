"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ROOM_QUERY_PARAM, getCollabServerUrl } from "./config";
import {
  startCollabSession,
  type CollabPeer,
  type CollabSession,
  type CollabStatus,
} from "./session";
import { getLocalCollabUser } from "./user";

export interface UseCollabResult {
  /** Whether collaboration is configured at all (server URL present). */
  available: boolean;
  roomId: string | undefined;
  status: CollabStatus;
  peers: CollabPeer[];
  shareUrl: string | undefined;
  startSharing: () => void;
  stopSharing: () => void;
  setCursor: (cursor: { x: number; y: number } | undefined) => void;
}

export function useCollab(): UseCollabResult {
  const serverUrl = getCollabServerUrl();
  const [roomId, setRoomId] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<CollabStatus>("disconnected");
  const [peers, setPeers] = useState<CollabPeer[]>([]);
  const sessionRef = useRef<CollabSession | undefined>(undefined);

  // Adopt a room id from the URL on first mount so shared links auto-join. Reading
  // window.location is a client-only external source, so it must happen after mount to
  // avoid a hydration mismatch.
  useEffect(() => {
    const room = new URLSearchParams(window.location.search).get(ROOM_QUERY_PARAM);
    if (room) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from the URL
      setRoomId(room);
    }
  }, []);

  // Own the session lifecycle for the active room.
  useEffect(() => {
    if (!serverUrl || !roomId) {
      return;
    }

    const session = startCollabSession({ roomId, serverUrl, user: getLocalCollabUser() });
    sessionRef.current = session;
    const offStatus = session.onStatusChange(setStatus);
    const offPeers = session.onPeersChange(setPeers);

    return () => {
      offStatus();
      offPeers();
      session.destroy();
      sessionRef.current = undefined;
      setStatus("disconnected");
      setPeers([]);
    };
  }, [serverUrl, roomId]);

  const startSharing = useCallback(() => {
    setRoomId((current) => {
      const next = current ?? crypto.randomUUID().slice(0, 8);
      const url = new URL(window.location.href);
      url.searchParams.set(ROOM_QUERY_PARAM, next);
      window.history.replaceState(null, "", url.toString());
      return next;
    });
  }, []);

  const stopSharing = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete(ROOM_QUERY_PARAM);
    window.history.replaceState(null, "", url.toString());
    setRoomId(undefined);
  }, []);

  const setCursor = useCallback((cursor: { x: number; y: number } | undefined) => {
    sessionRef.current?.setLocalCursor(cursor);
  }, []);

  const shareUrl =
    roomId && typeof window !== "undefined"
      ? (() => {
          const url = new URL(window.location.href);
          url.searchParams.set(ROOM_QUERY_PARAM, roomId);
          return url.toString();
        })()
      : undefined;

  return {
    available: Boolean(serverUrl),
    roomId,
    status,
    peers,
    shareUrl,
    startSharing,
    stopSharing,
    setCursor,
  };
}
