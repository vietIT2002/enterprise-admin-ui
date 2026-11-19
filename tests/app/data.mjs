// Deterministic seed data for the fixture app. No randomness, no clock.
export const STATUSES = ['Pending', 'Confirmed', 'Shipped', 'Cancelled'];

export const USERS = {
  lan: { username: 'lan', name: 'Lan', role: 'admin', roleLabel: 'Admin', password: 'test' },
  minh: { username: 'minh', name: 'Minh', role: 'viewer', roleLabel: 'Viewer', password: 'test' },
};

const CUSTOMERS = [
  'Nguyen Van An', 'Tran Thi Binh', 'Le Hoang Cuong', 'Pham Minh Duc', 'Vo Thu Ha',
  'Dang Quoc Khanh', 'Bui Thanh Lam', 'Do Ngoc Mai', 'Ngo Gia Nam', 'Huynh Bao Oanh',
  'Phan Tuan Phong', 'Truong My Quyen',
];

// 24 rows where index % 5 is 0 or 1, minus index 56 = 23 Pending.
const OTHER = ['Confirmed', 'Shipped', 'Cancelled'];

export function seedOrders() {
  const rows = [];
  for (let i = 0; i < 60; i++) {
    const pending = i % 5 < 2 && i !== 56;
    rows.push({
      id: `SO-${1001 + i}`,
      customer: CUSTOMERS[i % CUSTOMERS.length],
      status: pending ? 'Pending' : OTHER[i % 3],
      total: 150000 + ((i * 73) % 40) * 25000,
      orderDate: `2026-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`,
      note: i % 4 === 0 ? 'Deliver in the morning' : '',
      version: 1,
    });
  }
  return rows;
}
