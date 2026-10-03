import { TimelineEditor } from "@/components/editor/TimelineEditor";

type EditorPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditorPage({ params }: EditorPageProps) {
  const { id } = await params;
  return <TimelineEditor projectId={id} />;
}
