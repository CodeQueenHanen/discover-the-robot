const { TableServiceClient, TableClient } = require("@azure/data-tables");
const settings = require("../../local.settings.json");

const connectionString = settings.Values.AZURE_STORAGE_CONNECTION_STRING;

const words = {
  animals: ["elephant", "penguin", "dolphin", "giraffe", "kangaroo", "octopus", "flamingo", "cheetah"],
  food: ["pizza", "sushi", "taco", "lasagna", "dumpling", "croissant", "burger", "ramen"],
  sports: ["tennis", "surfing", "archery", "volleyball", "gymnastics", "fencing", "cricket", "skiing"],
};

async function seed() {
  const serviceClient = TableServiceClient.fromConnectionString(connectionString);
  try {
    await serviceClient.createTable("Words");
  } catch (e) {
    if (e.statusCode !== 409) throw e;
  }

  const tableClient = TableClient.fromConnectionString(connectionString, "Words");

  for (const [category, wordList] of Object.entries(words)) {
    for (const word of wordList) {
      await tableClient.upsertEntity({
        partitionKey: category,
        rowKey: word,
      }, "Replace");
      console.log(`Seeded: ${category} / ${word}`);
    }
  }

  console.log("Done seeding words!");
}

seed().catch(console.error);
