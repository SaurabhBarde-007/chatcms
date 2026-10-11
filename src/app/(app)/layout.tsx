import { AppNav } from "@/components/ui/AppNav";

/** Every dashboard page: the nav bar on top, the page filling the rest of the screen. */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex h-dvh flex-col">
      <AppNav />
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
