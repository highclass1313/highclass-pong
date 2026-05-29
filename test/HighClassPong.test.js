const { expect } = require("chai");
const { ethers }  = require("hardhat");

const E = ethers.parseEther;

describe("HighClassPong", () => {
  let contract, owner, p1, p2, p3, players;

  beforeEach(async () => {
    [owner, p1, p2, p3, ...players] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("HighClassPong");
    contract = await Factory.deploy();
  });

  // ──────────────────────────────────────────────────────────
  // Deployment
  // ──────────────────────────────────────────────────────────
  describe("deployment", () => {
    it("sets deployer as owner", async () => {
      expect(await contract.owner()).to.equal(owner.address);
    });

    it("starts with zero matches and tournaments", async () => {
      expect(await contract.matchCount()).to.equal(0n);
      expect(await contract.tournamentCount()).to.equal(0n);
    });

    it("houseBalance starts at 0", async () => {
      expect(await contract.houseBalance()).to.equal(0n);
    });
  });

  // ──────────────────────────────────────────────────────────
  // createMatch
  // ──────────────────────────────────────────────────────────
  describe("createMatch", () => {
    it("creates a match with correct buy-in", async () => {
      await contract.connect(p1).createMatch({ value: E("5") });
      expect(await contract.matchCount()).to.equal(1n);
    });

    it("reverts when wrong amount is sent", async () => {
      await expect(
        contract.connect(p1).createMatch({ value: E("4") })
      ).to.be.revertedWith("Send exactly 5 CRO");
    });

    it("records player1 and OPEN status", async () => {
      await contract.connect(p1).createMatch({ value: E("5") });
      const m = await contract.getMatch(0);
      expect(m.player1).to.equal(p1.address);
      expect(m.player2).to.equal(ethers.ZeroAddress);
      expect(m.status).to.equal(0); // OPEN
    });

    it("emits MatchCreated event", async () => {
      await expect(contract.connect(p1).createMatch({ value: E("5") }))
        .to.emit(contract, "MatchCreated")
        .withArgs(0n, p1.address);
    });

    it("pot equals buy-in after creation", async () => {
      await contract.connect(p1).createMatch({ value: E("5") });
      const m = await contract.getMatch(0);
      expect(m.pot).to.equal(E("5"));
    });
  });

  // ──────────────────────────────────────────────────────────
  // joinMatch
  // ──────────────────────────────────────────────────────────
  describe("joinMatch", () => {
    beforeEach(async () => {
      await contract.connect(p1).createMatch({ value: E("5") });
    });

    it("allows a second player to join", async () => {
      await contract.connect(p2).joinMatch(0, { value: E("5") });
      const m = await contract.getMatch(0);
      expect(m.player2).to.equal(p2.address);
      expect(m.status).to.equal(1); // ACTIVE
    });

    it("pot equals 10 CRO after both players join", async () => {
      await contract.connect(p2).joinMatch(0, { value: E("5") });
      const m = await contract.getMatch(0);
      expect(m.pot).to.equal(E("10"));
    });

    it("reverts if player tries to join their own match", async () => {
      await expect(
        contract.connect(p1).joinMatch(0, { value: E("5") })
      ).to.be.revertedWith("Can't play yourself");
    });

    it("reverts with wrong buy-in", async () => {
      await expect(
        contract.connect(p2).joinMatch(0, { value: E("4") })
      ).to.be.revertedWith("Send exactly 5 CRO");
    });

    it("reverts joining an already ACTIVE match", async () => {
      await contract.connect(p2).joinMatch(0, { value: E("5") });
      await expect(
        contract.connect(p3).joinMatch(0, { value: E("5") })
      ).to.be.revertedWith("Match not open");
    });

    it("reverts for non-existent match ID", async () => {
      await expect(
        contract.connect(p2).joinMatch(99, { value: E("5") })
      ).to.be.revertedWith("Match does not exist");
    });

    it("emits MatchJoined event", async () => {
      await expect(contract.connect(p2).joinMatch(0, { value: E("5") }))
        .to.emit(contract, "MatchJoined")
        .withArgs(0n, p2.address);
    });
  });

  // ──────────────────────────────────────────────────────────
  // resolveMatch
  // ──────────────────────────────────────────────────────────
  describe("resolveMatch", () => {
    beforeEach(async () => {
      await contract.connect(p1).createMatch({ value: E("5") });
      await contract.connect(p2).joinMatch(0, { value: E("5") });
    });

    it("pays winner 8 CRO", async () => {
      const before = await ethers.provider.getBalance(p1.address);
      await contract.resolveMatch(0, p1.address);
      const after = await ethers.provider.getBalance(p1.address);
      expect(after - before).to.equal(E("8"));
    });

    it("house keeps 2 CRO", async () => {
      await contract.resolveMatch(0, p1.address);
      expect(await contract.houseBalance()).to.equal(E("2"));
    });

    it("marks match as COMPLETE", async () => {
      await contract.resolveMatch(0, p1.address);
      const m = await contract.getMatch(0);
      expect(m.status).to.equal(2); // COMPLETE
    });

    it("increments winner's playerWins", async () => {
      await contract.resolveMatch(0, p1.address);
      expect(await contract.playerWins(p1.address)).to.equal(1n);
    });

    it("increments playerMatches for both players", async () => {
      await contract.resolveMatch(0, p1.address);
      expect(await contract.playerMatches(p1.address)).to.equal(1n);
      expect(await contract.playerMatches(p2.address)).to.equal(1n);
    });

    it("reverts when non-owner calls resolveMatch", async () => {
      await expect(
        contract.connect(p1).resolveMatch(0, p1.address)
      ).to.be.revertedWith("Not the owner");
    });

    it("reverts when winner is not a match participant", async () => {
      await expect(
        contract.resolveMatch(0, p3.address)
      ).to.be.revertedWith("Winner must be a player");
    });

    it("reverts if called a second time on the same match", async () => {
      await contract.resolveMatch(0, p1.address);
      await expect(
        contract.resolveMatch(0, p1.address)
      ).to.be.revertedWith("Match not active");
    });

    it("emits MatchComplete event", async () => {
      await expect(contract.resolveMatch(0, p1.address))
        .to.emit(contract, "MatchComplete")
        .withArgs(0n, p1.address, E("8"));
    });

    it("p2 winning also works correctly", async () => {
      const before = await ethers.provider.getBalance(p2.address);
      await contract.resolveMatch(0, p2.address);
      const after = await ethers.provider.getBalance(p2.address);
      expect(after - before).to.equal(E("8"));
    });
  });

  // ──────────────────────────────────────────────────────────
  // cancelMatch
  // ──────────────────────────────────────────────────────────
  describe("cancelMatch", () => {
    beforeEach(async () => {
      await contract.connect(p1).createMatch({ value: E("5") });
    });

    it("refunds player1 when they cancel", async () => {
      const before = await ethers.provider.getBalance(p1.address);
      const tx = await contract.connect(p1).cancelMatch(0);
      const receipt = await tx.wait();
      const gas = receipt.gasUsed * receipt.gasPrice;
      const after = await ethers.provider.getBalance(p1.address);
      expect(after - before + gas).to.equal(E("5"));
    });

    it("owner can also cancel an open match", async () => {
      await expect(contract.connect(owner).cancelMatch(0)).not.to.be.reverted;
    });

    it("marks match as CANCELLED", async () => {
      await contract.connect(p1).cancelMatch(0);
      const m = await contract.getMatch(0);
      expect(m.status).to.equal(3); // CANCELLED
    });

    it("reverts when non-player/non-owner tries to cancel", async () => {
      await expect(
        contract.connect(p2).cancelMatch(0)
      ).to.be.revertedWith("Not authorised");
    });

    it("reverts cancelling an already ACTIVE match", async () => {
      await contract.connect(p2).joinMatch(0, { value: E("5") });
      await expect(
        contract.connect(p1).cancelMatch(0)
      ).to.be.revertedWith("Can only cancel open matches");
    });

    it("emits MatchCancelled event", async () => {
      await expect(contract.connect(p1).cancelMatch(0))
        .to.emit(contract, "MatchCancelled")
        .withArgs(0n);
    });
  });

  // ──────────────────────────────────────────────────────────
  // createTournament & joinTournament
  // ──────────────────────────────────────────────────────────
  describe("tournament creation and joining", () => {
    it("creates a tournament with first player", async () => {
      await contract.connect(p1).createTournament({ value: E("10") });
      expect(await contract.tournamentCount()).to.equal(1n);
      const [, count, pot] = await contract.getTournament(0);
      expect(count).to.equal(1n);
      expect(pot).to.equal(E("10"));
    });

    it("reverts with wrong buy-in on create", async () => {
      await expect(
        contract.connect(p1).createTournament({ value: E("9") })
      ).to.be.revertedWith("Send exactly 10 CRO");
    });

    it("allows 8 players to join", async () => {
      const signers = await ethers.getSigners();
      await contract.connect(signers[1]).createTournament({ value: E("10") });
      for (let i = 2; i <= 8; i++) {
        await contract.connect(signers[i]).joinTournament(0, { value: E("10") });
      }
      const [, count, pot] = await contract.getTournament(0);
      expect(count).to.equal(8n);
      expect(pot).to.equal(E("80"));
    });

    it("reverts when a 9th player tries to join", async () => {
      const signers = await ethers.getSigners();
      await contract.connect(signers[1]).createTournament({ value: E("10") });
      for (let i = 2; i <= 8; i++) {
        await contract.connect(signers[i]).joinTournament(0, { value: E("10") });
      }
      await expect(
        contract.connect(signers[9]).joinTournament(0, { value: E("10") })
      ).to.be.revertedWith("Tournament full");
    });

    it("reverts when same player joins twice", async () => {
      await contract.connect(p1).createTournament({ value: E("10") });
      await expect(
        contract.connect(p1).joinTournament(0, { value: E("10") })
      ).to.be.revertedWith("Already joined");
    });

    it("reverts with wrong buy-in on join", async () => {
      await contract.connect(p1).createTournament({ value: E("10") });
      await expect(
        contract.connect(p2).joinTournament(0, { value: E("5") })
      ).to.be.revertedWith("Send exactly 10 CRO");
    });

    it("emits TournamentCreated event", async () => {
      await expect(contract.connect(p1).createTournament({ value: E("10") }))
        .to.emit(contract, "TournamentCreated")
        .withArgs(0n, p1.address);
    });

    it("emits TournamentJoined event", async () => {
      await contract.connect(p1).createTournament({ value: E("10") });
      await expect(contract.connect(p2).joinTournament(0, { value: E("10") }))
        .to.emit(contract, "TournamentJoined")
        .withArgs(0n, p2.address, 2n);
    });
  });

  // ──────────────────────────────────────────────────────────
  // resolveTournament
  // ──────────────────────────────────────────────────────────
  describe("resolveTournament", () => {
    let tournSigners;

    beforeEach(async () => {
      tournSigners = (await ethers.getSigners()).slice(1, 9); // 8 players
      await contract.connect(tournSigners[0]).createTournament({ value: E("10") });
      for (let i = 1; i < 8; i++) {
        await contract.connect(tournSigners[i]).joinTournament(0, { value: E("10") });
      }
    });

    it("pays winner 60 CRO", async () => {
      const winner = tournSigners[0];
      const before = await ethers.provider.getBalance(winner.address);
      await contract.resolveTournament(0, winner.address);
      const after = await ethers.provider.getBalance(winner.address);
      expect(after - before).to.equal(E("60"));
    });

    it("house receives 20 CRO", async () => {
      await contract.resolveTournament(0, tournSigners[0].address);
      expect(await contract.houseBalance()).to.equal(E("20"));
    });

    it("marks tournament complete", async () => {
      await contract.resolveTournament(0, tournSigners[0].address);
      const [,,,, complete] = await contract.getTournament(0);
      expect(complete).to.be.true;
    });

    it("increments tournamentWins for winner", async () => {
      await contract.resolveTournament(0, tournSigners[0].address);
      expect(await contract.tournamentWins(tournSigners[0].address)).to.equal(1n);
    });

    it("reverts when tournament is not full", async () => {
      await contract.connect(p1).createTournament({ value: E("10") });
      await expect(
        contract.resolveTournament(1, p1.address)
      ).to.be.revertedWith("Tournament not full");
    });

    it("reverts when called a second time", async () => {
      await contract.resolveTournament(0, tournSigners[0].address);
      await expect(
        contract.resolveTournament(0, tournSigners[0].address)
      ).to.be.revertedWith("Already complete");
    });

    it("reverts when winner is not a tournament player", async () => {
      // signers[9] is outside the 8-player bracket (signers 1-8)
      const outsider = (await ethers.getSigners())[9];
      await expect(
        contract.resolveTournament(0, outsider.address)
      ).to.be.revertedWith("Winner not in tournament");
    });

    it("reverts when non-owner calls", async () => {
      await expect(
        contract.connect(p1).resolveTournament(0, tournSigners[0].address)
      ).to.be.revertedWith("Not the owner");
    });

    it("emits TournamentComplete event", async () => {
      await expect(contract.resolveTournament(0, tournSigners[0].address))
        .to.emit(contract, "TournamentComplete")
        .withArgs(0n, tournSigners[0].address, E("60"));
    });
  });

  // ──────────────────────────────────────────────────────────
  // NFT badge logic
  // ──────────────────────────────────────────────────────────
  describe("NFT badge", () => {
    const fillAndResolve = async (winnerId) => {
      const signers = await ethers.getSigners();
      const allPlayers = signers.slice(1, 9);
      await contract.connect(allPlayers[0]).createTournament({ value: E("10") });
      const id = Number(await contract.tournamentCount()) - 1;
      for (let i = 1; i < 8; i++) {
        await contract.connect(allPlayers[i]).joinTournament(id, { value: E("10") });
      }
      await contract.resolveTournament(id, allPlayers[winnerId].address);
      return allPlayers[winnerId].address;
    };

    it("no badge after 1 tournament win", async () => {
      const winner = await fillAndResolve(0);
      expect(await contract.nftBadgeEarned(winner)).to.be.false;
    });

    it("no badge after 2 tournament wins", async () => {
      await fillAndResolve(0);
      await fillAndResolve(0);
      const signers = await ethers.getSigners();
      expect(await contract.nftBadgeEarned(signers[1].address)).to.be.false;
    });

    it("badge awarded on 3rd tournament win", async () => {
      await fillAndResolve(0);
      await fillAndResolve(0);
      const winner = await fillAndResolve(0);
      expect(await contract.nftBadgeEarned(winner)).to.be.true;
    });

    it("badge not awarded again on 4th win (idempotent)", async () => {
      await fillAndResolve(0);
      await fillAndResolve(0);
      await fillAndResolve(0);
      // 4th win — badge already set, NFTBadgeEarned should NOT emit again
      const tx = await (async () => {
        const signers = await ethers.getSigners();
        const allPlayers = signers.slice(1, 9);
        await contract.connect(allPlayers[0]).createTournament({ value: E("10") });
        const id = Number(await contract.tournamentCount()) - 1;
        for (let i = 1; i < 8; i++) {
          await contract.connect(allPlayers[i]).joinTournament(id, { value: E("10") });
        }
        return contract.resolveTournament(id, allPlayers[0].address);
      })();
      const receipt = await tx.wait();
      const nftEvents = receipt.logs.filter(
        l => l.topics[0] === contract.interface.getEvent("NFTBadgeEarned").topicHash
      );
      expect(nftEvents).to.have.length(0);
    });

    it("emits NFTBadgeEarned on exactly the 3rd win", async () => {
      await fillAndResolve(0);
      await fillAndResolve(0);
      const signers = await ethers.getSigners();
      const allPlayers = signers.slice(1, 9);
      await contract.connect(allPlayers[0]).createTournament({ value: E("10") });
      const id = Number(await contract.tournamentCount()) - 1;
      for (let i = 1; i < 8; i++) {
        await contract.connect(allPlayers[i]).joinTournament(id, { value: E("10") });
      }
      await expect(contract.resolveTournament(id, allPlayers[0].address))
        .to.emit(contract, "NFTBadgeEarned")
        .withArgs(allPlayers[0].address, 3n);
    });
  });

  // ──────────────────────────────────────────────────────────
  // withdrawHouse
  // ──────────────────────────────────────────────────────────
  describe("withdrawHouse", () => {
    beforeEach(async () => {
      // Run a match to build house balance
      await contract.connect(p1).createMatch({ value: E("5") });
      await contract.connect(p2).joinMatch(0, { value: E("5") });
      await contract.resolveMatch(0, p1.address);
    });

    it("transfers house balance to owner", async () => {
      const before = await ethers.provider.getBalance(owner.address);
      const tx = await contract.withdrawHouse();
      const receipt = await tx.wait();
      const gas = receipt.gasUsed * receipt.gasPrice;
      const after = await ethers.provider.getBalance(owner.address);
      expect(after - before + gas).to.equal(E("2"));
    });

    it("resets houseBalance to 0 after withdrawal", async () => {
      await contract.withdrawHouse();
      expect(await contract.houseBalance()).to.equal(0n);
    });

    it("reverts when non-owner calls", async () => {
      await expect(
        contract.connect(p1).withdrawHouse()
      ).to.be.revertedWith("Not the owner");
    });

    it("reverts when house balance is 0", async () => {
      await contract.withdrawHouse();
      await expect(contract.withdrawHouse()).to.be.revertedWith("Nothing to withdraw");
    });

    it("emits HouseWithdraw event", async () => {
      await expect(contract.withdrawHouse())
        .to.emit(contract, "HouseWithdraw")
        .withArgs(owner.address, E("2"));
    });
  });

  // ──────────────────────────────────────────────────────────
  // transferOwnership
  // ──────────────────────────────────────────────────────────
  describe("transferOwnership", () => {
    it("owner can transfer ownership", async () => {
      await contract.transferOwnership(p1.address);
      expect(await contract.owner()).to.equal(p1.address);
    });

    it("reverts when non-owner calls", async () => {
      await expect(
        contract.connect(p1).transferOwnership(p2.address)
      ).to.be.revertedWith("Not the owner");
    });

    it("reverts transfer to zero address", async () => {
      await expect(
        contract.transferOwnership(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid address");
    });
  });

  // ──────────────────────────────────────────────────────────
  // getPlayerStats view
  // ──────────────────────────────────────────────────────────
  describe("getPlayerStats", () => {
    it("returns zeroes for a new address", async () => {
      const [wins, total, tWins, hasNFT] = await contract.getPlayerStats(p1.address);
      expect(wins).to.equal(0n);
      expect(total).to.equal(0n);
      expect(tWins).to.equal(0n);
      expect(hasNFT).to.be.false;
    });

    it("returns correct stats after a match", async () => {
      await contract.connect(p1).createMatch({ value: E("5") });
      await contract.connect(p2).joinMatch(0, { value: E("5") });
      await contract.resolveMatch(0, p1.address);
      const [wins, total] = await contract.getPlayerStats(p1.address);
      expect(wins).to.equal(1n);
      expect(total).to.equal(1n);
    });
  });

  // ──────────────────────────────────────────────────────────
  // contractBalance
  // ──────────────────────────────────────────────────────────
  describe("contractBalance", () => {
    it("reflects deposited funds", async () => {
      await contract.connect(p1).createMatch({ value: E("5") });
      expect(await contract.contractBalance()).to.equal(E("5"));
    });

    it("decreases after payout", async () => {
      await contract.connect(p1).createMatch({ value: E("5") });
      await contract.connect(p2).joinMatch(0, { value: E("5") });
      await contract.resolveMatch(0, p1.address);
      // 10 deposited, 8 paid out, 2 remains as house
      expect(await contract.contractBalance()).to.equal(E("2"));
    });
  });
});
