const { app } = require('@azure/functions');
const { getTableClient } = require('../shared/tableClient');
const { v4: uuidv4 } = require('uuid');

app.http('joinRoom', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'rooms/{roomCode}/join',
  handler: async (request, context) => {
    const roomCode = request.params.roomCode;
    const body = await request.json();
    const nickname = body.nickname;
    const avatar = body.avatar || '🦊';

    if (!nickname) {
      return { status: 400, body: JSON.stringify({ error: "nickname is required" }) };
    }

    const roomsTable = await getTableClient("Rooms");
    const playersTable = await getTableClient("Players");

    let room;
    try {
      room = await roomsTable.getEntity("rooms", roomCode);
    } catch {
      return { status: 404, body: JSON.stringify({ error: "Room not found" }) };
    }

    if (room.status !== "waiting") {
      return { status: 400, body: JSON.stringify({ error: "Game has already started" }) };
    }

    const playerId = uuidv4();

    await playersTable.createEntity({
      partitionKey: roomCode,
      rowKey: playerId,
      nickname: nickname,
      avatar: avatar,
      isRobot: false,
      clue: "",
      vote: "",
    });

    return {
      status: 201,
      body: JSON.stringify({ playerId, roomCode }),
    };
  }
});