const { TableServiceClient, TableClient } = require("@azure/data-tables");

const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
const serviceClient = TableServiceClient.fromConnectionString(connectionString);

async function getTableClient(tableName) {
  try {
    await serviceClient.createTable(tableName);
  } catch (e) {
    if (e.statusCode !== 409) throw e;
  }
  return TableClient.fromConnectionString(connectionString, tableName);
}

module.exports = { getTableClient };
