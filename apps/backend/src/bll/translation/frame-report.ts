import type { FrameReport } from '../../types/chat.js';

/**
 * The reasons this repository writes. The type says nothing else can reach the port; a cast or an `any`
 * can, and the audit proved it with a payload that the line carried literally. The log is the last place
 * provider data could escape, so it checks anyway and downgrades anything it does not recognize.
 * Specs 014, 016 and 017.
 */
const KNOWN_REASONS: readonly string[] = ['not_an_object', 'parsed_not_an_object', 'unexpected_field_shape'];

/**
 * The dropped frames of one request, counted and classified instead of printed one by one: a provider
 * that sends garbage must not be able to flood the log, and the count plus the reasons are the facts
 * worth having. The line names the request, the stable code, the number of drops and the distinct
 * reasons, never a frame, because a frame is provider data. Specs 014, 016 and 017.
 */
export interface FrameDrops {
  /** Handed to the translator, so a dropped frame is counted where it is dropped. */
  readonly report: FrameReport;
  /** One line for the whole request, or null when nothing was dropped. */
  readonly line: (requestId: string) => string | null;
}

export function countFrameDrops(): FrameDrops {
  let count = 0;
  const reasons = new Set<string>();

  return {
    report: (_code, drop) => {
      count += 1;

      // Read once: a value whose reason answers differently on each read would pass the check and then
      // enter the set with whatever the second read returned. The audit of spec 017 proved it.
      const reason = drop?.reason;

      reasons.add(KNOWN_REASONS.includes(reason) ? reason : 'unrecognized');
    },
    line: (requestId) =>
      count === 0
        ? null
        : `route request=${requestId} outcome=frame_dropped drops=${count}` +
          ` reasons=${[...reasons].sort().join(',')}`,
  };
}