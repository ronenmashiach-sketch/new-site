'use client'

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function NotFound() {
  const router = useRouter();

  useEffect(() => {
    router.push('/');
  }, [router]);

  return <div>Redirecting...</div>;
}