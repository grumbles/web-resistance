/*
 * game.js - clientside scripting for game rooms
 * TODO:
 * - Add functionality
 * - A lot of this is copied from lobby.js, can this be refactored?
 */

// As before, comment/uncomment the following lines as needed for testing
// var domain = "tetramor.ph";
var domain = "localhost";

var wsuri = "ws://" + domain + ":9002";
var wampuri = "ws://" + domain + ":9001";
var pssession;
var sock;
var channel;

var username;

$(document).ready(function() {
	// Get room name
	var re = /\?([A-Za-z]*)/g
	var room = re.exec(document.URL)[1];

	// Get username from local storage
	if(Storage !== undefined) {
		if(sessionStorage.username !== undefined) {
			username = sessionStorage.username;
		} else {
			// User's name isn't set. This could happen if the user joins the
			// game from an external link instead of from the lobby
			// TODO: Deal with this?
		}
	} else {
		// User's browser doesn't support Web Storage
		// TODO: Figure out what to do now.
	}

	initWAMP(room);
	appendChat("", "Welcome to " + room + "'s room", true);
	$("#room").append(room);

	// jQuery functionality for the page
	$('#chatinput').on('keyup', function(e) {
		if(e.keyCode == 13) {
			// Do stuff when user presses Enter
			var msg = $(this).val();
			pssession.publish(channel, {'type' : 'chat', 'user' : username, 'msg' : msg});
			appendChat(username, msg, true)
			// Clear text box while we're at it
			$(this).val('');
		}		
	}).on('focus', function() {
		$(this).val('');
	});

	// DEBUG STUFF
	// voteMission();
	// voteTeam(['guy', 'dude', 'bro', 'fellow', 'thing', 'spy'], 'el capitan');
	// $('body').append('<p> username=' + username + '</p>');
	// $('body').append('<p>  room id=' + room + ' </p>');
});

/*
 * Initialize WAMP asynchronous messaging with the server
 * This calls WebSocket initialization on completion to maintain synchronization
 */
function initWAMP(room) {
	channel = "http://" + domain + "/gamechat/" + room;

	//ab.debug(true);
	ab.connect(wampuri, function(newSession) {
		console.log("WAMP connection established.");
		pssession = newSession;
		pssession.subscribe(channel, function(topic, event) {
			console.log("Got a channel message");

			switch(event.type) {
				case 'chat':
				appendChat(event.user, event.msg, false);
				break;
				
				case 'update':
				update(event.data);
				break;

				default:
				console.log('Unknown message in channel...');
				break;
			}
		});

		// Now that WAMP connection is initalized, init WebSocket
		initWS(room);
	}, function(code, reason) {
		console.log("Connection dropped... " + reason);
		pssession = null;
	});
}

/*
 * Initialize WebSocket communication with server.
 * Also sets some basic behavior - this maybe should be in another function.
 * Must be called after WAMP initialization is complete
 */
function initWS(room) {
    sock = new WebSocket(wsuri);

    sock.onopen = function() {
		console.log("connected to " + wsuri);
		sock.send(['setname', username]);
		sock.send(['getroom', room]);
    }

    sock.onclose = function(e) {
		console.log("connection closed (" + e.code + ")");
    }

    sock.onmessage = function(e) {		
		handleWS(JSON.parse(e.data));
    }
}

function handleWS(data) {
	console.log('WS data: ');
	console.log(data);

	switch(data.type) {
	case 'response':
		console.log("Server response: " + data.status);
		break;

	case 'teamvote':
		promptVote(data.team, data.captain);
		break;
		
	case 'mission':
		promptMission();
		break;
		
	case 'victory':
		break;
		
	default:
		console.log("Unrecognized message from server!");
	}
}

/*
 * Append a chat message to the log.
 */
function appendChat(user, message, highlight) {
	// Some messages should be highlighted
	var style = 'message' + (highlight? ' highlight' : '');

	// TODO: Is there a more elegant way to do this?
	$('#messagelog').prepend(
		'<tr class="' + style + '"><td>' + user + '</td><td>' + message + '</td></tr>'
	);
}

/*
 * Handle status updates from the server
 */
function update(data) {

	console.log(data);
	var plist = $('#players ul:first-child');
	plist.empty();
	plist.append('<li class="highlight"><i>Players:</i></li>');

	for(i in data.players)
		plist.append('<li>' + data.players[i] + '</li>');

	// // Pregame update
	// if(data.round == 0) {
	// 	for(player in data.players) {
	// 		console.log(player);
	// 	}
	// }
}

/*
 * Sends a message to the server that this player is ready to begin.
 */
function setReady() {
	sock.send(['ready', '']);
	$("#setready").replaceWith("<i>Waiting for other players...</i>");
	
}

/*
 * Prompt the user to vote to accept or reject a team.
 */
function voteTeam(team, captain) {
	var newPrompt = captain + " has proposed to send this team on the mission:<br>";
	for(i in team)
		newPrompt = newPrompt + (i!=0 ? ", ": "") + team[i];
	
	newPrompt = newPrompt + '<br><button id="voteyes" onclick="sendVote(\'yes\')">Approve</button> <button id="voteno" onclick="sendVote(\'no\')">Reject</button>';

	$('#prompt').empty();
	$('#prompt').append(newPrompt);
}

function sendVote(vote) {
	// sock.send(['vote', vote]);
	$('#voteyes,#voteno').remove();
	$('#prompt').append("<i>Waiting on other players to vote</i>");
}

/*
 * Prompt the user to vote to succeed or fail a mission.
 */
function voteMission() {
	var newPrompt = 'You have been selected as a member of the mission team.<br>Will you succeed or fail the mission?<br>' + 
		'<button id="voteyes" class="resist" onclick="sendVote(\'yes\')">Succeed</button> ' +
		'<button id="voteno" class="spies" onclick="sendVote(\'no\')">Fail</button>';

	$('#prompt').empty();
	$('#prompt').append(newPrompt);
}
