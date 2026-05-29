const { app } = require('@azure/functions');
const { getTableClient } = require('../shared/tableClient');
const { v4: uuidv4 } = require('uuid');

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

app.http('createRoom', {
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const body = await request.json();
    const nickname = body.nickname;
    const avatar = body.avatar || '🦊';

    if (!nickname) {
      return { status: 400, body: JSON.stringify({ error: "nickname is required" }) };
    }

    const roomCode = generateRoomCode();
    const playerId = uuidv4();

    const roomsTable = await getTableClient("Rooms");
    const playersTable = await getTableClient("Players");

    await roomsTable.createEntity({
      partitionKey: "rooms",
      rowKey: roomCode,
      status: "waiting",
      hostPlayerId: playerId,
      currentWord: "",
      currentCategory: "",
      robotPlayerId: "",
      round: 1,
    });

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
      body: JSON.stringify({ roomCode, playerId }),
    };
  }
});