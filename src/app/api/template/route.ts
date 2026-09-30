import * as XLSX from "xlsx";
import { buildTemplateWorkbook } from "@/lib/excel/template";

export function GET() {
  const buffer = XLSX.write(buildTemplateWorkbook(XLSX), { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="anime-matsuri-quiz-template.xlsx"',
      "Cache-Control": "public, max-age=3600",
    },
  });
}
