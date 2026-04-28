export async function getStore() {
  if (process.env.DATA_STORE === 'mysql') {
    const { mysqlStore } = await import('./mysqlStore.js');
    return mysqlStore;
  }

  const { jsonStore } = await import('./jsonStore.js');
  return jsonStore;
}
