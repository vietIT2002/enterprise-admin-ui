export default async function Page({ searchParams }) {
  const { state } = await searchParams;
  return <p>State: {state ?? 'none'}</p>;
}
