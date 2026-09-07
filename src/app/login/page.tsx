import { AuthPage } from "@/components/auth-page";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <AuthPage mode="login" params={await searchParams} />;
}
