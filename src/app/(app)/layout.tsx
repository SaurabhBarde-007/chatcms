import { AppNav } from "@/components/ui/AppNav";

/** Every dashboard page: the navigation on the left, the page filling the rest of the screen. */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex h-dvh flex-col md:flex-row">
      <AppNav />
      <div className="min-h-0 min-w-0 flex-1">{children}</div>
    </div>
  );
}
