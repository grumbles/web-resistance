/*
 * common_script.js - Scripting needed by both the lobby and game
 */


var COMMON = (function() {
	var map = {
		'MAX_NAMELEN': '21',
		'MAX_MSGLEN': '140',
		'MSG_DELAY': '700',
		//'DOMAIN': 'tetramor.ph'
		'DOMAIN': 'localhost'
	};

	return {
		get: function(key) { return map[key]; }
	};
})();

/*
 * Append a chat message to the log.
 */
function appendChat(user, message, highlight) {
	// Some messages should be highlighted
	var style = 'message' + (highlight? ' highlight' : '');

	// TODO: Is there a more elegant way to do this?
	$('#messagelog').prepend('<tr class="' + style + '"><td class="chatname" /><td class="chatmsg" /></tr>');
	$('#messagelog .chatname:first').prop('textContent', user.substring(0, COMMON.get('MAX_NAMELEN')));
	$('#messagelog .chatmsg:first').prop('textContent', message.substring(0, COMMON.get('MAX_MSGLEN')));
}
