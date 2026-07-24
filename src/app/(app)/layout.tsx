import { Nav } from "@/components/nav";
import { RegisterServiceWorker } from "@/components/pwa/register-sw";
import { requireUser } from "@/lib/auth";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireUser();

  return (
    <>
      <RegisterServiceWorker />
      <Nav />
      {children}
    </>
  );
}
