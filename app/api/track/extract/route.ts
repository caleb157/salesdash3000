import { NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";
import { extractFromDocument } from "@/lib/containers/numbers";

// POST multipart { file } (PDF or text) -> the container / B/L numbers found in it. Spends no tracking requests.
// Vercel caps request bodies at ~4.5 MB, which comfortably fits bills of lading and invoices.
const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(req: Request) {
  let file: File | null = null;
  try {
    const f = (await req.formData()).get("file");
    file = f instanceof File ? f : null;
  } catch {
    /* not multipart */
  }
  if (!file) return NextResponse.json({ ok: false, error: "No file received." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ ok: false, error: `${file.name} is over 4 MB.` }, { status: 413 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name) || String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
  let text: string;
  try {
    if (isPdf) {
      const pdf = await getDocumentProxy(bytes);
      text = (await extractText(pdf, { mergePages: true })).text;
    } else {
      text = new TextDecoder().decode(bytes);
    }
  } catch {
    return NextResponse.json({ ok: false, error: `Couldn't read ${file.name} — is it a valid PDF?` });
  }

  if (isPdf && text.replace(/\s+/g, "").length < 20) {
    return NextResponse.json({
      ok: false,
      error: `${file.name} has no selectable text (it's probably a scan or photo). Type the container number in instead.`,
    });
  }
  const { parsed, hint } = extractFromDocument(text);
  return NextResponse.json({ ok: true, found: parsed, hint: hint ?? null });
}
