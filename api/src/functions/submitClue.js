const { app } = require('@azure/functions');
const { getTableClient } = require('../shared/tableClient');

app.http('submitClue', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'rooms/{roomCode}/clue',
  handler: async (request, context) => {
    const roomCode = request.params.roomCode;
    const body = await request.json();
    const playerId = body.playerId;
    const clue = body.clue?.trim();

    if (!clue) {
      return { status: 400, body: JSON.stringify({ error: "clue is required" }) };
    }

    const clueWords = clue.split(/\s+/);
    if (clueWords.length > 1) {
      return { status: 400, body: JSON.stringify({ error: "Clue must be a single word" }) };
    }

    const roomsTable = await getTableClient("Rooms");
    const playersTable = await getTableClient("Players");

    let room;
    try {
      room = await roomsTable.getEntity("rooms", roomCode);
    } catch {
      return { status: 404, body: JSON.stringify({ error: "Room not found" }) };
    }

    if (room.status !== "clue") {
      return { status: 400, body: JSON.stringify({ error: "Not currently in the clue phase" }) };
    }

    // Save this player's clue
    await playersTable.updateEntity({
      partitionKey: roomCode,
      rowKey: playerId,
      clue: clue,
    }, "Merge");

    // Check if all players have submitted
    const playersIter = playersTable.listEntities({
      queryOptions: { filter: `PartitionKey eq '${roomCode}'` }
    });
    const players = [];
    for await (const player of playersIter) {
      players.push(player);
    }

    const allSubmitted = players.every(p => p.rowKey === playerId || p.clue !== "");

    if (allSubmitted) {
      await roomsTable.updateEntity({
        partitionKey: "rooms",
        rowKey: roomCode,
        status: "reveal",
      }, "Merge");
    }

    return {
      status: 200,
      body: JSON.stringify({ message: "Clue submitted" }),
    };
  }
});