import { Suspense } from "react";
import { TrackerScreen } from "@/components/tg/tracker-screen";

export default function TgTrackerPage() {
  return (
    <Suspense fallback={null}>
      <TrackerScreen />
    </Suspense>
  );
}
