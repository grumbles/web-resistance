var sock = null;
var pssession = null;

/*
 * For deployment we'll be using the server's addresses, but if we're just
 * doing testing it's more convenient to run everything on your own machine.
 * Comment and uncomment the following lines as needed.
 */
// var wsuri = "ws://tetramor.ph:9000";
// var wampuri = "ws://tetramor.ph:9001";
// var channel = "http://tetramor.ph/lobby";
var wsuri = "ws://localhost:9000";
var wampuri = "ws://localhost:9001";
var channel = "http://localhost/lobby";

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
				username = $(this).val();
				sock.send(['setname', username]);
			} else {
				// If user has a name, just publish messages to the chat
				var msg = $(this).val();
				pssession.publish(channel, {'type' : 'chat', 'user' : username, 'msg' : msg});
				appendChat(username, msg, true)
			}

			// Clear text box while we're at it
			$(this).val('');
		}		
	}).on('focus', function() {
		$(this).val('');
	});
	
	$('#newgame').on('click', function() {
		sock.send('makeroom');
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

/*
 * Updates the games list with event data from the server.
 * Called when an 'update' message is recieved.
 */
function update(data) {
	// First, empty out the current list
	$('#gamelist').empty();
	
	// Add each game to the list
	for(var i in data) {
		var style = 'game' + (i%2==0? ' highlight' : '');
		$('#gamelist').prepend(
			'<li class="' + style + '">' + (+data[i][1]) + '/10 - ' + data[i][0] + "'s room</li>"
		);
	}
	
}
