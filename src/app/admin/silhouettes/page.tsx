import type { Metadata } from "next";
import { SilhouetteStudio } from "@/components/admin/silhouette-studio";

export const metadata: Metadata = { title: "Silhouette generator" };

export default function SilhouettesPage() {
  return <SilhouetteStudio />;
}
