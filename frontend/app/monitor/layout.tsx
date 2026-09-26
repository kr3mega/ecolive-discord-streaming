import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function MonitorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const session = cookieStore.get('ecolive_admin_session')?.value;

  if (session !== 'ecolive_auth_2903_authenticated') {
    redirect('/');
  }

  return <>{children}</>;
}
