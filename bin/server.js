#!/usr/bin/env node

/**
 * Module dependencies.
 */

require('dotenv').config();

const app = require('../app');
const debug = require('debug')('kill-the-virus:server');
const http = require('http');
const SocketIO = require('socket.io');
const { set } = require('../app');

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
    player1.wins = 0;
    player2.wins = 0;
    gameRooms.push({
        player1,
        player2,
        room,
        round: 0,
        reactionTimes: [],
    });

    io.to(room).emit('joined game room', room)
    startNextRound(room);
}

const startNextRound = (room) => {
    if(room.round < 10) {
        spawnVirus(room);
    } else {
        endGame(room)
    }
}

const endGame = (room) => {
    debug('Game done!')
}

const getCordinates = () => {
    //set x y cords with safty space
    const x = Math.floor(Math.random() * 780) + 10
    const y = Math.floor(Math.random() * 580) + 10
    const delay = Math.floor(Math.random() * 5)
    return{ x, y, delay }
}

const spawnVirus = (room) => {
    const cordinates = getCordinates();
    io.to(room).emit('spawn virus', cordinates);
    
}

const getPlayersGameRoom = (player) => {
    const gameRoom = gameRooms.find(gameRoom => player === gameRoom.player1 || player === gameRoom.player2)
    return gameRoom
}   
const calculateResoult = (room) => {
    // get reaction times
    const times = room.reactionTimes.map(obj => obj.reactionTime)
    // get the fastest reaction time
    const fastestReaction = Math.min(...times)
    // find the reactionTime object with coresponding reation time
    const fastSocket = room.reactionTimes.find(reactionTimeObj => reactionTimeObj.reactionTime === fastestReaction);
    const slowSocket = room.reactionTimes.find(reactionTimeObj => reactionTimeObj.reactionTime === fastestReaction);

    // save resoult to the game room
    fastSocket.wins++
    // increase the round by one
    room.round++
    // send resoult to each player
    io.to(fastSocket.id).emit('update score', {
        player: fastSocket.wins,
        oponent: slowSocket.wins
    })
    io.to(slowSocket.id).emit('update score', {
        player: slowSocket.wins,
        oponent: fastSocket.wins
    })

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

    debug('reactionTimes', room.reactionTimes);
}

const usersInLoby = [];
const gameRooms = [];
io.on('connection', (socket) => {
    socket.userName = 'Anonymus panda'
    //Set username and plase user in loby or match with another player
    socket.on('submit userName', userName => {
        socket.userName = userName
        debug(`${socket.userName} connected`)
        socket.emit("connected", {userName: userName, room: '/'});
        //check if there is atleast one user in loby
        if(usersInLoby.length) {
            //if there is users in loby, create game room and make them join
            //remove user in loby and make user join game room
            const player2 = usersInLoby.shift()
            createGameRoom(socket, player2, socket.id)
    
            io.to(socket.id).on('join', (data) => {
                debug('some one joined')
            })
        } else {
            usersInLoby.push(socket);
        }
    })
	socket.on('disconnect', () => {
		debug(`${socket.userName} disconnected`)
		socket.emit("disconnected", {userName: socket.userName});
    });
    
    socket.on('join', (data) => {
        debug(data);
        socket.to(getPlayersGameRoom(socket).room).broadcast.emit('player joined', data.userName)
    })

    socket.on('submit reactionTime', (reactionTime) => {
        handleReactionTime(socket, reactionTime);
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
