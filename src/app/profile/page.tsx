import { requireUser } from "@/lib/data";
import { Notice, Shell } from "@/components/shell";
import { Submit } from "@/components/ui";
import { ImageUpload } from "@/components/image-upload";
import { saveProfileAction } from "./actions";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser("/profile");
  return (
    <Shell user={user} active="profile">
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR PLAYER CARD</span>
          <h1>Your profile</h1>
          <p>A familiar face for your next game day.</p>
        </div>
      </div>
      <Notice params={await searchParams} />
      <form action={saveProfileAction} className="panel form-stack">
        <div className="profile-grid">
          <ImageUpload
            name="avatar"
            label="Avatar"
            mediaId={user.avatarId}
            removeName="removeAvatar"
            avatar
          />
          <div className="form-stack">
            <label>
              Display name
              <input
                name="displayName"
                defaultValue={user.name}
                maxLength={80}
                required
                disabled={user.isAdmin}
              />
            </label>
            {user.isAdmin && (
              <>
                <input type="hidden" name="displayName" value={user.name} />
                <small>
                  Your administrator display name is managed by the server
                  configuration.
                </small>
              </>
            )}
            <label>
              Real name (private)
              <input
                name="realName"
                defaultValue={user.realName}
                maxLength={120}
                autoComplete="name"
              />
            </label>
            <small>
              Your real name stays private. It is not shown on RSVP lists or
              player cards.
            </small>
            <label>
              Bio
              <textarea
                name="bio"
                defaultValue={user.bio}
                maxLength={500}
                rows={4}
                placeholder="Your play style, favorite field, or a little about you."
              />
            </label>
            <label>
              Default marker
              <select name="marker" defaultValue={user.defaultMarker}>
                <option value="mechanical">Mechanical</option>
                <option value="electric">Electric</option>
                <option value="rental">Rental</option>
              </select>
            </label>
            <p>
              Your display name, avatar, and bio appear on player cards for your
              crew. Your display name and marker are used as RSVP defaults.
            </p>
          </div>
        </div>
        <div className="form-actions">
          <Submit>Save profile</Submit>
        </div>
      </form>
    </Shell>
  );
}
