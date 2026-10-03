import { ComingSoon } from "@/components/ComingSoon";

type ProjectPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { id } = await params;

  return (
    <ComingSoon
      title={`Project ${id}`}
      description="Coming soon — project hub."
    />
  );
}
