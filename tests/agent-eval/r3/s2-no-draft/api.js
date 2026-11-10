// Order API client for the Northwind order desk: a classic script (load it with <script src="api.js">).
// It defines window.OrdersApi = { createOrder, updateOrder }. Both calls return a Promise.
(function () {
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  let nextNumber = 2049;

  /** Creates an order. Resolves with the saved record; rejects with an Error whose message can be shown to the user. */
  async function createOrder(data) {
    await delay(500);
    if (!data || !data.customer) throw new Error('A customer is required.');
    return { id: 'SO-' + nextNumber++, ...data };
  }

  /** Updates an order by id. Resolves with the saved record. */
  async function updateOrder(id, data) {
    await delay(500);
    if (!id) throw new Error('An order id is required.');
    return { id, ...data };
  }

  window.OrdersApi = { createOrder, updateOrder };
})();
