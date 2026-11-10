// Order API client for the Northwind order desk. Both calls return a Promise.

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let nextNumber = 2049;

/** Creates an order. Resolves with the saved record; rejects with an Error whose message can be shown to the user. */
export async function createOrder(data) {
  await delay(500);
  if (!data || !data.customer) throw new Error('A customer is required.');
  return { id: 'SO-' + nextNumber++, ...data };
}

/** Updates an order by id. Resolves with the saved record. */
export async function updateOrder(id, data) {
  await delay(500);
  if (!id) throw new Error('An order id is required.');
  return { id, ...data };
}
