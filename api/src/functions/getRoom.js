const { app } = require('@azure/functions');
const { getTableClient } = require('../shared/tableClient');

app.http('getRoom', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'rooms/{roomCode}',
  handler: async (request, context) => {
    const roomCode = request.params.roomCode;
    const playerId = request.query.get('playerId');

    if (!playerId) {
      return { status: 400, body: JSON.stringify({ error: "playerId is required" }) };
    }

    const roomsTable = await getTableClient("Rooms");
    const playersTable = await getTableClient("Players");

    let room;
    try {
      room = await roomsTable.getEntity("rooms", roomCode);
    } catch {
      return { status: 404, body: JSON.stringify({ error: "Room not found" }) };
    }

    const isRobot = room.robotPlayerId === playerId;

    const playersIter = playersTable.listEntities({
      queryOptions: { filter: `PartitionKey eq '${roomCode}'` }
    });

    const players = [];
    for await (const player of playersIter) {
      const showClue = ["reveal", "vote", "results"].includes(room.status)
        || (room.status === "clue" && player.clue !== "");
      const showClue2 = ["reveal", "vote", "results"].includes(room.status)
        || (room.status === "clue" && (player.clue2 || "") !== "");

      players.push({
        playerId: player.rowKey,
        nickname: player.nickname,
        avatar: player.avatar || '🦊',
        hasSubmittedClue: player.clue !== "",
        hasSubmittedClue2: (player.clue2 || "") !== "",
        hasVoted: player.vote !== "",
        clue: showClue ? player.clue : undefined,
        clue2: showClue2 ? (player.clue2 || "") : undefined,
        vote: room.status === "results" ? player.vote : undefined,
      });
    }

    let clueOrder = [];
    try { clueOrder = JSON.parse(room.clueOrder || '[]'); } catch {}

    return {
      status: 200,
      body: JSON.stringify({
        roomCode,
        status: room.status,
        round: room.round,
        hostPlayerId: room.hostPlayerId,
        isRobot: isRobot,
        currentWord: isRobot ? null : (room.status !== "waiting" ? room.currentWord : null),
        currentCategory: room.status !== "waiting" ? room.currentCategory : null,
        robotPlayerId: room.status === "results" ? room.robotPlayerId : null,
        robotCaught: room.status === "results" ? room.robotCaught : null,
        clueOrder,
        currentClueIndex: room.currentClueIndex ?? 0,
        currentCluePass: room.currentCluePass ?? 1,
        players,
      }),
    };
  }
});