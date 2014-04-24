
from autobahn.twisted.websocket import WebSocketServerProtocol, \
                                       WebSocketServerFactory, \
                                       listenWS

class Team:
    """
    Possible team alignments for players. These are effectively enums.
    Actual enum support will be added in Python 3.4 and has been backported,
    but we're doing this for compatability.
    """
    UNALIGNED = 0
    RESISTANCE = 1
    SPY = 2

class Player(object):
    """
    Player object as it's handled in games.
    Contains game data relevant to this player, and methods to handle it.
    """
    def __init__(self, socket, username, game):
        self.socket = socket
        socket.setPlayer(self)
        self.name = username
        self.game = game
        self.team = Team.UNALIGNED

    def setTeam(self, team):
        self.team = team

    def sendData(self, data):
        self.socket.sendMessage(data)

    def destroy(self):
        """ Callback on user disconnect """
        self.game.removePlayer(self)

    def __str__(self):
        return self.name

class PlayerSocketProtocol(WebSocketServerProtocol):
    """
    WebSocket protocol for handling players.
    Handles private communication between a player and the server.
    """
    def onConnect(self, request):
        self.sendMessage("Player socket established")
        # Assign a temporary name because I'm kind of worried about race conditions
        self.username = "anonymous"
        WebSocketServerProtocol.onConnect(self, request)

    def onMessage(self, payload, isBinary):
        """
        Parse and respond to commands from the player.
        The payload is a JS list, formatted here as a comma-delimited string.
        The first field is a command and the rest is an argument.
        """
        if not isBinary:
            part = payload.partition(',')
            
            if part[0] == 'setname':
                self.username = part[2]  
            elif part[0] == 'getroom':
                response = self.factory.addToRoom(self, self.username, part[2])
                self.sendMessage(response)
            else:
                print("Malformed command:", payload, "from", self.peer)

    def connectionLost(self, reason):
        WebSocketServerProtocol.connectionLost(self, reason)
        self.player.destroy()

    def setPlayer(self, player):
        self.player = player

class PlayerSocketFactory(WebSocketServerFactory):
    def __init__(self, url, gameList, updateLobby, wampdispatch, gamechannel, debug = False, debugCodePaths = False):
        WebSocketServerFactory.__init__(self, url, debug = debug, \
                                        debugCodePaths = debugCodePaths)
        self.gameList = gameList
        self.wampdispatch = wampdispatch
        self.gamechannel = gamechannel
        self.updateLobby = updateLobby

    def addToRoom(self, user, username, room):
        """
        Add a user to a given room.
        If the room exists and isn't full, add the user to it and return 'ok'
        If the room exists but is full, return 'full'.
        If the room doesn't exist, create it and return 'ok
        """
        response = "failure"

        if room in self.gameList.keys():
            response = self.gameList[room].addPlayer(user, username)
        else:
            print("Making new game room: " + room)
            self.gameList[room] = Game(user, username, self.wampdispatch, self.gamechannel)
            response = 'ok'
            
        self.updateLobby()
        return response

class Game(object):

    PREGAME = 0
    POSTGAME = 6

    MIN_PLAYERS = 5
    MAX_PLAYERS = 10

    def __init__(self, owner, ownername, wampdispatch, gamechannel):
        self.players = []
        self.wampdispatch = wampdispatch
        self.channel = gamechannel + ownername
        self.gameState = Game.PREGAME
        
        self.roomName = ownername
        self.addPlayer(owner, ownername)

    def getPlayerCount(self):
        return len(self.players)

    def addPlayer(self, user, username):
        if self.getPlayerCount() < Game.MAX_PLAYERS:
            print("Adding player " + username + " to room " + self.roomName)
            self.players.append(Player(user, username, self))
            self.pushUpdate()
            return 'ok'
        else:
            return 'full'

    def removePlayer(self, player):
        self.players.remove(player)
        if self.getPlayerCount() < 0:
            self.destroy()

    # def pushUpdate(self):
    #     print("Pushing update to players")

    #     update = {'room': self.roomName,
    #               'state': self.gameState,
    #               'players': self.players}
    #     for player in self.players:
    #         player.sendData(update)

    def pushUpdate(self):
        """
        Dispatch a game update through the pubsub channel
        """
        print("Pushing update to server!")
        update = {'type': 'update',
                  'room': self.roomName,
                  'state': self.gameState,
                  'players': [ str(p) for p in self.players]}
        self.wampdispatch(self.channel, {'type': 'update', 'data': update})


    def destroy(self):
        # Callback on game end
        pass
