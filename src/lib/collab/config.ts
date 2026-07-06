// Real-time collaboration is opt-in and only enabled when a Yjs websocket server URL
// is configured at build time. When unset, the collab UI stays hidden and the planner
// behaves exactly as the single-user local app.
export function getCollabServerUrl(): string | undefined {
  const url = process.env.NEXT_PUBLIC_COLLAB_WS_URL;
  return url && url.length > 0 ? url : undefined;
}

export const ROOM_QUERY_PARAM = "room";
