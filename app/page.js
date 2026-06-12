import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import Tracker from '@/components/Tracker';
import data from '@/data/stickers.json';

export default async function Home() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return <Tracker data={data} userEmail={user.email} />;
}
