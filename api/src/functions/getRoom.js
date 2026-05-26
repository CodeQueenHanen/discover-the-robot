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
      players.push({
        playerId: player.rowKey,
        nickname: player.nickname,
        hasSubmittedClue: player.clue !== "",
        hasVoted: player.vote !== "",
        clue: ["reveal", "vote", "results"].includes(room.status) ? player.clue : undefined,
        vote: room.status === "results" ? player.vote : undefined,
      });
    }

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
        players,
      }),
    };
  }
});