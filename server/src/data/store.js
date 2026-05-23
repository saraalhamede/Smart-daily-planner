export async function getStore() {
  if (process.env.DATA_STORE === 'json') {
    const { jsonStore } = await import('./jsonStore.js');
    return jsonStore;
  }

  const { mysqlStore } = await import('./mysqlStore.js');
  return mysqlStore;
}
