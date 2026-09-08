import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { processImage } from "../src/lib/profile";

test("images are decoded, bounded and re-encoded without metadata or filename reliance", async () => {
  const source = await sharp({
    create: { width: 2000, height: 1000, channels: 3, background: "red" },
  })
    .jpeg()
    .withMetadata()
    .toBuffer();
  const file = new File([new Uint8Array(source)], "not-an-image.txt", {
    type: "text/plain",
  });
  const result = await processImage(file);
  const metadata = await sharp(result.data).metadata();
  assert.equal(result.contentType, "image/webp");
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, 1600);
  assert.equal(metadata.height, 800);
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.icc, undefined);
  const avatar = await sharp(
    (await processImage(file, "avatar")).data,
  ).metadata();
  assert.equal(avatar.width, 512);
  assert.equal(avatar.height, 256);
});

test("accepts still PNG and WebP without enlarging", async () => {
  for (const format of ["png", "webp"] as const) {
    const source = await sharp({
      create: { width: 20, height: 10, channels: 4, background: "transparent" },
    })
      .toFormat(format)
      .toBuffer();
    const image = await processImage(
      new File([new Uint8Array(source)], "image"),
    );
    assert.equal((await sharp(image.data).metadata()).width, 20);
  }
});

test("rejects empty, oversized, corrupt, SVG and GIF inputs", async () => {
  for (const bytes of [
    Buffer.alloc(0),
    Buffer.alloc(4 * 1024 * 1024 + 1),
    Buffer.from("invalid"),
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1"/></svg>',
    ),
    Buffer.from(
      "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
      "base64",
    ),
  ]) {
    await assert.rejects(
      processImage(
        new File([new Uint8Array(bytes)], "fake.png", { type: "image/png" }),
      ),
    );
  }
});

test("rejects images above 20 million decoded pixels", async () => {
  const bytes = await sharp({
    create: { width: 5000, height: 4001, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  assert.ok(bytes.length < 4 * 1024 * 1024);
  await assert.rejects(
    processImage(new File([new Uint8Array(bytes)], "large.png")),
  );
});
