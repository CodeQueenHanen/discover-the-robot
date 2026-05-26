const { app } = require('@azure/functions');
const { getTableClient } = require('../shared/tableClient');

app.http('startVote', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'rooms/{roomCode}/start-vote',
  handler: async (request, context) => {
    const roomCode = request.params.roomCode;
    const body = await request.json();
    const playerId = body.playerId;

    const roomsTable = await getTableClient("Rooms");

    let room;
    try {
      room = await roomsTable.getEntity("rooms", roomCode);
    } catch {
      return { status: 404, body: JSON.stringify({ error: "Room not found" }) };
    }

    if (room.hostPlayerId !== playerId) {
      return { status: 403, body: JSON.stringify({ error: "Only the host can start voting" }) };
    }

    if (room.status !== "reveal") {
      return { status: 400, body: JSON.stringify({ error: "Not currently in the reveal phase" }) };
    }

    await roomsTable.updateEntity({
      partitionKey: "rooms",
      rowKey: roomCode,
      status: "vote",
    }, "Merge");

    return {
      status: 200,
      body: JSON.stringify({ message: "Voting started" }),
    };
  }
});
