import { Suspense } from "react";
import { TemplatesScreen } from "@/components/templates/TemplatesScreen";

export default function TemplatesPage() {
  return (
    <Suspense>
      <TemplatesScreen />
    </Suspense>
  );
}
