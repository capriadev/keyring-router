import type { FrameDropReason, FrameReport } from '../../types/chat.js';

/**
 * The dropped frames of one request, counted and classified instead of printed one by one: a provider
 * that sends garbage must not be able to flood the log, and the count plus the reasons are the facts
 * worth having. The line names the request, the stable code, the count and the distinct reasons, never
 * a frame, because a frame is provider data. Specs 014 and 016.
 */
export interface FrameDrops {
  /** Handed to the translator, so a dropped frame is counted where it is dropped. */
  readonly report: FrameReport;
  /** One line for the whole request, or null when nothing was dropped. */
  readonly line: (requestId: string) => string | null;
}

export function countFrameDrops(): FrameDrops {
  let count = 0;
  const reasons = new Set<FrameDropReason>();

  return {
    report: (_code, drop) => {
      count += 1;
      reasons.add(drop.reason);
    },
    line: (requestId) =>
      count === 0
        ? null
        : `route request=${requestId} outcome=frame_dropped frames=${count}` +
          ` reasons=${[...reasons].sort().join(',')}`,
  };
}