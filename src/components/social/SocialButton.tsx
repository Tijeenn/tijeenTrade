"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { getSocial, useMarket } from "@/lib/store";
import { SocialPanel } from "./SocialPanel";

/** 𝕏 button in the header: unread badge + opens the feed panel. */
export function SocialButton() {
  useMarket(1000);
  const s = getSocial();
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(() => s.feed[0]?.id ?? 0);
  const newest = s.feed[0]?.id ?? 0;
  const unread = open ? 0 : s.feed.filter((t) => t.id > seen && t.author !== "you").length;

  const toggle = () => {
    setSeen(newest);
    setOpen(!open);
  };

  return (
    <>
      <button
        onClick={toggle}
        className={`relative flex h-8 w-8 items-center justify-center rounded-md border text-base font-bold ${
          open ? "border-brand bg-brand/20" : "border-line-2 bg-panel-2 hover:border-brand"
        }`}
        aria-label="Open feed"
        title="Feed"
      >
        𝕏
        {unread > 0 && (
          <span className="num absolute -right-1.5 -top-1.5 min-w-4 rounded-full bg-down px-1 text-[10px] leading-4 text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {/* Portal: the header's backdrop blur would otherwise trap this fixed panel inside it. */}
      {open && createPortal(<SocialPanel onClose={toggle} />, document.body)}
    </>
  );
}
