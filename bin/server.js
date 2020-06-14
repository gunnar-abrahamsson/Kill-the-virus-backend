#!/usr/bin/env node

/**
 * Module dependencies.
 */

require('dotenv').config();

const app = require('../app');
const debug = require('debug')('kill-the-virus:server');
const http = require('http');
const SocketIO = require('socket.io');

/**
 * Get port from environment and store in Express.
 */

const port = normalizePort(process.env.PORT || '9000');
app.set('port', port);

/**
 * Create HTTP server.
 */

const server = http.createServer(app);
const io = SocketIO(server);
//set origins so cors stops messing with me ;(
//io.origins('*:*');

const createGameRoom = (player1, player2, room) => {
    player1.join(room)
    player2.join(room)
    gameRooms.push({
        player1,
        player2,
        scores: [
            {player: player1, wins: 0},
            {player: player2, wins: 0},
        ],
        room,
        round: 0,
        reactionTimes: [],
    });

    io.to(room).emit('joined game room', room)
    const roomObj = getPlayersGameRoom(player1)
    startNextRound(roomObj);
}

const startNextRound = (room) => {
    if(room.round < 3) {
        spawnVirus(room.room);
    } else {
        endGame(room)
    }
}

const endGame = (room) => {
    sendResoultToPlayers(room)
    removeGameRoom(room);
    debug('Game done!')
}

const sendResoultToPlayers = (room) => {
    // get scores
    const scoresArray = room.scores.map(scoreObj => scoreObj.wins)
    //check if draw
    if(scoresArray[0] === scoresArray[1]) {
        io.to(room.room).emit('game over', {
            player: scoresArray[0],
            opponent: scoresArray[0],
            resoult: 'draw'
        })
        return;
    }
    // if not a draw find winner and loser
    // get the fastest reaction time
    const winnerScore = Math.max(...scoresArray);
    const winnerObj = room.scores.find(scoreObj => scoreObj.wins === winnerScore);
    const loserObj = room.scores.find(scoreObj => scoreObj.wins !== winnerScore);

    //send result to winner
    winnerObj.player.emit('game over', {
        player: winnerObj.wins,
        opponent: loserObj.wins,
        resoult: 'win',
        dc: false,
    })
    //send result to loser
    loserObj.player.emit('game over', {
        player: loserObj.wins,
        opponent: winnerObj.wins,
        resoult: 'lose',
        dc: false,
    })
}
const removeGameRoom = (room) => {
    const filteredGameRooms = gameRooms.filter(roomInArray => roomInArray != room);
    gameRooms = [...filteredGameRooms];
}
const getCordinates = () => {
    //set x y cords with safty space
    const x = Math.floor(Math.random() * 740) + 30
    const y = Math.floor(Math.random() * 540) + 30
    const delay = Math.floor(Math.random() * 5)
    const size = Math.floor(Math.random() * 70) + 20
    return{ x, y, delay, size }
}

const spawnVirus = (room) => {
    const cordinates = getCordinates();
    io.to(room).emit('spawn virus', cordinates);
    
}

const getPlayersGameRoom = (player) => {
    const gameRoom = gameRooms.find(gameRoom => player === gameRoom.player1 || player === gameRoom.player2)
    return gameRoom
}

const handleScore = (winner, loser, room) => {
    //updateScores

    //find players score that we want to update
    const winnersScore = room.scores.find(score => score.player === winner.player)
    const losersScore = room.scores.find(score => score.player === loser.player)
    // save resoult to the game room
    winnersScore.wins++
    // increase the round by one
    room.round++
    // send resoult to each player
    winner.player.emit('update score', {
        player: winnersScore.wins,
        opponent: losersScore.wins,
        round: room.round
    })
    loser.player.emit('update score', {
        player: losersScore.wins,
        opponent: winnersScore.wins,
        round: room.round
    })
}

const calculateResoult = (room) => {
    // get reaction times
    const times = room.reactionTimes.map(obj => obj.reactionTime)
    // get the fastest reaction time
    const fastestReaction = Math.min(...times)
    // find the reactionTime object with coresponding reation time
    const fastSocket = room.reactionTimes.find(reactionTimeObj => reactionTimeObj.reactionTime === fastestReaction);
    const slowSocket = room.reactionTimes.find(reactionTimeObj => reactionTimeObj.reactionTime !== fastestReaction);

    handleScore(fastSocket, slowSocket, room);

    //reset reaction times efore starting new round
    room.reactionTimes = [];

    //play next round
    startNextRound(room);

}

const handleReactionTime = (player, reactionTime) => {
    const room = getPlayersGameRoom(player);
    if(!room) return;
    room.reactionTimes = [...room.reactionTimes, {
        player,
        reactionTime
    }]
    player.to(room.room).broadcast.emit('opponents reactionTime', reactionTime);

    if(room.reactionTimes.length === 2) {
        calculateResoult(room);
    }
}

const handleLoby = (socket) => {
    //check if there is atleast one user in loby
    if(usersInLoby.length) {
        //if there is users in loby, create game room and make them join
        //remove user in loby and make user join game room
        const player2 = usersInLoby.shift()
        createGameRoom(socket, player2, socket.id)
    } else {
        usersInLoby.push(socket);
    }
}

const handleDisconnect = (socket) => {
    //check if user is in a loby
    const isInLoby = usersInLoby.find(user => user === socket);
    //filter user from loby
    if(isInLoby) {
        const filteredLoby = usersInLoby.filter(user => user !== socket);
        usersInLoby = filteredLoby;
        return;
    }
    //if user is not in a loby check if user is in a game
    const room = getPlayersGameRoom(socket)
    if(room) {
        //if user is in a game send win to the player who didn't disconnect
        const dcPlayerScore = room.scores.find(score => score.player === socket)
        const winnerPlayerScore = room.scores.find(score => score.player !== socket)
        socket.to(room.room).broadcast.emit('game over', {
            player: winnerPlayerScore.wins,
            opponent: dcPlayerScore.wins,
            resoult: 'win',
            dc: true
        })
        //remove game room
        removeGameRoom(room);
    }
}

let usersInLoby = [];
let gameRooms = [];
io.on('connection', (socket) => {
    socket.userName = 'Anonymus panda'
    //Set username and plase user in loby or match with another player
    socket.on('submit userName', userName => {
        socket.userName = userName
        debug(`${socket.userName} connected`)
        socket.emit("connected", {userName: userName, room: '/'});
        
        handleLoby(socket);
    })
	socket.on('disconnect', () => {
        handleDisconnect(socket)
		debug(`${socket.userName} disconnected`)
		socket.emit("disconnected", {userName: socket.userName});
    });
    
    socket.on('join', (data) => {
        debug(data);
        socket.to(data.room).broadcast.emit('player joined', data.userName)
    })

    socket.on('submit reactionTime', (reactionTime) => {
        handleReactionTime(socket, reactionTime);
    })

    socket.on('play again', () => {
        handleLoby(socket);
    })
});




/**
 * Listen on provided port, on all network interfaces.
 */

server.listen(port);
server.on('error', onError);
server.on('listening', onListening);

/**
 * Normalize a port into a number, string, or false.
 */

function normalizePort(val) {
  const port = parseInt(val, 10);

  if (isNaN(port)) {
	// named pipe
	return val;
  }

  if (port >= 0) {
	// port number
	return port;
  }

  return false;
}

/**
 * Event listener for HTTP server "error" event.
 */

function onError(error) {
  if (error.syscall !== 'listen') {
	throw error;
  }

  const bind = typeof port === 'string'
	? 'Pipe ' + port
	: 'Port ' + port;

  // handle specific listen errors with friendly messages
  switch (error.code) {
	case 'EACCES':
	  console.error(bind + ' requires elevated privileges');
	  process.exit(1);
	  break;
	case 'EADDRINUSE':
	  console.error(bind + ' is already in use');
	  process.exit(1);
	  break;
	default:
	  throw error;
  }
}

/**
 * Event listener for HTTP server "listening" event.
 */

function onListening() {
  const addr = server.address();
  const bind = typeof addr === 'string'
	? 'pipe ' + addr
	: 'port ' + addr.port;
  debug('Listening on ' + bind);
}
