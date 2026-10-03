import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyAdminSessionToken, ADMIN_COOKIE_NAME } from '@/lib/adminSession';

export const dynamic = 'force-dynamic';

export default async function MonitorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(ADMIN_COOKIE_NAME)?.value;

  const isValid = await verifyAdminSessionToken(sessionToken);
  if (!isValid) {
    redirect('/admin');
  }

  return <>{children}</>;
}
