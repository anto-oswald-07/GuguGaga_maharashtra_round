import { ComingSoon } from "@/components/ComingSoon";

type EditorPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditorPage({ params }: EditorPageProps) {
  const { id } = await params;

  return (
    <ComingSoon
      title={`Editor — Project ${id}`}
      description="Coming soon — timeline editor."
    />
  );
}
