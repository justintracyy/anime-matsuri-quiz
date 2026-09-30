import { redirect } from "next/navigation";

/** The importer lives inside the editor so imported rows become unsaved, editable changes. */
export default async function ImportRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/admin/quizzes/${id}?import=1`);
}
