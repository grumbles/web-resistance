/*
 * game.js - clientside scripting for game rooms
 * TODO:
 * - Add functionality
 * - A lot of this is copied from lobby.js, can this be refactored?
 */

// As before, comment/uncomment the following lines as needed for testing
// var domain = "tetramor.ph";
var domain = "localhost";

var wsuri = "ws://" + domain + ":9000";
var wampuri = "ws://" + domain + ":9001";
var pssession;
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
	$('body').append('<p> username=' + username + '</p>');
	$('body').append('<p>  room id=' + room + ' </p>');
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

				default:
				console.log('Unknown response from server...');
				break;
			}
		});

		// Now that WAMP connection is initalized, init WebSocket
//		initWS();
	}, function(code, reason) {
		console.log("Connection dropped... " + reason);
		pssession = null;
	});
}

/*
 * Append a chat message to the log.
 */
function appendChat(user, message, highlight) {
	// Some messages should be highlighted
	var style = 'message' + (highlight? ' highlight' : '');

	// TODO: Is there a more elegant way to do this?
	$('#messagelog').append(
		'<tr class="' + style + '"><td>' + user + '</td><td>' + message + '</td></tr>'
	);
}
