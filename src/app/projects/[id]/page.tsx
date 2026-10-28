import { Suspense } from "react";
import { Spinner } from "@/components/ui/misc";
import { Workspace } from "@/features/workspace/workspace";
import { Providers } from "../../providers";

export default function ProjectPage() {
  return (
    <Providers>
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center text-muted">
            <Spinner className="size-6" />
          </div>
        }
      >
        <Workspace />
      </Suspense>
    </Providers>
  );
}
