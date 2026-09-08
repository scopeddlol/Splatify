import type { PoolClient } from "pg";
import sharp from "sharp";
import { PublicError } from "./validation";
import { createSession } from "./auth";
import { hashToken, normalizeRecoveryCode, recoveryCodes } from "./security";

// Caller must hold the target user lock. Every credential-reset path uses it first.
export async function replaceCredentials(
  client: PoolClient,
  userId: string,
  passwordHash: string,
) {
  await client.query("UPDATE users SET password_hash=$2 WHERE id=$1", [
    userId,
    passwordHash,
  ]);
  await client.query("DELETE FROM sessions WHERE user_id=$1", [userId]);
  await client.query("DELETE FROM password_reset_links WHERE user_id=$1", [
    userId,
  ]);
  await client.query("DELETE FROM recovery_codes WHERE user_id=$1", [userId]);
  const codes = recoveryCodes();
  for (const code of codes)
    await client.query(
      "INSERT INTO recovery_codes(user_id,code_hash) VALUES($1,$2)",
      [userId, hashToken(normalizeRecoveryCode(code))],
    );
  return { raw: await createSession(client, userId), codes };
}

type ImagePurpose = "avatar" | "cover" | "invitation";
const MAX_BYTES = 4 * 1024 * 1024;

export async function processImage(
  file: File,
  purpose: ImagePurpose = "cover",
): Promise<{ data: Buffer; contentType: string }> {
  if (!file.size || file.size > MAX_BYTES)
    throw new PublicError("Choose an image no larger than 4 MB.");
  try {
    const image = sharp(Buffer.from(await file.arrayBuffer()), {
      limitInputPixels: 20_000_000,
      failOn: "warning",
    });
    const metadata = await image.metadata();
    if (
      !["jpeg", "png", "webp"].includes(metadata.format ?? "") ||
      (metadata.pages ?? 1) > 1
    )
      throw new PublicError("Choose a still JPEG, PNG, or WebP image.");
    const size = purpose === "avatar" ? 512 : 1600;
    const data = await image
      .rotate()
      .resize(size, size, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    if (data.length > MAX_BYTES)
      throw new PublicError(
        "The processed image is too large. Choose a smaller image.",
      );
    return { data, contentType: "image/webp" };
  } catch (error) {
    if (error instanceof PublicError) throw error;
    throw new PublicError(
      "Unable to read this image. Use a valid JPEG, PNG, or WebP under 20 million pixels.",
    );
  }
}

// The caller owns the transaction and authorization. Lock the entity so concurrent
// replacements cannot leave orphaned images; link the replacement before deletion.
export async function saveImage(
  client: PoolClient,
  userId: string,
  eventId: string | null,
  purpose: ImagePurpose,
  file: File,
): Promise<string> {
  if ((purpose === "avatar") !== (eventId === null))
    throw new PublicError("Invalid image destination.");
  const entity = await client.query(
    eventId
      ? "SELECT id FROM events WHERE id=$1 FOR UPDATE"
      : "SELECT id FROM users WHERE id=$1 FOR UPDATE",
    [eventId ?? userId],
  );
  if (!entity.rowCount) throw new PublicError("Image destination not found.");
  const { data, contentType } = await processImage(file, purpose);
  const {
    rows: [image],
  } = await client.query<{ id: string }>(
    "INSERT INTO media(owner_id,event_id,purpose,data,content_type) VALUES($1,$2,$3,$4,$5) RETURNING id",
    [userId, eventId, purpose, data, contentType],
  );
  if (eventId) {
    const column = purpose === "cover" ? "cover_id" : "invitation_cover_id";
    await client.query(`UPDATE events SET ${column}=$1 WHERE id=$2`, [
      image.id,
      eventId,
    ]);
    await client.query(
      "DELETE FROM media WHERE event_id=$1 AND purpose=$2 AND id<>$3",
      [eventId, purpose, image.id],
    );
  } else {
    await client.query("UPDATE users SET avatar_id=$1 WHERE id=$2", [
      image.id,
      userId,
    ]);
    await client.query(
      "DELETE FROM media WHERE owner_id=$1 AND event_id IS NULL AND purpose='avatar' AND id<>$2",
      [userId, image.id],
    );
  }
  return image.id;
}
