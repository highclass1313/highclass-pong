// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/HighClassPong.sol";

contract HighClassPongTest is Test {
    HighClassPong pong;

    address owner   = address(this);
    address p1      = makeAddr("p1");
    address p2      = makeAddr("p2");

    uint256 constant MATCH_BUYIN  = 5  ether;
    uint256 constant MATCH_PAY    = 8  ether;
    uint256 constant MATCH_HOUSE  = 2  ether;
    uint256 constant TOURN_BUYIN  = 10 ether;
    uint256 constant TOURN_PAY    = 60 ether;
    uint256 constant TOURN_HOUSE  = 20 ether;

    function setUp() public {
        pong = new HighClassPong();
        vm.deal(p1, 1000 ether);
        vm.deal(p2, 1000 ether);
    }

    // ── Helpers ───────────────────────────────────────────────

    function _createAndJoinMatch() internal returns (uint256 matchId) {
        vm.prank(p1);
        matchId = pong.createMatch{value: MATCH_BUYIN}();
        vm.prank(p2);
        pong.joinMatch{value: MATCH_BUYIN}(matchId);
    }

    // Fills a tournament with 8 unique addresses and returns it.
    function _fillTournament() internal returns (uint256 tournId, address[8] memory players) {
        players[0] = p1;
        for (uint256 i = 1; i < 8; i++) {
            players[i] = makeAddr(string(abi.encodePacked("tp", i)));
            vm.deal(players[i], 100 ether);
        }
        vm.prank(players[0]);
        tournId = pong.createTournament{value: TOURN_BUYIN}();
        for (uint256 i = 1; i < 8; i++) {
            vm.prank(players[i]);
            pong.joinTournament{value: TOURN_BUYIN}(tournId);
        }
    }

    // ── Match ─────────────────────────────────────────────────

    function test_CreateMatch() public {
        vm.prank(p1);
        uint256 matchId = pong.createMatch{value: MATCH_BUYIN}();

        assertEq(matchId, 0);
        assertEq(pong.matchCount(), 1);

        HighClassPong.Match memory m = pong.getMatch(0);
        assertEq(m.player1, p1);
        assertEq(m.pot, MATCH_BUYIN);
        assertEq(uint8(m.status), uint8(HighClassPong.MatchStatus.OPEN));
    }

    function test_CreateMatch_WrongValue() public {
        vm.prank(p1);
        vm.expectRevert("Send exactly 5 CRO");
        pong.createMatch{value: 4 ether}();
    }

    function test_JoinMatch() public {
        vm.prank(p1);
        uint256 matchId = pong.createMatch{value: MATCH_BUYIN}();

        vm.prank(p2);
        pong.joinMatch{value: MATCH_BUYIN}(matchId);

        HighClassPong.Match memory m = pong.getMatch(matchId);
        assertEq(m.player2, p2);
        assertEq(m.pot, MATCH_BUYIN * 2);
        assertEq(uint8(m.status), uint8(HighClassPong.MatchStatus.ACTIVE));
    }

    function test_JoinMatch_CantPlayYourself() public {
        vm.startPrank(p1);
        uint256 matchId = pong.createMatch{value: MATCH_BUYIN}();
        vm.expectRevert("Can't play yourself");
        pong.joinMatch{value: MATCH_BUYIN}(matchId);
        vm.stopPrank();
    }

    function test_JoinMatch_NotOpen() public {
        uint256 matchId = _createAndJoinMatch();

        address p3 = makeAddr("p3");
        vm.deal(p3, 10 ether);
        vm.prank(p3);
        vm.expectRevert("Match not open");
        pong.joinMatch{value: MATCH_BUYIN}(matchId);
    }

    function test_ResolveMatch_PayoutAndHouse() public {
        uint256 matchId = _createAndJoinMatch();
        uint256 p1Before = p1.balance;

        pong.resolveMatch(matchId, p1);

        assertEq(p1.balance, p1Before + MATCH_PAY);
        assertEq(pong.houseBalance(), MATCH_HOUSE);
        assertEq(pong.playerWins(p1), 1);
        assertEq(pong.playerMatches(p1), 1);
        assertEq(pong.playerMatches(p2), 1);

        HighClassPong.Match memory m = pong.getMatch(matchId);
        assertEq(uint8(m.status), uint8(HighClassPong.MatchStatus.COMPLETE));
        assertEq(m.winner, p1);
    }

    function test_ResolveMatch_OnlyOwner() public {
        uint256 matchId = _createAndJoinMatch();
        vm.prank(p1);
        vm.expectRevert("Not the owner");
        pong.resolveMatch(matchId, p1);
    }

    function test_ResolveMatch_WinnerMustBePlayer() public {
        uint256 matchId = _createAndJoinMatch();
        vm.expectRevert("Winner must be a player");
        pong.resolveMatch(matchId, makeAddr("stranger"));
    }

    function test_CancelMatch_Refund() public {
        vm.prank(p1);
        uint256 matchId = pong.createMatch{value: MATCH_BUYIN}();
        uint256 p1Before = p1.balance;

        vm.prank(p1);
        pong.cancelMatch(matchId);

        assertEq(p1.balance, p1Before + MATCH_BUYIN);
        assertEq(uint8(pong.getMatch(matchId).status), uint8(HighClassPong.MatchStatus.CANCELLED));
    }

    function test_CancelMatch_OwnerCanCancel() public {
        vm.prank(p1);
        uint256 matchId = pong.createMatch{value: MATCH_BUYIN}();
        pong.cancelMatch(matchId); // called as owner (address(this))
        assertEq(uint8(pong.getMatch(matchId).status), uint8(HighClassPong.MatchStatus.CANCELLED));
    }

    function test_CancelMatch_ActiveReverts() public {
        uint256 matchId = _createAndJoinMatch();
        vm.expectRevert("Can only cancel open matches");
        pong.cancelMatch(matchId);
    }

    // ── Tournament ────────────────────────────────────────────

    function test_CreateTournament() public {
        vm.prank(p1);
        uint256 tournId = pong.createTournament{value: TOURN_BUYIN}();

        assertEq(tournId, 0);
        assertEq(pong.tournamentCount(), 1);

        (address[8] memory players, uint256 count, uint256 pot,,) = pong.getTournament(0);
        assertEq(players[0], p1);
        assertEq(count, 1);
        assertEq(pot, TOURN_BUYIN);
    }

    function test_FillAndResolveTournament() public {
        (uint256 tournId, address[8] memory players) = _fillTournament();

        (,uint256 count, uint256 pot,,) = pong.getTournament(tournId);
        assertEq(count, 8);
        assertEq(pot, TOURN_BUYIN * 8);

        uint256 winnerBefore = players[0].balance;
        pong.resolveTournament(tournId, players[0]);

        assertEq(players[0].balance, winnerBefore + TOURN_PAY);
        assertEq(pong.houseBalance(), TOURN_HOUSE);
        assertEq(pong.tournamentWins(players[0]), 1);

        (,,, address w, bool complete) = pong.getTournament(tournId);
        assertEq(w, players[0]);
        assertTrue(complete);
    }

    function test_JoinTournament_AlreadyJoined() public {
        vm.prank(p1);
        uint256 tournId = pong.createTournament{value: TOURN_BUYIN}();

        vm.prank(p1);
        vm.expectRevert("Already joined");
        pong.joinTournament{value: TOURN_BUYIN}(tournId);
    }

    function test_JoinTournament_Full() public {
        (uint256 tournId,) = _fillTournament();

        address extra = makeAddr("extra");
        vm.deal(extra, 100 ether);
        vm.prank(extra);
        vm.expectRevert("Tournament full");
        pong.joinTournament{value: TOURN_BUYIN}(tournId);
    }

    function test_ResolveTournament_NotFull() public {
        vm.prank(p1);
        uint256 tournId = pong.createTournament{value: TOURN_BUYIN}();
        vm.expectRevert("Tournament not full");
        pong.resolveTournament(tournId, p1);
    }

    function test_ResolveTournament_WinnerNotInTournament() public {
        (uint256 tournId,) = _fillTournament();
        vm.expectRevert("Winner not in tournament");
        pong.resolveTournament(tournId, makeAddr("outsider"));
    }

    // ── NFT badge ─────────────────────────────────────────────

    function test_NFTBadgeAfterThreeWins() public {
        assertFalse(pong.nftBadgeEarned(p1));

        for (uint256 t = 0; t < 3; t++) {
            (uint256 tournId, address[8] memory players) = _fillTournament();
            // Give the contract enough balance for payouts
            vm.deal(address(pong), address(pong).balance + TOURN_PAY + TOURN_HOUSE);
            pong.resolveTournament(tournId, players[0]); // players[0] == p1
        }

        assertTrue(pong.nftBadgeEarned(p1));
        assertEq(pong.tournamentWins(p1), 3);
    }

    function test_NFTBadgeEmittedOnce() public {
        for (uint256 t = 0; t < 3; t++) {
            (uint256 tournId, address[8] memory players) = _fillTournament();
            vm.deal(address(pong), address(pong).balance + TOURN_PAY + TOURN_HOUSE);
            if (t == 2) vm.expectEmit(true, false, false, true);
            if (t == 2) emit HighClassPong.NFTBadgeEarned(p1, 3);
            pong.resolveTournament(tournId, players[0]);
        }

        // 4th win — badge already earned, no new event
        (uint256 tournId4, address[8] memory players4) = _fillTournament();
        vm.deal(address(pong), address(pong).balance + TOURN_PAY + TOURN_HOUSE);
        pong.resolveTournament(tournId4, players4[0]);
        assertTrue(pong.nftBadgeEarned(p1));
    }

    // ── House & ownership ─────────────────────────────────────

    function test_WithdrawHouse() public {
        _createAndJoinMatch();
        pong.resolveMatch(0, p1);

        uint256 ownerBefore = address(this).balance;
        pong.withdrawHouse();

        assertEq(address(this).balance, ownerBefore + MATCH_HOUSE);
        assertEq(pong.houseBalance(), 0);
    }

    function test_WithdrawHouse_NothingToWithdraw() public {
        vm.expectRevert("Nothing to withdraw");
        pong.withdrawHouse();
    }

    function test_WithdrawHouse_OnlyOwner() public {
        vm.prank(p1);
        vm.expectRevert("Not the owner");
        pong.withdrawHouse();
    }

    function test_TransferOwnership() public {
        pong.transferOwnership(p1);
        assertEq(pong.owner(), p1);
    }

    function test_TransferOwnership_ZeroAddress() public {
        vm.expectRevert("Invalid address");
        pong.transferOwnership(address(0));
    }

    function test_GetPlayerStats() public {
        _createAndJoinMatch();
        pong.resolveMatch(0, p1);

        (uint256 wins, uint256 total, uint256 tWins, bool hasNFT) = pong.getPlayerStats(p1);
        assertEq(wins, 1);
        assertEq(total, 1);
        assertEq(tWins, 0);
        assertFalse(hasNFT);
    }

    // Required so address(this) can receive CRO from withdrawHouse
    receive() external payable {}
}
