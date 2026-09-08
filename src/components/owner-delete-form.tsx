import { PasswordInput } from "./password-input";
import { DeleteButton } from "./ui";

export function OwnerDeleteForm({
  action,
  name,
  value,
  label,
  message,
}: {
  action: (form: FormData) => Promise<void>;
  name: string;
  value: string;
  label: string;
  message: string;
}) {
  return (
    <details className="owner-delete">
      <summary>Delete</summary>
      <form action={action} className="form-stack">
        <input type="hidden" name={name} value={value} />
        <label htmlFor={`delete-${value}`}>Owner password</label>
        <PasswordInput id={`delete-${value}`} name="currentPassword" />
        <DeleteButton label={label} message={message} />
      </form>
    </details>
  );
}
