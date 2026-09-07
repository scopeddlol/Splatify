import { AuthPage } from "@/components/auth-page";
export default async function Signup({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <AuthPage mode="signup" params={await searchParams} />;
}
