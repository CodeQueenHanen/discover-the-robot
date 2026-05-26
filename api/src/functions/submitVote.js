const { app } = require('@azure/functions');
const { getTableClient } = require('../shared/tableClient');

app.http('submitVote', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'rooms/{roomCode}/vote',
  handler: async (request, context) => {
    const roomCode = request.params.roomCode;
    const body = await request.json();
    const playerId = body.playerId;
    const votedForId = body.votedForId;

    if (!votedForId) {
      return { status: 400, body: JSON.stringify({ error: "votedForId is required" }) };
    }

    if (playerId === votedForId) {
      return { status: 400, body: JSON.stringify({ error: "You cannot vote for yourself" }) };
    }

    const roomsTable = await getTableClient("Rooms");
    const playersTable = await getTableClient("Players");

    let room;
    try {
      room = await roomsTable.getEntity("rooms", roomCode);
    } catch {
      return { status: 404, body: JSON.stringify({ error: "Room not found" }) };
    }

    if (room.status !== "vote") {
      return { status: 400, body: JSON.stringify({ error: "Not currently in the voting phase" }) };
    }

    // Save this player's vote
    await playersTable.updateEntity({
      partitionKey: roomCode,
      rowKey: playerId,
      vote: votedForId,
    }, "Merge");

    // Check if all players have voted
    const playersIter = playersTable.listEntities({
      queryOptions: { filter: `PartitionKey eq '${roomCode}'` }
    });
    const players = [];
    for await (const player of playersIter) {
      players.push(player);
    }

    const allVoted = players.every(p => p.rowKey === playerId || p.vote !== "");

    if (allVoted) {
      // Tally votes
      const voteCounts = {};
      for (const player of players) {
        const v = player.rowKey === playerId ? votedForId : player.vote;
        voteCounts[v] = (voteCounts[v] || 0) + 1;
      }

      const mostVotedId = Object.entries(voteCounts)
        .sort((a, b) => b[1] - a[1])[0][0];

      const robotCaught = mostVotedId === room.robotPlayerId;

      await roomsTable.updateEntity({
        partitionKey: "rooms",
        rowKey: roomCode,
        status: "results",
        robotCaught: robotCaught,
      }, "Merge");
    }

    return {
      status: 200,
      body: JSON.stringify({ message: "Vote submitted" }),
    };
  }
});
