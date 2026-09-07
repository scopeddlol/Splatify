import Image from "next/image";

export function ImageUpload({
  name = "file",
  id = name,
  label = "Image",
  mediaId = null,
  removeName = "remove",
  avatar = false,
}: {
  name?: string;
  id?: string;
  label?: string;
  mediaId?: string | null;
  removeName?: string;
  avatar?: boolean;
}) {
  return (
    <div className="image-upload form-stack">
      {mediaId && (
        <Image
          src={`/media/${mediaId}`}
          alt={`Current ${label.toLowerCase()}`}
          width={avatar ? 128 : 480}
          height={avatar ? 128 : 300}
          className={avatar ? "avatar-preview" : "cover-preview"}
          unoptimized
        />
      )}
      <label htmlFor={id}>
        {label}
        <input
          type="file"
          id={id}
          name={name}
          accept="image/jpeg,image/png,image/webp"
          aria-describedby={`${id}-help`}
        />
      </label>
      <small id={`${id}-help`}>
        Still JPEG, PNG, or WebP. Maximum 4 MB and 20 million pixels. Images are
        resized and metadata is removed.
      </small>
      {mediaId && (
        <label className="checkbox-label">
          <input type="checkbox" name={removeName} /> Remove current{" "}
          {label.toLowerCase()}
        </label>
      )}
    </div>
  );
}
