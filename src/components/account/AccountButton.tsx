"use client";

import { useState } from "react";
import { logout, useUsername } from "@/lib/account";
import { LoginDialog } from "./LoginDialog";

export function AccountButton() {
  const username = useUsername();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);

  if (!username) {
    return (
      <>
        <button
          onClick={() => setOpen(true)}
          className="rounded-md bg-brand px-2.5 py-1.5 text-sm font-semibold text-white sm:px-3"
        >
          Log in
        </button>
        {open && <LoginDialog onClose={() => setOpen(false)} />}
      </>
    );
  }
  return (
    <div className="relative">
      <button
        onClick={() => setMenu(!menu)}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/25 text-sm font-bold text-brand sm:h-auto sm:w-auto sm:rounded-md sm:px-3 sm:py-1.5"
        title={username}
      >
        <span className="sm:hidden">{username[0].toUpperCase()}</span>
        <span className="hidden max-w-28 truncate sm:inline">{username}</span>
      </button>
      {menu && (
        <div className="absolute right-0 top-10 z-40 w-44 rounded-md border border-line-2 bg-panel-2 p-1 text-sm shadow-xl">
          <div className="truncate px-3 py-2 text-xs text-dim">Signed in as {username}</div>
          <button
            onClick={() => { logout(); setMenu(false); }}
            className="w-full rounded px-3 py-2 text-left hover:bg-line-2"
          >
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
