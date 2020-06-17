/**
 * Socket Controller
 */

const debug = require('debug')('kill-the-virus:socket-controller');
let io = null
io = require('../bin/server')

let usersInLoby = [];
let gameRooms = [];

const createGameRoom = (player1, player2, room) => {
	//add players to a room
	player1.join(room)
	player2.join(room)
	//add room to the gameRooms array
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
	//get the newley created room from array
	const roomObj = getPlayersGameRoom(player1)
	// send room to startNextRound function
	startNextRound(roomObj);
}

const startNextRound = (room) => {
	if(room.round < 10) {
		spawnVirus(room.room);
	} else {
		endGame(room)
	}
}

const spawnVirus = (room) => {
	//get virus x, y, delay and size
	const cordinates = getCordinates();
	io.to(room).emit('spawn virus', cordinates);
	
}

//get virus x, y, delay and size
const getCordinates = () => {
	//set x y cords with safty space
	// x 30-930
	const x = Math.floor(Math.random() * 900) + 30
	// y 30 - 570
	const y = Math.floor(Math.random() * 540) + 30
	// delay 0 - 5 sec
	const delay = Math.floor(Math.random() * 5)
	//size 20-90px
	const size = Math.floor(Math.random() * 70) + 20
	return{ x, y, delay, size }
}

const handleReactionTime = (player, reactionTime) => {
	// get the players room
	const room = getPlayersGameRoom(player);
	if(!room) return;
	// add the players reaction time to the array
	room.reactionTimes = [...room.reactionTimes, {
		player,
		reactionTime
	}]
	
	//emit reaction time to the opponent 
	player.to(room.room).broadcast.emit('opponents reactionTime', reactionTime);

	//calc resoult if there is two saved reaction times
	if(room.reactionTimes.length === 2) {
		calculateResoult(room);
	}
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

//updateScores
const handleScore = (winner, loser, room) => {

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

//send resoults to players and remove game room
const endGame = (room) => {
	sendResoultToPlayers(room)
	removeGameRoom(room);

	//make players leave room
	room.player1.leave(room.room)
	room.player2.leave(room.room)
	debug('Game done!')
}

//send final resoult to the players and and the match
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

//creates a game room if there is one player waiting to start
//or add player to waiting loby if no one is in the loby
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

//find and remove gameroom from gameRooms array
const removeGameRoom = (room) => {
	const filteredGameRooms = gameRooms.filter(roomInArray => roomInArray != room);
	gameRooms = [...filteredGameRooms];
}


//find game room by player socket
const getPlayersGameRoom = (player) => {
	const gameRoom = gameRooms.find(gameRoom => player === gameRoom.player1 || player === gameRoom.player2)
	return gameRoom
}

//remove player from loby or remove game room and send win to opponent
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

module.exports = function(socket) {
	socket.userName = 'Anonymus panda'
	//Set username and plase user in loby or match with another player
	socket.on('submit userName', userName => {
		//add userName
		socket.userName = userName
		debug(`${socket.userName} connected`);
		//add socket to loby or start a game
		handleLoby(socket);
	})
	socket.on('disconnect', () => {
		handleDisconnect(socket)
		debug(`${socket.userName} disconnected`)
		//forfiet match and remove from any loby
		socket.emit("disconnected", {userName: socket.userName});
	});
	
	socket.on('join', (data) => {
		debug(data);
		//send opponents username
		socket.to(data.room).broadcast.emit('player joined', data.userName)
	})

	socket.on('submit reactionTime', (reactionTime) => {
		handleReactionTime(socket, reactionTime);
	})

	socket.on('play again', () => {
		//add socket to loby or start a game
		handleLoby(socket);
	})
}
