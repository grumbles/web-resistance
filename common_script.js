/*
 * common_script.js - Scripting needed by both the lobby and game
 */

var MAX_NAMELEN = 21;
var MAX_MSGLEN = 140;

/*
 * For deployment we'll be using the server's addresses, but if we're just
 * doing testing it's more convenient to run everything on your own machine.
 * Comment and uncomment the following lines as needed.
 */
var domain = "tetramor.ph";
// var domain = "localhost";

/*
 * Append a chat message to the log.
 */
function appendChat(user, message, highlight) {
	// Some messages should be highlighted
	var style = 'message' + (highlight? ' highlight' : '');

	// TODO: Is there a more elegant way to do this?
	$('#messagelog').prepend('<tr class="' + style + '"><td class="chatname" /><td class="chatmsg" /></tr>');
	$('#messagelog .chatname:first').prop('textContent', user.substring(0, MAX_NAMELEN));
	$('#messagelog .chatmsg:first').prop('textContent', message.substring(0, MAX_MSGLEN));
}
