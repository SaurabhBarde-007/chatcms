import { Suspense } from "react";
import { TemplateEditor } from "@/components/templates/TemplateEditor";

export default function NewTemplatePage() {
  // The editor reads ?starter= / ?draft= / ?from= from the URL, which needs a Suspense boundary.
  return (
    <Suspense>
      <TemplateEditor />
    </Suspense>
  );
}
