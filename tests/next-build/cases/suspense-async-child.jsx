import { Suspense } from 'react';

async function StateText({ searchParams }) {
  const { state } = await searchParams;
  return <p>State: {state ?? 'none'}</p>;
}

export default function Page({ searchParams }) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <StateText searchParams={searchParams} />
    </Suspense>
  );
}
