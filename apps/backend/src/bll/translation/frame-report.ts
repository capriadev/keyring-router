import type { FrameReport } from '../../types/chat.js';

/**
 * The dropped frames of one request, counted instead of printed one by one: a provider that sends
 * garbage must not be able to flood the log, and the count is the fact worth having. The line names the
 * request and the stable code, never a frame, because a frame is provider data. Spec 014.
 */
export interface FrameDrops {
  /** Handed to the translator, so a dropped frame is counted where it is dropped. */
  readonly report: FrameReport;
  /** One line for the whole request, or null when nothing was dropped. */
  readonly line: (requestId: string) => string | null;
}

export function countFrameDrops(): FrameDrops {
  let count = 0;

  return {
    report: () => {
      count += 1;
    },
    line: (requestId) => (count === 0 ? null : `route request=${requestId} outcome=frame_dropped frames=${count}`),
  };
}