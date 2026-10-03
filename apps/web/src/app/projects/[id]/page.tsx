import { ProjectDetail } from "@/components/projects/ProjectDetail";

type ProjectPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { id } = await params;
  return <ProjectDetail projectId={id} />;
}
