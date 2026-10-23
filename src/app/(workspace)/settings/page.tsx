import { Suspense } from "react";
import { SettingsView } from "@/features/settings/components/settings-view";

export default function SettingsPage() {
  // SettingsView reads ?google= after the OAuth redirect, which needs a Suspense boundary.
  return (
    <Suspense>
      <SettingsView />
    </Suspense>
  );
}
