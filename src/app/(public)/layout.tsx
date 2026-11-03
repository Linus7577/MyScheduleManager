import { RuneMark } from "@/components/shell/rune-mark";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-4">
      <RuneMark className="size-20" />
      <div className="flex w-full max-w-sm flex-col items-center gap-4 text-center">{children}</div>
    </main>
  );
}
