"use client";

import BlobImageLink from "./BlobImageLink";

interface Props {
  sessionId: string;
}

/** Opens the session's pre-click screenshot full size in a new tab (click there to zoom). */
export default function SessionSnapshotLink({ sessionId }: Props) {
  return <BlobImageLink imagePath={`/sessions/${sessionId}/snapshot`} />;
}
