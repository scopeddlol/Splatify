import { requireUser } from "@/lib/auth";
import { getSiteSettings } from "@/lib/data";
import { query } from "@/lib/db";
import { canUsePublicRecovery } from "@/lib/security";
import { Notice, Shell } from "@/components/shell";
import { Submit } from "@/components/ui";
import { PasswordInput } from "@/components/password-input";
import { ProfileEditor } from "@/components/profile-editor";
import {
  addLoadoutAction,
  deleteLoadoutAction,
  changePasswordAction,
} from "./actions";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser("/profile");
  const [settings, gear, rows] = await Promise.all([
    getSiteSettings(),
    query<{ id: string; category: string; name: string; notes: string }>(
      "SELECT id,category,name,notes FROM loadout_items WHERE user_id=$1 ORDER BY position,id LIMIT 10",
      [user.id],
    ),
    query("SELECT email,admin_verified FROM users WHERE id=$1", [user.id]),
  ]);
  const managed =
    !rows[0] || !canUsePublicRecovery(rows[0].email, rows[0].admin_verified);
  return (
    <Shell user={user} active="profile">
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR ACCOUNT</span>
          <h1>Player profile</h1>
        </div>
      </div>
      <Notice params={await searchParams} />
      <ProfileEditor
        managed={managed}
        siteEnabled={settings.publicProfilesEnabled}
        profile={{
          name: user.name,
          firstName: user.firstName,
          realName: user.realName,
          bio: user.bio,
          avatarId: user.avatarId,
          profileSlug: user.profileSlug,
          publicProfileEnabled: user.publicProfileEnabled,
          defaultMarker: user.defaultMarker,
        }}
      />
      <section className="panel section-space">
        <div className="panel-heading">
          <h2>My loadout</h2>
          <span className="count-badge">{gear.length} / 10</span>
        </div>
        <div className="profile-gear-grid">
          {gear.map((item) => (
            <article className="profile-gear-card" key={item.id}>
              <span className="eyebrow">{item.category}</span>
              <h3>{item.name}</h3>
              {item.notes && <p>{item.notes}</p>}
              <form action={deleteLoadoutAction}>
                <input type="hidden" name="itemId" value={item.id} />
                <button
                  className="button secondary small"
                  aria-label={`Remove ${item.name}`}
                >
                  Remove
                </button>
              </form>
            </article>
          ))}
        </div>
        {gear.length < 10 && (
          <details className="account-details">
            <summary>Add gear</summary>
            <form action={addLoadoutAction} className="form-stack">
              <div className="account-field-pair">
                <label>
                  Category
                  <select name="category">
                    {["marker", "hopper", "tank", "mask", "other"].map(
                      (category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <label>
                  Name
                  <input name="name" maxLength={100} required />
                </label>
              </div>
              <label>
                Notes
                <input name="notes" maxLength={250} />
              </label>
              <Submit>Add gear</Submit>
            </form>
          </details>
        )}
      </section>
      <section className="panel section-space">
        <details className="account-details">
          <summary>Password</summary>
          {managed ? (
            <small>Password is environment-managed.</small>
          ) : (
            <form action={changePasswordAction} className="form-stack">
              <label htmlFor="profile-current-password">Current password</label>
              <PasswordInput
                name="currentPassword"
                id="profile-current-password"
              />
              <label htmlFor="profile-new-password">New password</label>
              <PasswordInput
                id="profile-new-password"
                minLength={12}
                autoComplete="new-password"
              />
              <label htmlFor="profile-confirm-password">Confirm password</label>
              <PasswordInput
                id="profile-confirm-password"
                name="confirmPassword"
                minLength={12}
                autoComplete="new-password"
              />
              <small>
                Signs out other sessions and replaces recovery codes.
              </small>
              <Submit>Change password</Submit>
            </form>
          )}
        </details>
      </section>
    </Shell>
  );
}
