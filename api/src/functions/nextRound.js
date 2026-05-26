const { app } = require('@azure/functions');
const { getTableClient } = require('../shared/tableClient');

app.http('nextRound', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'rooms/{roomCode}/next-round',
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
      return { status: 403, body: JSON.stringify({ error: "Only the host can start the next round" }) };
    }

    if (room.status !== "results") {
      return { status: 400, body: JSON.stringify({ error: "Cannot start next round yet" }) };
    }

    // Fetch all players and reset their clues, votes, and robot status
    const playersIter = playersTable.listEntities({
      queryOptions: { filter: `PartitionKey eq '${roomCode}'` }
    });
    const players = [];
    for await (const player of playersIter) {
      players.push(player);
    }

    for (const player of players) {
      await playersTable.updateEntity({
        partitionKey: roomCode,
        rowKey: player.rowKey,
        isRobot: false,
        clue: "",
        vote: "",
      }, "Merge");
    }

    // Pick a new random robot
    const robotIndex = Math.floor(Math.random() * players.length);
    const robotPlayer = players[robotIndex];

    await playersTable.updateEntity({
      partitionKey: roomCode,
      rowKey: robotPlayer.rowKey,
      isRobot: true,
    }, "Merge");

    // Pick a new random word
    const categories = ["animals", "food", "sports"];
    const randomCategory = categories[Math.floor(Math.random() * categories.length)];

    const wordsIter = wordsTable.listEntities({
      queryOptions: { filter: `PartitionKey eq '${randomCategory}'` }
    });
    const words = [];
    for await (const word of wordsIter) {
      words.push(word.rowKey);
    }

    const randomWord = words[Math.floor(Math.random() * words.length)];

    // Update room for new round
    await roomsTable.updateEntity({
      partitionKey: "rooms",
      rowKey: roomCode,
      status: "clue",
      currentWord: randomWord,
      currentCategory: randomCategory,
      robotPlayerId: robotPlayer.rowKey,
      robotCaught: false,
      round: room.round + 1,
    }, "Merge");

    return {
      status: 200,
      body: JSON.stringify({ message: "Next round started" }),
    };
  }
});
