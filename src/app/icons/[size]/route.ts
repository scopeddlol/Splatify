import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ size: string }> },
) {
  const size = Number((await params).size);
  if (![180, 192, 512].includes(size))
    return new Response(null, { status: 404 });
  const source = await readFile(join(process.cwd(), "public", "mark.svg"));
  const png = await sharp(source).resize(size, size).png().toBuffer();
  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
