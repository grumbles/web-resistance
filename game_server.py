import json
from autobahn.twisted.websocket import WebSocketServerProtocol, \
                                       WebSocketServerFactory, \
                                       listenWS

import random

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
        self.team = 'resistance'
        self.vote = None
        self.ready = False

    def setTeam(self, team):
        self.team = team

    def markReady(self):
        self.ready = True
        print(self.name + " marked as ready to begin!")
        self.game.tryStart()

    def setVote(self, votestr):
        """
        Parse a string to set the player's vote status
        I'm currently overloading this for mission success too
        It's basically the same operation
        """
        if votestr == 'yes':
            self.vote = True
        elif votestr == 'no':
            self.vote = False
        else:
            self.vote = None

    def hasVoted(self):
        return self.vote != None

    def sendData(self, data):
        self.socket.sendMessage(json.dumps(data))

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
                # Client informs us of this user's name
                self.username = part[2]  
            elif part[0] == 'getroom':
                # User wants to join a room; try and report on status
                response = self.factory.addToRoom(self, self.username, part[2])
                self.sendMessage(json.dumps({'type' : 'response', 'status' : response}))
            elif part[0] == 'ready':
                # Player says they're ready to start
                self.player.markReady()
            elif part[0] == 'team':
                # Player has selected a mission team
                self.player.game.tryTeam(part[2].split(','), self.player)
            elif part[0] == 'vote':
                # Player has voted on something
                self.player.setVote(part[2])
                self.player.game.checkTeamVotes()
            elif part[0] == 'mission':
                # Player has voted on mission outcome
                self.player.setVote(part[2])
                self.player.game.checkMission()
            else:
                print("Malformed command:", payload, "from", self.peer)

    def connectionLost(self, reason):
        WebSocketServerProtocol.connectionLost(self, reason)
        if hasattr(self, 'player'):
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

    REJECT_LIMIT = 5
    POINTS_TO_WIN = 3

    def __init__(self, owner, ownername, wampdispatch, gamechannel):
        self.players = []
        self.wampdispatch = wampdispatch
        self.channel = gamechannel + ownername
        self.gameState = Game.PREGAME
        self.rejectCount = 0;
        self.missionList = []
        self.missionTeam = None
        self.roomName = ownername
        self.addPlayer(owner, ownername)

    def getPlayerCount(self):
        return len(self.players)

    def addPlayer(self, user, username):
        if self.gameState == Game.PREGAME:
            if self.getPlayerCount() < Game.MAX_PLAYERS:
                print("Adding player " + username + " to room " + self.roomName)
                self.players.append(Player(user, username, self))
                self.pushUpdate()
                return 'ok'
            else:
                self.pushUpdate()
                return 'full'
        else:
            self.pushUpdate()
            return 'closed'

    def removePlayer(self, player):
        self.players.remove(player)
        self.pushUpdate()
        if self.getPlayerCount() < 0:
            self.destroy()

    def pushUpdate(self):
        """
        Dispatch a game update through the pubsub channel
        """
        print("Pushing update to server!")
        update = {'room': self.roomName,
                  'state': self.missionList,
                  'rejects': self.rejectCount,
                  'players': [ str(p) for p in self.players]}
        self.wampdispatch(self.channel, {'type': 'update', 'data': update})

    def tryStart(self):
        """
        If all players are ready, start the game.
        Called each time a player is marked as ready.
        """
        if all([p.ready for p in self.players]) \
           and len(self.players) >= Game.MIN_PLAYERS and len(self.players) <= Game.MAX_PLAYERS:
            self.startGame()

    def startGame(self):
        """
        Begin game logic.
        """

        if len(self.players) == 5:
            spyNum = 2
            self.missionList = ['2','3','2','3','3']
        elif len(self.players) == 6:
            spyNum = 2
            self.missionList = ['2','3','4','3','3']
        elif len(self.players) == 7:
            spyNum = 3
            self.missionList = ['2','3','3','4*','4']
        elif len(self.players) == 8:
            spyNum = 3
            self.missionList = ['3','4','4','5*','5']
        elif len(self.players) == 9:
            spyNum = 3
            self.missionList = ['3','4','4','5*','5']
        elif len(self.players) == 10:
            spyNum = 4
            self.missionList = ['3','4','4','5*','5']
        else:
            print("INCORRECT NUMBER OF PLAYERS!")

        spies = set()
        while len(spies) < spyNum:
            spies.add(random.choice(self.players))

        self.spies = [n for n in spies]

        for n in self.spies:
            n.setTeam('spies')

        for n in self.players:
            info = ([str(s) for s in self.spies] if n.team == 'spies' else len(self.spies))
            n.sendData({'type': 'setteam', 'team': n.team, 'info': info })

        self.gameState = 1
        self.captain = 0
        self.rejectCount = Game.REJECT_LIMIT

        self.pushUpdate()
        self.logGameEvent('The game is starting, good luck!')

        self.promptTeamSelect()

        print("Waiting for team selection...")

    def getMissionSize(self):
        return int(self.missionList[self.gameState - 1][0])

    def isMissionSpecial(self):
        return ('*' in self.missionList[self.gameState - 1])

    def tryTeam(self, team, source):
        """
        A player has selected a mission team.
        Make sure the team is valid and the selector is the current captain.
        """
        
        if len(team) == self.getMissionSize() \
           and source == self.players[self.captain]:
            self.startTeamVote(team, str(source))

    def shiftCaptain(self):
        self.captain = (self.captain + 1) % len(self.players)

    def promptTeamSelect(self):
        """
        Prompt the current team captain to select a team.
        """
        cap = self.players[self.captain]
        self.logGameEvent(str(cap) + " is now picking a team for the mission.")
        if self.isMissionSpecial():
            self.logGameEvent("This is a special mission, and cannot fail unless at least two team members fail it!")
        cap.sendData({'type': 'pickteam',
                      'size': self.getMissionSize(),
                      'players': [str(p) for p in self.players]})
        

    def startTeamVote(self, team, captain):
        """
        Initiate a team vote among the players
        """
        com = {'type': 'teamvote', 'team': team, 'captain': captain}
        self.shiftCaptain()
        self.missionTeam = [p for p in self.players if str(p) in team]
        self.logGameEvent(captain + " has picked " + ', '.join(team))
        print("Starting team vote...")
        for p in self.players:
            p.setVote(None)
            p.sendData(com)

    def startMission(self):
        for p in self.missionTeam:
            p.setVote(None)
            p.sendData({'type': 'mission', 'special': self.isMissionSpecial()})

    def checkTeamVotes(self):
        """
        Check to see if all players have voted
        If so, tally the votes and act on result
        """
        print("TEAM vote status: " + str([p.vote for p in self.players]))
        if all([p.hasVoted() for p in self.players]) and self.gameState > 0:
            approvers = [str(p) for p in self.players if p.vote == True]
            rejectors = [str(p) for p in self.players if p.vote == False]
            for p in self.players:
                p.setVote(None)

            self.logGameEvent((', '.join(rejectors) if rejectors else "No players") + " voted to reject the team.")
            self.logGameEvent((', '.join(approvers) if approvers else "No players") + " voted to approve the team.")
            if len(approvers) > len(rejectors):
                #Team approved
                self.rejectCount = Game.REJECT_LIMIT
                self.logGameEvent("The team has been cleared for the mission!")
                self.pushUpdate()
                self.startMission()
            else:
                #Team rejected
                self.missionTeam = None
                self.rejectCount -= 1
                if self.rejectCount <= 0:
                    #Spies win
                    #TODO: Victory states
                    print("Spies win, do something about it.")
                    self.logGameEvent("Unable to agree on a team, the Resistance succumbs to petty squabbles. Spies win!");
                    self.notifyWinners('spies');
                else:
                    r = ' rejection' if self.rejectCount == 1 else ' rejections'
                    self.logGameEvent("The team has been rejected. " + str(self.rejectCount) + r + " remain before Spies win.")
                    self.pushUpdate()
                    self.promptTeamSelect()

    def checkMission(self):
        """
        Check to see if all mission team members have voted
        If so, tally the votes and act on result
        """
        print("MISSION status:" + str([p.vote for p in self.players]))
        if all([p.hasVoted() for p in self.missionTeam]) and self.missionTeam != None:
            successes = sum([p.vote for p in self.missionTeam])
            failures = len(self.missionTeam) - successes
            for p in self.players:
                p.setVote(None)

            s = ' success' if successes == 1 else ' successes'
            f = ' failure.' if failures == 1 else ' failures.'
            self.logGameEvent("Mission complete... With " + str(successes) + s + " and " + str(failures) + f)
            
            #TODO: Something must be done about special missions here...
            maxFailures = 1 if self.isMissionSpecial() else 0
            if failures <= maxFailures:
                #Mission success
                self.missionList[self.gameState - 1] = 'R'
                self.logGameEvent("Mission successful! Resistance takes the point.")
            else:
                #Fission Mailed!
                self.missionList[self.gameState - 1] = 'S'
                self.logGameEvent("Mission failure! Spies take the point.")

            self.checkVictory()

    def checkVictory(self):
        """
        Check if any alignment has won the game, and act accordingly
        Called after each mission tally, so performs some cleanup too
        """

        self.gameState += 1
        self.pushUpdate()

        if self.missionList.count('R') >= Game.POINTS_TO_WIN:
            #Resistance victory!
            self.logGameEvent("The Resistance is victorious! Death to the empire!")
            self.notifyWinners('resistance')
        elif self.missionList.count('S') >= Game.POINTS_TO_WIN:
            #Spies victory!
            self.logGameEvent("The Spies are victorious! Glory to the empire!")
            self.notifyWinners('spies')
        else:
            #We're all losers!
            self.logGameEvent("Prepare for mission " + str(self.gameState) + "...")
            self.promptTeamSelect()


    def notifyWinners(self, winner):
        com = {'type': 'victory', 'winner': winner, 'spies': [str(p) for p in self.spies]}
        for p in self.players:
            p.sendData(com)

    def logGameEvent(self, message):
        """
        Log a noteworthy game event in the pubsub channel
        """
        self.wampdispatch(self.channel, {'type': 'event', 'msg': message})

    def destroy(self):
        # Callback on game end
        pass
