/*
 * game.js - clientside scripting for game rooms
 */

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
			self.location="lobby.html";
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
	// notifyTeam('spies', ['spy','spyer','the spyest']);
	// notifyTeam('resistance', 4);
	// setMission(1, 'S');
	// setMission(2, '2');
	// setMission(3, 'R');
	// setMission(4, '13');
	// voteMission();
	// selectTeam(5, ['guy', 'dude', 'bro', 'fellow', 'thing', 'spy', 'other guy']);
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

				case 'event':
				appendChat('', event.msg, true);
				$('#messagelog .message:first .chatmsg').css('font-style', 'italic');
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

	case 'setteam':
		notifyTeam(data.team, data.info);
		break;

	case 'pickteam':
		selectTeam(data.size, data.players);
		break;

	case 'teamvote':
		voteTeam(data.team, data.captain);
		break;
		
	case 'mission':
		promptMission(data.special);
		break;
		
	case 'victory':
		notifyVictory(data.winner, data.spies);
		break;
		
	default:
		console.log("Unrecognized message from server!");
	}
}

/*
 * Handle status updates from the server
 * Takes an update data object as an argument
 * Which has the following properties: room, state, rejects, players
 */
function update(data) {

	console.log(data);
	var plist = $('#players ul:first-child');
	plist.empty();
	plist.append('<li class="highlight"><i>Players:</i></li>');

	for(i in data.players) {
		plist.append('<li class="playername" />');
		$('#players .playername:last').prop('textContent', data.players[i].substring(0, MAX_NAMELEN));
	}

	for(var i = 0; i < data.state.length; i++)
		setMission(i, data.state[i]);

	$('#rejectbox').remove();
	if(data.rejects != 0) {
		var r;
		if(data.rejects == 1)
			r = 'rejection';
		else
			r = 'rejections';
		$('#statusbar').append("<div id='rejectbox' align='center'><div style='font-size:20px; height:25px; width:25px;' class='light'>" +
							   data.rejects + "</div>Team " + r + "<br>remaining</div>");
	}
}

/*
 * Sends a message to the server that this player is ready to begin.
 */
function setReady() {
	$("#prompt").append('<i hidden>Waiting on other players...</i>');
	$("#setready").fadeOut(400, function() {
		$("#prompt i").fadeIn(400);
		sock.send(['ready', '']);
	});
}

/*
 * Add a notification to telling the user what team they're on.
 */
function notifyTeam(team, info) {
	var prompt = "ERROR! Couldn't get team assignment!";

	switch(team) {
	case 'spies':
		prompt = "<button class=\"hideshow\">Show/Hide Alignment</button><div class=\"spies\" hidden>You are a <i>Spy</i>. Your goal is to <i>fail</i> three of the five missions. The spies in this game are:<br>";
		for(i in info)
			prompt += (i!=0? ', ' : '') + info[i];
		prompt += "<br>Do not allow the <span style='color:#00c;'>Resistance</span> to discover your identity.</div>";
		break;

	case 'resistance':
		prompt = "<button class=\"hideshow\">Show/Hide Alignment</button><div class=\"resist\" hidden>You are on the <i>Resistance</i>. Your goal is to <i>succeed</i>  three of the five missions.<br> " + info + " of your fellow players are secretly <span style='color:#c00;'>Spies</span>, who wish to sabotage your missions.<br>Do not allow the <span style='color:#c00;'>Spies</span> to win.</div>";
		break;
	default:
		console.log("Malformed team assignment! " + team + " " + info);
	}

	$('#pregame').replaceWith(prompt);
	$('#statusbar [hidden]').fadeIn(2000);
	$('button.hideshow').click(function() {
		$('div.spies, div.resist').toggle(1000);
	});
	
}

/*
 * Prompt the user to vote to accept or reject a team.
 */
function voteTeam(team, captain) {
	var newPrompt = '<div hidden>' + captain + " has proposed to send this team on the mission:<br>";
	for(i in team)
		newPrompt += (i!=0 ? ", ": "") + team[i].substring(0, MAX_NAMELEN);
	
	newPrompt += '</div><div class="votebuttons" hidden><button id="voteyes" onclick="sendVote(\'yes\', \'vote\')">Approve</button> <button id="voteno" onclick="sendVote(\'no\', \'vote\')">Reject</button></div>';

	$('#prompt').empty();
	$('#prompt').append(newPrompt);
	$('#prompt div:first-child').fadeIn(400, function () {
		$('.votebuttons').fadeIn(400);
	});
}

function sendVote(vote, type) {
	$('#prompt div:first').fadeOut(400);
	$('#prompt .votebuttons').fadeOut(400, function() {
		$("#prompt").append('<i hidden>Waiting on other players...</i>');
		$("#prompt i").fadeIn(400);
		sock.send([type, vote]);
	});
}

/*
 * Prompt the user to vote to succeed or fail a mission.
 */
function promptMission(special) {
	var newPrompt = '<div hidden>You have been selected as a member of the mission team.<br>Will you succeed or fail the mission?<br>' +
		(special? '<i>This mission requires at least two failure votes to fail.</i>' : '') +
		'</div><div class="votebuttons" hidden>' + 
		'<button id="voteyes" class="resist" onclick="sendVote(\'yes\', \'mission\')">Succeed</button> ' +
		'<button id="voteno" class="spies" onclick="sendVote(\'no\', \'mission\')">Fail</button></div>';

	$('#prompt').empty();
	$('#prompt').append(newPrompt);
	$('#prompt div:first').fadeIn(400, function () {
		$('.votebuttons').fadeIn(400);
	});
}

/*
 * Prompt the user to select a team to go on a mission.
 */
function selectTeam(size, players) {
	var newPrompt = '<div hidden>You must select <span id="teamcount">' + size + '</span> players to go on the mission.</div><div id="teamlist" hidden>';
	
	for(i in players) {
		newPrompt += '<button onClick="selectPlayer(\'' + players[i] + '\')">' + players[i] + '</button> ';
	}
	newPrompt += '</div>';

	$('#prompt').empty();
	$('#prompt').append(newPrompt);
	$('#prompt div:first').fadeIn(400, function() {
		$(this).next().fadeIn(400);
	});
}

function selectPlayer(playername) {
	var teamcount = parseInt($('#teamcount').text());
	var button = $('#teamlist button').filter(function() {
		return $(this).text() == playername;
	});
	
	if(button.hasClass('teamSelect')) {
		button.removeClass('teamSelect');
		teamcount++;
	} else {
		button.addClass('teamSelect');
		teamcount--;
	}

	if(teamcount <= 0) {
		var team = $.map($('.teamSelect'), function(e) {
			return $(e).text();
		});
		console.log("Sending team: " + team);
		
		$('#teamlist button:not(.teamSelect)').fadeOut();
		$('#prompt div:first').fadeOut(400, function() {
			sock.send(['team', team]);
		});
	} else {
		$('#teamcount').text(teamcount);
	}
}

function setMission(index, value) {
	var mission = $('#state .mission:nth-child(' + (index+1) + ')');

	switch(value) {
	case 'S':
		mission.addClass('spies');
		break;
	case 'R':
		mission.addClass('resist');
		break;
	}
	mission.text(value);
}

/*
 * Notify the player when the game is won by either team
 */
function notifyVictory(winner, spies) {
	var prompt = $('#prompt');
	switch(winner) {
	case 'spies':
		prompt.empty();
		prompt.addClass('spies');
		prompt.append("The Resistance has failed. Spies are victorious!");
		break;

	case 'resistance':
		prompt.empty();
		prompt.addClass('resist');
		prompt.append("The Spies have failed. The Resistance is victorious!");
		break;
	}

	$('#players li:not(.highlight)').filter(function() {
		return $.inArray($(this).text(), spies) != -1;
	}).addClass("spies");

	$('#players li:not(.spies,.highlight)').addClass("resist");
	
}
