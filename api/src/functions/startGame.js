const { app } = require('@azure/functions');
const { getTableClient } = require('../shared/tableClient');

app.http('startGame', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'rooms/{roomCode}/start',
  handler: async (request, context) => {
    const roomCode = request.params.roomCode;
    const body = await request.json();
    const playerId = body.playerId;

    const roomsTable = await getTableClient("Rooms");
    const playersTable = await getTableClient("Players");
    const wordsTable = await getTableClient("Words");

    let room;
    try {
      room = await roomsTable.getEntity("rooms", roomCode);
    } catch {
      return { status: 404, body: JSON.stringify({ error: "Room not found" }) };
    }

    if (room.hostPlayerId !== playerId) {
      return { status: 403, body: JSON.stringify({ error: "Only the host can start the game" }) };
    }

    if (room.status !== "waiting") {
      return { status: 400, body: JSON.stringify({ error: "Game has already started" }) };
    }

    // Fetch all players
    const playersIter = playersTable.listEntities({
      queryOptions: { filter: `PartitionKey eq '${roomCode}'` }
    });
    const players = [];
    for await (const player of playersIter) {
      players.push(player);
    }

    if (players.length < 2) {
      return { status: 400, body: JSON.stringify({ error: "Need at least 2 players to start" }) };
    }

    // Pick a random robot
    const robotIndex = Math.floor(Math.random() * players.length);
    const robotPlayer = players[robotIndex];

    // Pick a random word from the Words table
    const categories = ["animals", "food", "sports"];
    const randomCategory = categories[Math.floor(Math.random() * categories.length)];

    const wordsIter = wordsTable.listEntities({
      queryOptions: { filter: `PartitionKey eq '${randomCategory}'` }
    });
    const words = [];
    for await (const word of wordsIter) {
      words.push(word.rowKey);
    }

    if (words.length === 0) {
      return { status: 500, body: JSON.stringify({ error: "No words found for category: " + randomCategory }) };
    }

    const randomWord = words[Math.floor(Math.random() * words.length)];

    // Mark the robot in Players table
    await playersTable.updateEntity({
      partitionKey: roomCode,
      rowKey: robotPlayer.rowKey,
      isRobot: true,
    }, "Merge");

    // Shuffle players into a random clue order
    const clueOrder = [...players]
      .sort(() => Math.random() - 0.5)
      .map(p => p.rowKey);

    // Update room
    await roomsTable.updateEntity({
      partitionKey: "rooms",
      rowKey: roomCode,
      status: "clue",
      currentWord: randomWord,
      currentCategory: randomCategory,
      robotPlayerId: robotPlayer.rowKey,
      clueOrder: JSON.stringify(clueOrder),
      currentClueIndex: 0,
      currentCluePass: 1,
    }, "Merge");

    return {
      status: 200,
      body: JSON.stringify({ message: "Game started" }),
    };
  }
});