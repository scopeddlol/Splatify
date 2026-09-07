import { AuthPage } from "@/components/auth-page";
export default async function Recover({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <AuthPage mode="recover" params={await searchParams} />;
}
