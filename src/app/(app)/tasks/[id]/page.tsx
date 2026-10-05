"use client";

import { useParams, useRouter } from "next/navigation";
import { PageContainer } from "@/components/shell/app-client";
import { TaskDetail } from "@/components/tasks/task-detail";

export default function TaskPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  return (
    <PageContainer className="max-w-3xl">
      <div className="overflow-hidden rounded-2xl border bg-popover shadow-elev-2">
        <TaskDetail taskId={id} fullPage onClose={() => (window.history.length > 1 ? router.back() : router.push("/"))} />
      </div>
    </PageContainer>
  );
}
