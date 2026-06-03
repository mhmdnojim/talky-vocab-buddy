// Client-side file parser. Returns plain text content from xlsx/pdf/docx/txt/csv.

export async function parseFileToText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const ext = name.split(".").pop() ?? "";

  if (["txt", "csv", "md"].includes(ext)) {
    return await file.text();
  }

  if (ext === "xlsx" || ext === "xls") {
    const XLSX = await import("xlsx");
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const lines: string[] = [];
    for (const name of wb.SheetNames) {
      const sheet = wb.Sheets[name];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
      for (const row of rows) {
        if (Array.isArray(row)) {
          lines.push(row.map((c) => (c == null ? "" : String(c))).join(" | "));
        }
      }
    }
    return lines.join("\n");
  }

  if (ext === "docx" || ext === "doc") {
    const mammoth = await import("mammoth");
    const buf = await file.arrayBuffer();
    const { value } = await mammoth.extractRawText({ arrayBuffer: buf });
    return value;
  }

  if (ext === "pdf") {
    const pdfjs = await import("pdfjs-dist");
    // Use the bundled worker
    const workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
    const buf = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: buf }).promise;
    const out: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      out.push(content.items.map((it: any) => ("str" in it ? it.str : "")).join(" "));
    }
    return out.join("\n");
  }

  // Fallback: try as text
  return await file.text();
}
