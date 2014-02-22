#!./virt_env/bin/python

import game_server

from twisted.internet import reactor
from twisted.web.server import Site
from twisted.web.static import File

from autobahn.wamp1.protocol import WampServerFactory, \
                                    WampServerProtocol
from autobahn.twisted.websocket import WebSocketServerProtocol, \
                                       WebSocketServerFactory, \
                                       listenWS

"""
For deployment we'll be using the server's addresses, but if we're just
doing testing it's more convenient to run everything on your own machine.
Comment and uncomment the following lines as needed.
"""
# domain = "tetramor.ph"
domain = "localhost"

print("Using domain: " + domain)
lobbychannel = "http://%s/lobby" % domain
gamechannel = "http://%s/gamechat/" % domain
wampuri = "ws://%s:9001" % domain
wsuri = "ws://%s:9000" % domain

class PubSubProtocol(WampServerProtocol):
    """
    A pub/sub server that performs two functions: allows for chat between
    clients, and publishes updates to lobby data.
    """

    def onSessionOpen(self):
        self.registerForPubSub(lobbychannel)
        self.registerForPubSub(gamechannel, True)

class LobbyDataProtocol(WebSocketServerProtocol):
    """
    A websocket for individual clients to push lobby data to the server.
    """
    def onConnect(self, request):
        self.sendMessage("Server socket established")

        # Push an update for the new user.
        # This is inefficient so fix it if it becomes a problem.
        self.factory.pushUpdate()
        WebSocketServerProtocol.onConnect(self, request)

    def onMessage(self, payload, isBinary):
        """
        Parse and respond to commands from the client.
        The payload is a JS list which is formatted here as a comma-delimited string.
        The first field is a command and the rest is the argument.
        Change this as needed but make sure the frontend knows!
        """
        if not isBinary:
            part = payload.partition(',')

            if part[0] == 'setname':
                response = self.factory.register(self, part[2])
                self.sendMessage(response)
            elif part[0] == 'makeroom':
                self.factory.makeRoom(self)
            else:
                print("Malformed command:", payload, "from", self.peer)

    def connectionLost(self, reason):
        WebSocketServerProtocol.connectionLost(self, reason)
        self.factory.deregister(self)

class LobbyDataFactory(WebSocketServerFactory):
    def __init__(self, url, wampdispatch, debug = False, debugCodePaths = False):
        WebSocketServerFactory.__init__(self, url, debug = debug, \
                                        debugCodePaths = debugCodePaths)
        self.users = {None : 'Server'}   # A map of users to their usernames
        self.rooms = []                  # List of active rooms
        self.wampdispatch = wampdispatch # Dispatch method for our pub/sub

    def register(self, user, username):
        """
        Try to register a username to a user.
        
        Returns:
            'good':      if the requested username is allowed
            'taken':     if the username is already being used by another user
            'collision': if the user already has a username - this shouldn't happen
        """
        if not user in self.users:
            if not username in self.users.values():
                print("Registering user", user.peer, "as", username)
                self.users[user] = username
                self.wampdispatch(lobbychannel, {'type':'chat', 'user':'Server', 'msg':(username + ' has joined.')})
                return 'good'
            else:
                return 'taken'
        else:
            return 'collision'

    def deregister(self, user):
        """ Just takes the username out of the registry when the user leaves """
        if user in self.users:
            print("Deregistering user", self.users[user])
            del self.users[user]

    def makeRoom(self, user):
        """
        Create a game room for the user.
        TODO: All of this. Right now it just uses a tuple as a placeholder.
        """
        if user in self.users.keys():
#            self.wamp_protocol.registerGameRoom(users[user])
            self.rooms.append((self.users[user], 0))
            self.pushUpdate()
            
    def pushUpdate(self):
        """
        Dispatch an update to the lobby channel
        This update contains a complete list of active game rooms
        """
        print("Pushing update to server!")
        self.wampdispatch(lobbychannel, {'type': 'update', 'data' : self.rooms})

if __name__ == '__main__':
    import sys

    from twisted.python import log

    log.startLogging(sys.stdout)

    # Initialize pub/sub factory
    psfactory = WampServerFactory(wampuri, debugWamp = True)
    psfactory.protocol = PubSubProtocol
    listenWS(psfactory)

    # Initialize client socket factory
    clientfactory = LobbyDataFactory(wsuri, psfactory.dispatch, debug = False)
    clientfactory.protocol = LobbyDataProtocol
    
    # Initialize web server factory on port 8080
    # We're not using this yet but maybe we will in the future?
#    webfactory = Site(File('.'))
#    reactor.listenTCP(8080, webfactory)

    # Start the reactor!
    # Because I'm a professional, I'm not going to quote Total Recall here...
    reactor.listenTCP(9000, clientfactory)
    reactor.run()
