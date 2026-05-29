// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

// ═══════════════════════════════════════════════════════════════
//  HIGHCLASS 🍺 PONG — Smart Contract
//  © 2025 HighClass Pong. All Rights Reserved.
//  Cronos Blockchain (Chain ID: 25)
//
//  COPYRIGHT NOTICE
//  The HighClass Pong name, branding, game mechanics, and this
//  smart contract are proprietary intellectual property. Unauthorised
//  reproduction, forking for commercial use, or distribution of
//  derivative works is prohibited without written permission.
//
//  LEGAL NOTICE — READ BEFORE INTERACTING
//  By sending a transaction to this contract you irrevocably confirm:
//  • You are 18 years of age or older (or the legal age of majority
//    in your jurisdiction, whichever is higher).
//  • Cryptocurrency wagering may be restricted or prohibited in your
//    jurisdiction. You are solely responsible for determining and
//    complying with all applicable laws.
//  • Participation is entirely at your own risk. The contract operator
//    accepts no liability whatsoever for any loss of funds, winnings
//    foregone, or any other damages arising from use of this contract.
//  • All outcomes are final. No refunds are issued except via the
//    explicit cancelMatch function while a match remains OPEN.
//  • By participating you waive any right to bring legal claims against
//    the contract operator, its affiliates, or contributors.
//  • This contract operates on the public Cronos blockchain and is
//    independent of Crypto.com Exchange. Compliance with Crypto.com's
//    terms of service is the user's own responsibility.
//
//  Handles:
//  • Match betting  (5 CRO buy-in · 8 CRO payout · 2 CRO house)
//  • Tournaments    (10 CRO buy-in · 60 CRO payout · 20 CRO house)
//  • NFT badge tracking (earn after 3 tournament wins)
//  • House revenue withdrawal (owner only)
// ═══════════════════════════════════════════════════════════════

contract HighClassPong {

    // ── Reentrancy guard (inline — no external dependency) ────
    uint256 private _reentrancyStatus = 1; // 1 = not entered, 2 = entered
    modifier nonReentrant() {
        require(_reentrancyStatus != 2, "ReentrancyGuard: reentrant call");
        _reentrancyStatus = 2;
        _;
        _reentrancyStatus = 1;
    }

    // ── Owner ─────────────────────────────────────────────────
    address public owner;

    // ── Match settings ────────────────────────────────────────
    uint256 public constant MATCH_BUYIN   = 5  ether;  // 5 CRO
    uint256 public constant MATCH_PAYOUT  = 8  ether;  // 8 CRO to winner
    uint256 public constant MATCH_HOUSE   = 2  ether;  // 2 CRO to house

    // ── Tournament settings ───────────────────────────────────
    uint256 public constant TOURN_BUYIN   = 10 ether;  // 10 CRO per player
    uint256 public constant TOURN_PLAYERS = 8;          // 8 players per bracket
    uint256 public constant TOURN_POT     = 80 ether;  // total pot
    uint256 public constant TOURN_PAYOUT  = 60 ether;  // winner gets 60 CRO
    uint256 public constant TOURN_HOUSE   = 20 ether;  // house keeps 20 CRO

    // ── NFT badge tracking ────────────────────────────────────
    uint256 public constant NFT_WIN_THRESHOLD = 3;  // wins needed for badge
    mapping(address => uint256) public tournamentWins;
    mapping(address => bool)    public nftBadgeEarned;

    // ── Match struct ──────────────────────────────────────────
    enum MatchStatus { OPEN, ACTIVE, COMPLETE, CANCELLED }

    struct Match {
        address player1;
        address player2;
        uint256 pot;
        address winner;
        MatchStatus status;
        uint256 createdAt;
    }

    // ── Tournament struct ─────────────────────────────────────
    struct Tournament {
        address[8] players;
        uint256 playerCount;
        uint256 pot;
        address winner;
        bool complete;
        uint256 createdAt;
    }

    // ── Storage ───────────────────────────────────────────────
    uint256 public matchCount;
    uint256 public tournamentCount;
    uint256 public houseBalance;

    mapping(uint256 => Match)      public matches;
    mapping(uint256 => Tournament) public tournaments;
    mapping(address => uint256)    public playerWins;
    mapping(address => uint256)    public playerMatches;

    // ── Events ────────────────────────────────────────────────
    event MatchCreated(uint256 indexed matchId, address indexed player1);
    event MatchJoined(uint256 indexed matchId, address indexed player2);
    event MatchComplete(uint256 indexed matchId, address indexed winner, uint256 payout);
    event MatchCancelled(uint256 indexed matchId);

    event TournamentCreated(uint256 indexed tournId, address indexed creator);
    event TournamentJoined(uint256 indexed tournId, address indexed player, uint256 playerCount);
    event TournamentComplete(uint256 indexed tournId, address indexed winner, uint256 payout);

    event NFTBadgeEarned(address indexed player, uint256 tournamentWins);
    event HouseWithdraw(address indexed owner, uint256 amount);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // ── Modifiers ─────────────────────────────────────────────
    modifier onlyOwner() {
        require(msg.sender == owner, "Not the owner");
        _;
    }

    modifier matchExists(uint256 matchId) {
        require(matchId < matchCount, "Match does not exist");
        _;
    }

    modifier tournamentExists(uint256 tournId) {
        require(tournId < tournamentCount, "Tournament does not exist");
        _;
    }

    // ── Constructor ───────────────────────────────────────────
    constructor() {
        owner = msg.sender;
    }

    // ════════════════════════════════════════════════════════
    //  MATCH FUNCTIONS
    // ════════════════════════════════════════════════════════

    /// @notice Create a new match — send exactly 5 CRO
    function createMatch() external payable returns (uint256 matchId) {
        require(msg.value == MATCH_BUYIN, "Send exactly 5 CRO");

        matchId = matchCount; ++matchCount;
        matches[matchId] = Match({
            player1:   msg.sender,
            player2:   address(0),
            pot:       msg.value,
            winner:    address(0),
            status:    MatchStatus.OPEN,
            createdAt: block.timestamp
        });

        emit MatchCreated(matchId, msg.sender);
    }

    /// @notice Join an open match — send exactly 5 CRO
    function joinMatch(uint256 matchId)
        external payable matchExists(matchId)
    {
        Match storage m = matches[matchId];
        require(m.status == MatchStatus.OPEN,    "Match not open");
        require(m.player1 != msg.sender,          "Can't play yourself");
        require(msg.value == MATCH_BUYIN,         "Send exactly 5 CRO");

        m.player2 = msg.sender;
        m.pot    += msg.value;
        m.status  = MatchStatus.ACTIVE;

        emit MatchJoined(matchId, msg.sender);
    }

    /// @notice Declare winner — only callable by owner (game server / oracle)
    function resolveMatch(uint256 matchId, address winner)
        external onlyOwner matchExists(matchId) nonReentrant
    {
        Match storage m = matches[matchId];
        require(m.status == MatchStatus.ACTIVE, "Match not active");
        require(
            winner == m.player1 || winner == m.player2,
            "Winner must be a player"
        );

        m.winner = winner;
        m.status = MatchStatus.COMPLETE;

        houseBalance += MATCH_HOUSE;

        ++playerWins[winner];
        ++playerMatches[m.player1];
        ++playerMatches[m.player2];

        (bool sent, ) = winner.call{value: MATCH_PAYOUT}("");
        require(sent, "Payout failed");

        emit MatchComplete(matchId, winner, MATCH_PAYOUT);
    }

    /// @notice Cancel an open match and refund player1
    function cancelMatch(uint256 matchId)
        external matchExists(matchId) nonReentrant
    {
        Match storage m = matches[matchId];
        require(m.status == MatchStatus.OPEN,   "Can only cancel open matches");
        require(
            msg.sender == m.player1 || msg.sender == owner,
            "Not authorised"
        );

        m.status = MatchStatus.CANCELLED;

        (bool sent, ) = m.player1.call{value: MATCH_BUYIN}("");
        require(sent, "Refund failed");

        emit MatchCancelled(matchId);
    }

    // ════════════════════════════════════════════════════════
    //  TOURNAMENT FUNCTIONS
    // ════════════════════════════════════════════════════════

    /// @notice Create a new tournament and join as first player
    function createTournament() external payable returns (uint256 tournId) {
        require(msg.value == TOURN_BUYIN, "Send exactly 10 CRO");

        tournId = tournamentCount; ++tournamentCount;
        Tournament storage t = tournaments[tournId];
        t.players[0]  = msg.sender;
        t.playerCount = 1;
        t.pot         = msg.value;
        t.createdAt   = block.timestamp;

        emit TournamentCreated(tournId, msg.sender);
        emit TournamentJoined(tournId, msg.sender, 1);
    }

    /// @notice Join an existing tournament
    function joinTournament(uint256 tournId)
        external payable tournamentExists(tournId)
    {
        Tournament storage t = tournaments[tournId];
        require(!t.complete,              "Tournament complete");
        require(t.playerCount < 8,        "Tournament full");
        require(msg.value == TOURN_BUYIN, "Send exactly 10 CRO");

        for (uint256 i = 0; i < t.playerCount; ++i) {
            require(t.players[i] != msg.sender, "Already joined");
        }

        t.players[t.playerCount] = msg.sender;
        ++t.playerCount;
        t.pot += msg.value;

        emit TournamentJoined(tournId, msg.sender, t.playerCount);
    }

    /// @notice Declare tournament winner — owner only
    function resolveTournament(uint256 tournId, address winner)
        external onlyOwner tournamentExists(tournId) nonReentrant
    {
        Tournament storage t = tournaments[tournId];
        require(!t.complete,         "Already complete");
        require(t.playerCount == 8,  "Tournament not full");

        bool isPlayer = false;
        for (uint256 i = 0; i < 8; ++i) {
            if (t.players[i] == winner) { isPlayer = true; break; }
        }
        require(isPlayer, "Winner not in tournament");

        t.winner   = winner;
        t.complete = true;

        houseBalance += TOURN_HOUSE;

        ++tournamentWins[winner];
        ++playerWins[winner];

        if (
            tournamentWins[winner] >= NFT_WIN_THRESHOLD &&
            !nftBadgeEarned[winner]
        ) {
            nftBadgeEarned[winner] = true;
            emit NFTBadgeEarned(winner, tournamentWins[winner]);
        }

        (bool sent, ) = winner.call{value: TOURN_PAYOUT}("");
        require(sent, "Payout failed");

        emit TournamentComplete(tournId, winner, TOURN_PAYOUT);
    }

    // ════════════════════════════════════════════════════════
    //  HOUSE / OWNER FUNCTIONS
    // ════════════════════════════════════════════════════════

    /// @notice Withdraw accumulated house fees to owner wallet
    function withdrawHouse() external onlyOwner nonReentrant {
        uint256 amount = houseBalance;
        require(amount > 0, "Nothing to withdraw");
        houseBalance = 0;

        (bool sent, ) = owner.call{value: amount}("");
        require(sent, "Withdraw failed");

        emit HouseWithdraw(owner, amount);
    }

    /// @notice Transfer ownership to a new address
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    // ════════════════════════════════════════════════════════
    //  VIEW FUNCTIONS
    // ════════════════════════════════════════════════════════

    function getMatch(uint256 matchId)
        external view returns (Match memory)
    {
        return matches[matchId];
    }

    function getTournament(uint256 tournId)
        external view returns (
            address[8] memory players,
            uint256 playerCount,
            uint256 pot,
            address winner,
            bool complete
        )
    {
        Tournament storage t = tournaments[tournId];
        return (t.players, t.playerCount, t.pot, t.winner, t.complete);
    }

    function getPlayerStats(address player)
        external view returns (
            uint256 wins,
            uint256 totalMatches,
            uint256 tournWins,
            bool hasNFT
        )
    {
        return (
            playerWins[player],
            playerMatches[player],
            tournamentWins[player],
            nftBadgeEarned[player]
        );
    }

    /// @notice Check contract balance (should match pot totals)
    function contractBalance() external view returns (uint256) {
        return address(this).balance;
    }

    // ── Safety: accept plain CRO transfers ───────────────────
    receive() external payable {}
}
