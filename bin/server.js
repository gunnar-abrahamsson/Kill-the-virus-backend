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

const createGameRoom = (player1, player2, room) => {
    player1.join(room)
    player2.join(room)
    gameRooms.push({
        player1,
        player2,
        room
    });

    io.to(room).emit('joined game room', room)
}

const usersInLoby = [];
const gameRooms = [];
io.on('connection', (socket) => {
	socket.userName = socket.handshake.query.userName || 'Anonymus panda'
	debug(`${socket.userName} connected`)
	socket.emit("connected", {userName: socket.userName, room: '/'});

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
	
	socket.on('disconnect', () => {
		debug(`${socket.userName} disconnected`)
		socket.emit("disconnected", {userName: socket.userName});
    });
    
    socket.on('join', (data) => {
        debug(data);
        //handleGameRoom(data.room);
        socket.to(data.room).broadcast.emit('player joined', data.userName)
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
