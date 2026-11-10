'use client';
import { useSearchParams } from 'next/navigation';

export default function StateReader() {
  const state = useSearchParams().get('state');
  return <p>State: {state ?? 'none'}</p>;
}
