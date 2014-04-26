/*
 * lobby.js - clientside scripting for game lobby
 * TODO:
 * - Add functionality as needed
 */

var sock = null;
var pssession = null;

var wsuri = "ws://" + domain + ":9000";
var wampuri = "ws://" + domain + ":9001";
var channel = "http://" + domain + "/lobby";

var username = null;

$(document).ready(function() {
	// initialize WAMP and WS
	initWAMP();

	// jQuery functionality for the page
	$('#chatinput').on('keyup', function(e) {
		if(e.keyCode == 13) {
			// Do stuff when user presses Enter
			if(username == null) {
				// If user's name isn't set, the chat box works as a name input
				setName($(this).val());
				// if(/^[a-z0-9]+$/i.test($(this).val())) {
				// 	setName($(this).val());
				// } else {
				// 	// Disregard non-alphanumeric input
				// 	$(this).val("Sorry, only alphanumeric characters are allowed");
				// }
			} else {
				// If user has a name, just publish messages to the chat
				var msg = $(this).val();
				pssession.publish(channel, {'type' : 'chat', 'user' : username, 'msg' : msg.substring(0, MAX_MSGLEN)});
				appendChat(username, msg, true)
			}

			// Clear text box while we're at it
			$(this).val('');
		}		
	}).on('focus', function() {
		$(this).val('');
	});
	
	$('#newgame').on('click', function() {
		sock.send(['requpdate', '']);
		window.location.href = 'game.html?' + username;
	});
});

/*
 * Initialize WAMP asynchronous messaging with the server
 * This calls WebSocket initialization on completion to maintain synchronization
 */
function initWAMP() {
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
				console.log('Unknown response from server...');
				break;
			}
		});

		// Now that WAMP connection is initalized, init WebSocket
		initWS();
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
function initWS() {
    sock = new WebSocket(wsuri);

    sock.onopen = function() {
		console.log("connected to " + wsuri);

		// After WS is established, check session storage to see if user has a name
		if(Storage !== undefined && sessionStorage.username !== undefined) {
			setName(sessionStorage.username);
			$('#chatinput').val('');
		}
		
    }

    sock.onclose = function(e) {
		console.log("connection closed (" + e.code + ")");
    }

    sock.onmessage = function(e) {
		console.log("message received: " + e.data);

		// Right now all response from the server is in reaction to naming
		// good  => name is valid, user can play now
		// taken => name is already in use by someone
		switch(e.data) {
			case 'good':
			$('#newgame').prop('disabled', false);
			break;

			case 'taken':
			username = null;
			$('#chatinput').val("Sorry, that name is taken");
			break;

			default:
			username = null;
			$('#chatinput').val("Sorry, you can't use that name");
			break;
		}
    }
}

/*
 * Sets the user's username.
 * Sets the page variable and adds the key to local storage, if possible.
 * If we do more user validation stuff in the future, this can be expanded.
 */
function setName(name) {
	username = name;
	sock.send(['setname', username]);
	if(Storage !== undefined) {
		sessionStorage.setItem("username", username);
	} else {
		// User's browser doesn't support Web Storage
		// TODO: Figure out what to do now.
	}
}

/*
 * Updates the games list with event data from the server.
 * Called when an 'update' message is recieved.
 */
function update(data) {
	console.log(data);
	// First, empty out the current list
	$('#gamelist').empty();
	
	// Add each game to the list
	for(var i in data) {
		var style = 'game' + (i%2==0? ' highlight' : '');
		$('#gamelist').prepend(
			'<li class="' + style + '">' + (+data[i][1]) + '/10 - <a href=game.html?' + data[i][0] + '>' + data[i][0] + "'s room</a></li>"
		);
	}
	
}
