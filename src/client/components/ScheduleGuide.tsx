import { useState, useEffect, useRef } from "react";
import type { Channel, ScheduleSlot } from "../../shared/types";
import { c } from "../theme";
import { formatTime, formatDuration, formatDateHeader } from "../format";
import { getSchedule, getSchedulePreview } from "../api";

function ScheduleSkeleton({ compact }: { compact?: boolean }) {
  const rowH = compact ? 28 : 36;
  const rows = compact ? 5 : 7;
  return (
    <div className="vt-fadein" style={{ padding: "8px 0", display: "flex", flexDirection: "column", gap: 6 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{
          display: "flex", gap: compact ? 8 : 12, alignItems: "center",
          paddingLeft: 8, opacity: 0.6 - i * 0.04,
        }}>
          <div className="vt-skeleton-bar" style={{ width: compact ? 48 : 64, height: rowH, border: `2px solid ${c.border}20` }} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
            <div className="vt-skeleton-bar" style={{ height: 10, width: `${60 + (i * 7) % 35}%` }} />
            <div className="vt-skeleton-bar" style={{ height: 8, width: "40%", opacity: 0.7 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ScheduleGuide({ channelId, maxSlots, compact, previewChannel }: {
  channelId: string;
  maxSlots?: number;
  compact?: boolean;
  previewChannel?: Channel;
}) {
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const nowRef = useRef<HTMLDivElement>(null);
  const scrolledRef = useRef(false);

  // Serialize previewChannel deterministically so the effect re-runs only when
  // the relevant fields change (not on every parent re-render that builds a
  // fresh object literal).
  const previewKey = previewChannel
    ? JSON.stringify({
        f: previewChannel.filters,
        s: previewChannel.shuffleMode,
        i: previewChannel.id,
      })
    : null;

  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();
    scrolledRef.current = false;
    setLoading(true);

    const load = async () => {
      try {
        const data = previewChannel
          ? await getSchedulePreview(previewChannel, ac.signal)
          : await getSchedule(channelId, ac.signal);
        if (cancelled) return;
        setSlots(data.slots || []);
        setLoading(false);
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") return;
        if (!cancelled) setLoading(false);
      }
    };

    // Debounce in preview mode so rapid genre toggles don't spam Jellyfin.
    let kickoff: ReturnType<typeof setTimeout> | null = null;
    if (previewChannel) {
      kickoff = setTimeout(load, 400);
    } else {
      load();
    }
    const pollId = previewChannel ? null : setInterval(load, 60_000);
    return () => {
      cancelled = true;
      ac.abort();
      if (kickoff) clearTimeout(kickoff);
      if (pollId) clearInterval(pollId);
    };
  }, [channelId, previewKey]);

  // Refresh the "now" marker every 15s so the NOW highlight tracks wall-clock time
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  // Auto-scroll to "now playing" within the schedule's scroll container (not the page).
  // Only scroll once per channel load — subsequent poll refreshes must not re-scroll.
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (loading || scrolledRef.current || !nowRef.current) return;
    const item = nowRef.current;
    const container = scrollContainerRef.current;
    if (container) {
      const scroller = container.scrollHeight > container.clientHeight
        ? container
        : container.closest<HTMLElement>("[data-scroll-container]") || container.parentElement;
      if (scroller) {
        const itemRect = item.getBoundingClientRect();
        const scrollerRect = scroller.getBoundingClientRect();
        scroller.scrollTop += itemRect.top - scrollerRect.top;
        scrolledRef.current = true;
      }
    }
  }, [loading, slots]);

  if (loading) {
    return <ScheduleSkeleton compact={compact} />;
  }

  if (slots.length === 0) {
    return <div style={{ color: c.textDim, fontSize: 13, fontWeight: 700, padding: 16 }}>No content scheduled</div>;
  }

  const displaySlots = maxSlots ? slots.slice(0, maxSlots) : slots;
  const imgSize = compact ? { w: 48, h: 28 } : { w: 64, h: 36 };

  // Group by date
  const groups: { date: string; slots: ScheduleSlot[] }[] = [];
  for (const slot of displaySlots) {
    const dateKey = new Date(slot.startTime).toDateString();
    const last = groups[groups.length - 1];
    if (last && last.date === dateKey) {
      last.slots.push(slot);
    } else {
      groups.push({ date: dateKey, slots: [slot] });
    }
  }

  return (
    <div ref={scrollContainerRef} className="vt-fadein" style={{ display: "flex", flexDirection: "column", gap: 0, maxHeight: compact ? undefined : 600, overflowY: compact ? undefined : "auto", position: "relative" }}>
      {groups.map((group) => (
        <div key={group.date}>
          <div style={{
            fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.15em",
            color: c.yellow, padding: "10px 0 6px", borderBottom: `1px solid ${c.border}20`,
          }}>
            {formatDateHeader(group.slots[0].startTime)}
          </div>
          {group.slots.map((slot, i) => {
            const isCurrent = now >= new Date(slot.startTime).getTime() && now < new Date(slot.endTime).getTime();
            const isPast = new Date(slot.endTime).getTime() < now;
            return (
              <div
                key={`${slot.itemId}-${i}`}
                ref={isCurrent ? nowRef : undefined}
                style={{
                  display: "flex", gap: compact ? 8 : 12, padding: compact ? "6px 0" : "8px 0",
                  borderBottom: `1px solid ${c.border}10`,
                  opacity: isPast ? 0.35 : 1,
                  background: isCurrent ? `${c.accent}08` : "transparent",
                  borderLeft: isCurrent ? `3px solid ${c.accent}` : "3px solid transparent",
                  paddingLeft: 8,
                  transition: "opacity 0.2s",
                }}
              >
                {slot.imageUrl && (
                  <img
                    src={slot.imageUrl}
                    alt=""
                    style={{
                      width: imgSize.w, height: imgSize.h, objectFit: "cover",
                      border: `2px solid ${isCurrent ? c.accent : c.border}40`, flexShrink: 0,
                    }}
                  />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {isCurrent && (
                      <span style={{
                        background: c.accent, color: c.black, fontSize: 9, fontWeight: 800,
                        padding: "1px 5px", textTransform: "uppercase", flexShrink: 0,
                      }}>NOW</span>
                    )}
                    <span style={{
                      fontSize: compact ? 12 : 13, fontWeight: 700,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{slot.title}</span>
                  </div>
                  <div style={{ fontSize: compact ? 10 : 11, color: c.textDim, fontWeight: 700, marginTop: 2 }}>
                    {formatTime(slot.startTime)} - {formatTime(slot.endTime)} · {formatDuration(slot.durationTicks)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
