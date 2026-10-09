"use client";

import { Suspense } from "react";
import CallScreen from "@/components/CallScreen";

export default function Page() {
  return (
    <Suspense fallback={<div className="boot">Loading…</div>}>
      <CallScreen />
    </Suspense>
  );
}
