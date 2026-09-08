"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ImageUpload } from "./image-upload";
import { Submit } from "./ui";
import { saveProfileAction } from "@/app/profile/actions";
import type { User } from "@/lib/types";

export function ProfileEditor({
  profile,
  managed,
  siteEnabled,
}: {
  profile: Pick<
    User,
    | "name"
    | "firstName"
    | "realName"
    | "bio"
    | "avatarId"
    | "profileSlug"
    | "publicProfileEnabled"
    | "defaultMarker"
  >;
  managed: boolean;
  siteEnabled: boolean;
}) {
  const [name, setName] = useState(profile.name);
  const [firstName, setFirstName] = useState(profile.firstName);
  const [bio, setBio] = useState(profile.bio);
  const [slug, setSlug] = useState(profile.profileSlug ?? "");
  const [enabled, setEnabled] = useState(profile.publicProfileEnabled);
  return (
    <form action={saveProfileAction} className="account-editor">
      <aside className="profile-preview panel">
        <span className="eyebrow">PLAYER CARD / PREVIEW</span>
        {profile.avatarId ? (
          <Image
            className="profile-portrait"
            src={`/media/${profile.avatarId}`}
            alt=""
            width={112}
            height={112}
            unoptimized
          />
        ) : (
          <span className="profile-portrait profile-initials">
            {name.slice(0, 2).toUpperCase()}
          </span>
        )}
        <h2>{name || "Display name"}</h2>
        {firstName && <span>{firstName}</span>}
        {bio && <p className="profile-bio">{bio}</p>}
        <span className="count-badge">
          {enabled && siteEnabled ? "PUBLIC" : "CREW ONLY"}
        </span>
        {profile.publicProfileEnabled && profile.profileSlug && siteEnabled && (
          <Link href={`/u/${profile.profileSlug}`} className="text-link">
            View public profile
          </Link>
        )}
      </aside>
      <section className="panel form-stack">
        <div className="account-field-pair">
          <label>
            Display name
            <input
              name="displayName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              required
              disabled={managed}
            />
          </label>
          <label>
            First name (public)
            <input
              name="firstName"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              maxLength={80}
            />
          </label>
        </div>
        {managed && (
          <>
            <input type="hidden" name="displayName" value={profile.name} />
            <small>Display name is environment-managed.</small>
          </>
        )}
        <label>
          Profile address
          <span className="profile-slug-input">
            <span>/u/</span>
            <input
              name="profileSlug"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              minLength={3}
              maxLength={30}
              pattern="[a-z0-9][a-z0-9\-]{1,28}[a-z0-9]"
              aria-label="Profile address"
            />
          </span>
        </label>
        <input type="hidden" name="publicProfilePresent" value="1" />
        <label className="toggle-label">
          <span>
            Public profile
            <small>Includes bio, gear and confirmed attendance.</small>
          </span>
          <input
            type="checkbox"
            name="publicProfileEnabled"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
        </label>
        {!siteEnabled && <small>Public profiles are disabled site-wide.</small>}
        <label>
          Bio
          <textarea
            name="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={500}
            rows={3}
          />
        </label>
        <label>
          Default marker
          <select name="marker" defaultValue={profile.defaultMarker}>
            <option value="mechanical">Mechanical</option>
            <option value="electric">Electric</option>
            <option value="rental">Rental</option>
          </select>
        </label>
        <ImageUpload
          name="avatar"
          label="Avatar"
          mediaId={profile.avatarId}
          removeName="removeAvatar"
          avatar
        />
        <details className="account-details">
          <summary>Private details</summary>
          <label>
            Real name
            <input
              name="realName"
              defaultValue={profile.realName}
              maxLength={120}
              autoComplete="name"
            />
          </label>
          <small>Real name stays private.</small>
        </details>
        <Submit>Save profile</Submit>
      </section>
    </form>
  );
}
