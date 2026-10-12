import { Suspense } from "react";
import { TemplateEditor } from "@/components/templates/TemplateEditor";

export default async function EditTemplatePage({ params }: PageProps<"/templates/[id]">) {
  const { id } = await params;
  return (
    <Suspense>
      <TemplateEditor id={id} />
    </Suspense>
  );
}
