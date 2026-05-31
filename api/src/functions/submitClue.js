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

    const clueOrder = JSON.parse(room.clueOrder || '[]');
    const currentClueIndex = room.currentClueIndex ?? 0;
    const currentCluePass = room.currentCluePass ?? 1;

    if (clueOrder[currentClueIndex] !== playerId) {
      return { status: 403, body: JSON.stringify({ error: "It's not your turn" }) };
    }

    // Save to clue (pass 1) or clue2 (pass 2)
    const clueField = currentCluePass === 1 ? 'clue' : 'clue2';
    await playersTable.updateEntity({
      partitionKey: roomCode,
      rowKey: playerId,
      [clueField]: clue,
    }, "Merge");

    // Advance the turn
    const nextIndex = currentClueIndex + 1;
    const isLastInPass = nextIndex >= clueOrder.length;

    if (isLastInPass && currentCluePass === 1) {
      // First pass done — start pass 2
      await roomsTable.updateEntity({
        partitionKey: "rooms",
        rowKey: roomCode,
        currentClueIndex: 0,
        currentCluePass: 2,
      }, "Merge");
    } else if (isLastInPass && currentCluePass === 2) {
      // Both passes done — advance to reveal
      await roomsTable.updateEntity({
        partitionKey: "rooms",
        rowKey: roomCode,
        currentClueIndex: nextIndex,
        status: "reveal",
      }, "Merge");
    } else {
      await roomsTable.updateEntity({
        partitionKey: "rooms",
        rowKey: roomCode,
        currentClueIndex: nextIndex,
      }, "Merge");
    }

    return {
      status: 200,
      body: JSON.stringify({ message: "Clue submitted" }),
    };
  }
});