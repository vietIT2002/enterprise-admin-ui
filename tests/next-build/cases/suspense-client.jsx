import { Suspense } from 'react';
import StateReader from './state-reader';

export default function Page() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <StateReader />
    </Suspense>
  );
}
