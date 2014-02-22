
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
    def __init__(self, socket, username):
        self.socket = socket
        self.name = username
        self.team = Team.unaligned

    def setTeam(self, team):
        self.team = team

class Game(object):

    PREGAME = 0
    POSTGAME = 6

    def __init__(self, owner, ownername, wamp_protocol):
        self.players = []
        self.wamp_protocol = wamp_protocol
        self.gameState = Game.PREGAME
        
        self.addPlayer(owner, ownername)

    def getPlayerCount(self):
        return len(self.players)

    def addPlayer(self, user, username):
        self.players.append(Player(user, username))

    def removePlayer(self, player):
        self.players.remove(player)
