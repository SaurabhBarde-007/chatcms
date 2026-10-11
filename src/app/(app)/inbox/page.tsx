import { Suspense } from "react";
import { Inbox } from "@/components/inbox/Inbox";

export default function InboxPage() {
  // Inbox reads ?c= from the URL, which needs a Suspense boundary.
  return (
    <Suspense>
      <Inbox />
    </Suspense>
  );
}
