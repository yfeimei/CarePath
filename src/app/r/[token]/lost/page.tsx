import { FRONT_DESK_DISPLAY, FRONT_DESK_TEL } from '@/lib/contact';
import { getPassByToken } from '@/lib/passes';
import ExpiredNotice from '../ExpiredNotice';
import LostClient from './LostClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'CarePath — help me find my way' };

export default async function LostPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const pass = await getPassByToken(token);

  if (!pass) return <ExpiredNotice />;

  return (
    <LostClient
      token={token}
      publicId={pass.publicId}
      destination={pass.destination}
      frontDeskTel={FRONT_DESK_TEL}
      frontDeskDisplay={FRONT_DESK_DISPLAY}
    />
  );
}
