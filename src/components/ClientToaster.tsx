"use client";

import { useMounted } from "@/lib/store";
import { Toaster } from "./Toaster";

export function ClientToaster() {
  return useMounted() ? <Toaster /> : null;
}
