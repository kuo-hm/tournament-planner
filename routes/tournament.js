const express = require("express");
const router = express.Router();
const db = require("../models/db");

//Create Tournament
// router.post('/create-tournament', async (req, res) => {
//     try {
//         const [groups] = await db.query("INSERT INTO groups (name) VALUES ('Group A'), ('Group B'), ('Group C'), ('Group D')");
//         res.status(201).send('Tournament created');
//     } catch (err) {
//         res.status(500).send(err);
//     }
// });

// Add Player
router.post("/add-player", async (req, res) => {
  const { name } = req.body;
  try {
    await db.query("INSERT INTO players (name) VALUES (?)", [name]);
    res.status(201).send("Player added");
  } catch (err) {
    res.status(500).send(err);
  }
});

// Get Players
router.get("/get-players", async (req, res) => {
  try {
    const [players] = await db.query("SELECT * FROM players");
    res.status(200).json(players);
  } catch (err) {
    console.log(err);
    res.status(500).send(err);
  }
});

// Set Groups
router.post("/set-groups", async (req, res) => {
  try {
    const [players] = await db.query("SELECT id FROM players");
    const shuffledPlayers = players.sort(() => 0.5 - Math.random());
    const groupSize = 4;
    const numGroups = Math.ceil(shuffledPlayers.length / groupSize);
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

    // Clear existing groups and group players
    await db.query("DELETE FROM group_players");
    await db.query("DELETE FROM groups");

    // Create groups and assign players
    let currentGroupIndex = 0;
    for (let i = 0; i < numGroups; i++) {
      const groupName = `Group ${alphabet[i]}`;
      const [group] = await db.query("INSERT INTO groups (name) VALUES (?)", [
        groupName,
      ]);
      const groupId = group.insertId;

      for (
        let j = 0;
        j < groupSize && currentGroupIndex < shuffledPlayers.length;
        j++, currentGroupIndex++
      ) {
        const playerId = shuffledPlayers[currentGroupIndex].id;
        await db.query(
          "INSERT INTO group_players (group_id, player_id) VALUES (?, ?)",
          [groupId, playerId]
        );
      }
    }

    res.status(201).send("Groups set dynamically");
  } catch (err) {
    res.status(500).send(err);
  }
});

// Get Matches with Player Names and Group Names
router.get("/get-matches", async (req, res) => {
  try {
    const query = `
            SELECT m.id, m.group_id, g.name as group_name,
                   m.player1_id, p1.name as player1_name,
                   m.player2_id, p2.name as player2_name,
                   m.score1, m.score2,
                   (m.score1 IS NOT NULL AND m.score2 IS NOT NULL) AS played
            FROM matches m
            JOIN groups g ON m.group_id = g.id
            JOIN players p1 ON m.player1_id = p1.id
            JOIN players p2 ON m.player2_id = p2.id
        `;
    const [matches] = await db.query(query);

    res.status(200).json(matches);
  } catch (err) {
    res.status(500).send(err);
  }
});

// Set Score
router.post("/set-score", async (req, res) => {
  const { matchId, score1, score2 } = req.body;
  try {
    await db.query("UPDATE matches SET score1 = ?, score2 = ? WHERE id = ?", [
      score1,
      score2,
      matchId,
    ]);
    res.status(200).send("Score updated");
  } catch (err) {
    res.status(500).send(err);
  }
});

// Utility function to shuffle an array
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// Get Unplayed Matches and Save
router.get("/get-unplayed-matches-and-save", async (req, res) => {
  try {
    // Get all groups
    const [groups] = await db.query("SELECT * FROM groups");

    // Get all players in each group
    const groupPlayersQuery = `
            SELECT g.id as group_id, g.name as group_name, p.id as player_id, p.name as player_name
            FROM group_players gp
            JOIN players p ON gp.player_id = p.id
            JOIN groups g ON gp.group_id = g.id
            ORDER BY g.id, p.id
        `;
    const [groupPlayers] = await db.query(groupPlayersQuery);

    // Get all played matches
    const [playedMatches] = await db.query(
      "SELECT * FROM matches ORDER BY id DESC"
    );

    // Map of players who have played recently by group
    const recentlyPlayedMap = {};

    // Function to check if two players have played recently
    function havePlayedRecently(player1, player2, groupId) {
      if (!recentlyPlayedMap[groupId]) {
        recentlyPlayedMap[groupId] = [];
      }
      for (const match of recentlyPlayedMap[groupId]) {
        if (
          (match.player1_id === player1 && match.player2_id === player2) ||
          (match.player1_id === player2 && match.player2_id === player1)
        ) {
          return true;
        }
      }
      return false;
    }

    // Generate all possible matches for each group
    const unplayedMatches = [];
    const groupMap = {};

    // Create a map of group_id to players
    groupPlayers.forEach((row) => {
      if (!groupMap[row.group_id]) {
        groupMap[row.group_id] = [];
      }
      groupMap[row.group_id].push({
        player_id: row.player_id,
        player_name: row.player_name,
      });
    });

    // Generate possible matches and check against played matches and recent matches
    for (let groupId in groupMap) {
      const players = groupMap[groupId];
      for (let i = 0; i < players.length; i++) {
        for (let j = i + 1; j < players.length; j++) {
          const player1 = players[i].player_id;
          const player2 = players[j].player_id;

          // Check if the match has been played
          const matchPlayed = playedMatches.some(
            (match) =>
              (match.player1_id === player1 && match.player2_id === player2) ||
              (match.player1_id === player2 && match.player2_id === player1)
          );

          // Check if players have played recently
          const recentlyPlayed = havePlayedRecently(player1, player2, groupId);

          // If not played and not played recently, add to unplayed matches and save to database
          if (!matchPlayed && !recentlyPlayed) {
            // Save match to database
            const query =
              "INSERT INTO matches (group_id, player1_id, player2_id, score1, score2) VALUES (?, ?, ?, NULL, NULL)";
            await db.query(query, [groupId, player1, player2]);

            // Add to recently played map
            recentlyPlayedMap[groupId].unshift({
              player1_id: player1,
              player2_id: player2,
            });
            if (recentlyPlayedMap[groupId].length > 5) {
              recentlyPlayedMap[groupId].pop();
            }

            // Add to unplayed matches response
            unplayedMatches.push({
              group_id: groupId,
              group_name: groups.find((group) => group.id == groupId).name,
              player1_id: player1,
              player1_name: players[i].player_name,
              player2_id: player2,
              player2_name: players[j].player_name,
            });
          }
        }
      }
    }

    // Shuffle the unplayed matches
    const shuffledUnplayedMatches = shuffle(unplayedMatches);

    res.status(200).json(shuffledUnplayedMatches);
  } catch (err) {
    res.status(500).send(err);
  }
});

// Get Groups
router.get("/get-groups", async (req, res) => {
  try {
    const [groups] = await db.query(`
            SELECT 
                g.id as group_id,
                g.name as group_name, 
                p.id as player_id,
                p.name as player_name, 
                SUM(CASE 
                    WHEN m.score1 > m.score2 AND m.player1_id = p.id THEN 1
                    WHEN m.score2 > m.score1 AND m.player2_id = p.id THEN 1
                    ELSE 0 
                END) as wins,
                SUM(CASE 
                    WHEN m.score1 < m.score2 AND m.player1_id = p.id THEN 1
                    WHEN m.score2 < m.score1 AND m.player2_id = p.id THEN 1
                    ELSE 0 
                END) as losses,
                SUM(CASE 
                    WHEN m.score1 = m.score2 AND m.score1 IS NOT NULL AND m.score2 IS NOT NULL THEN 1
                    ELSE 0 
                END) as draws,
                COUNT(CASE 
                    WHEN m.score1 IS NOT NULL AND m.score2 IS NOT NULL THEN m.id 
                    ELSE NULL 
                END) as matches_played,
                SUM(CASE 
                    WHEN m.player1_id = p.id THEN m.score1 
                    WHEN m.player2_id = p.id THEN m.score2 
                    ELSE 0 
                END) as goals_scored,
                SUM(CASE 
                    WHEN m.player1_id = p.id THEN m.score2 
                    WHEN m.player2_id = p.id THEN m.score1 
                    ELSE 0 
                END) as goals_conceded,
                SUM(CASE 
                    WHEN m.player1_id = p.id THEN m.score1 - m.score2
                    WHEN m.player2_id = p.id THEN m.score2 - m.score1
                    ELSE 0 
                END) as goal_difference,
                (SUM(CASE 
                    WHEN m.score1 > m.score2 AND m.player1_id = p.id THEN 3
                    WHEN m.score2 > m.score1 AND m.player2_id = p.id THEN 3
                    WHEN m.score1 = m.score2 AND m.score1 IS NOT NULL AND m.score2 IS NOT NULL THEN 1
                    ELSE 0 
                END)) as points
            FROM group_players gp
            JOIN players p ON gp.player_id = p.id
            JOIN groups g ON gp.group_id = g.id
            LEFT JOIN matches m ON (gp.player_id = m.player1_id OR gp.player_id = m.player2_id)
            GROUP BY g.id, p.id
        `);

    // Group data by group_id and sort teams within each group
    const groupedData = groups.reduce((acc, cur) => {
      if (!acc[cur.group_id]) {
        acc[cur.group_id] = [];
      }
      acc[cur.group_id].push(cur);
      return acc;
    }, {});

    const rankGroups = async (group) => {
      // Sort teams by points, goal difference, goals scored
      group.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.goal_difference !== a.goal_difference)
          return b.goal_difference - a.goal_difference;
        if (b.goals_scored !== a.goals_scored)
          return b.goals_scored - a.goals_scored;
        return 0;
      });

      // Assign initial rank
      group.forEach((team, index) => {
        team.rank = index + 1;
      });

      // Resolve ties using head-to-head if necessary
      for (let i = 0; i < group.length - 1; i++) {
        for (
          let j = i + 1;
          j < group.length &&
          group[i].points === group[j].points &&
          group[i].goal_difference === group[j].goal_difference &&
          group[i].goals_scored === group[j].goals_scored;
          j++
        ) {
          const teamA = group[i];
          const teamB = group[j];
          const [headToHeadMatch] = await db.query(
            `
                        SELECT m.*
                        FROM matches m
                        WHERE (m.player1_id = ? AND m.player2_id = ?) OR (m.player1_id = ? AND m.player2_id = ?)
                        LIMIT 1
                    `,
            [teamA.player_id, teamB.player_id, teamB.player_id, teamA.player_id]
          );

          if (headToHeadMatch) {
            const teamAWins =
              (headToHeadMatch.player1_id === teamA.player_id &&
                headToHeadMatch.score1 > headToHeadMatch.score2) ||
              (headToHeadMatch.player2_id === teamA.player_id &&
                headToHeadMatch.score2 > headToHeadMatch.score1);
            const teamBWins =
              (headToHeadMatch.player1_id === teamB.player_id &&
                headToHeadMatch.score1 > headToHeadMatch.score2) ||
              (headToHeadMatch.player2_id === teamB.player_id &&
                headToHeadMatch.score2 > headToHeadMatch.score1);

            if (teamAWins) {
              group[i].rank = group[j].rank;
              group[j].rank = group[i].rank + 1;
            } else if (teamBWins) {
              group[j].rank = group[i].rank;
              group[i].rank = group[j].rank + 1;
            }
          }
        }
      }

      // Resolve any remaining ties by fair play (optional, not implemented in this example)
    };

    // Rank teams within each group
    for (let groupId in groupedData) {
      rankGroups(groupedData[groupId]);
    }

    // Convert groupedData back to an array and sort by group name
    const rankedGroups = Object.values(groupedData)
      .flat()
      .sort((a, b) => a.group_id - b.group_id);

    res.status(200).json(rankedGroups);
  } catch (err) {
    res.status(500).send(err);
  }
});

// Knockout Matches
router.get("/get-knockout-matches", async (req, res) => {
  try {
    const [knockoutMatches] = await db.query(`
            SELECT 
                km.id,
                p1.name AS player1_name,
                p2.name AS player2_name,
                km.score1,
                km.score2,
                CASE 
                    WHEN km.score1 IS NULL AND km.score2 IS NULL THEN false
                    ELSE true
                END AS has_been_played
            FROM knockout_matches km
            JOIN players p1 ON km.player1_id = p1.id
            JOIN players p2 ON km.player2_id = p2.id
        `);
    res.status(200).json(knockoutMatches);
  } catch (err) {
    res.status(500).send(err);
  }
});
// Set Knockout Match Score
router.post("/set-knockout-score", async (req, res) => {
  const { matchId, score1, score2 } = req.body;
  try {
    await db.query(
      "UPDATE knockout_matches SET score1 = ?, score2 = ? WHERE id = ?",
      [score1, score2, matchId]
    );
    res.status(200).send("Score updated");
  } catch (err) {
    res.status(500).send(err);
  }
});
router.post("/setupKnockoutMatches", async (req, res) => {
  try {
    // Get the group standings
    const [groupStandings] = await db.query(`
            SELECT 
                g.id as group_id, 
                g.name as group_name, 
                p.id as player_id, 
                p.name as player_name, 
                SUM(CASE 
                    WHEN m.score1 > m.score2 AND m.player1_id = p.id THEN 1
                    WHEN m.score2 > m.score1 AND m.player2_id = p.id THEN 1
                    ELSE 0 
                END) as wins,
                SUM(CASE 
                    WHEN m.score1 < m.score2 AND m.player1_id = p.id THEN 1
                    WHEN m.score2 < m.score1 AND m.player2_id = p.id THEN 1
                    ELSE 0 
                END) as losses,
                SUM(CASE 
                    WHEN m.score1 = m.score2 AND m.score1 IS NOT NULL AND m.score2 IS NOT NULL THEN 1
                    ELSE 0 
                END) as draws,
                COUNT(CASE 
                    WHEN m.score1 IS NOT NULL AND m.score2 IS NOT NULL THEN m.id 
                    ELSE NULL 
                END) as matches_played,
                SUM(CASE 
                    WHEN m.player1_id = p.id THEN m.score1 
                    WHEN m.player2_id = p.id THEN m.score2 
                    ELSE 0 
                END) as goals_scored,
                SUM(CASE 
                    WHEN m.player1_id = p.id THEN m.score2 
                    WHEN m.player2_id = p.id THEN m.score1 
                    ELSE 0 
                END) as goals_conceded,
                SUM(CASE 
                    WHEN m.player1_id = p.id THEN m.score1 - m.score2
                    WHEN m.player2_id = p.id THEN m.score2 - m.score1
                    ELSE 0 
                END) as goal_difference,
                (SUM(CASE 
                    WHEN m.score1 > m.score2 AND m.player1_id = p.id THEN 3
                    WHEN m.score2 > m.score1 AND m.player2_id = p.id THEN 3
                    WHEN m.score1 = m.score2 AND m.score1 IS NOT NULL AND m.score2 IS NOT NULL THEN 1
                    ELSE 0 
                END)) as points
            FROM group_players gp
            JOIN players p ON gp.player_id = p.id
            JOIN groups g ON gp.group_id = g.id
            LEFT JOIN matches m ON (gp.player_id = m.player1_id OR gp.player_id = m.player2_id)
            GROUP BY g.id, p.id
        `);

    // Group data by group_id and sort teams within each group
    const groupedData = groupStandings.reduce((acc, cur) => {
      if (!acc[cur.group_id]) {
        acc[cur.group_id] = [];
      }
      acc[cur.group_id].push(cur);
      return acc;
    }, {});

    const rankGroups = async (group) => {
      // Sort teams by points, goal difference, goals scored
      group.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.goal_difference !== a.goal_difference)
          return b.goal_difference - a.goal_difference;
        if (b.goals_scored !== a.goals_scored)
          return b.goals_scored - a.goals_scored;
        return 0;
      });

      // Assign initial rank
      group.forEach((team, index) => {
        team.rank = index + 1;
      });

      // Resolve ties using head-to-head if necessary
      for (let i = 0; i < group.length - 1; i++) {
        for (
          let j = i + 1;
          j < group.length &&
          group[i].points === group[j].points &&
          group[i].goal_difference === group[j].goal_difference &&
          group[i].goals_scored === group[j].goals_scored;
          j++
        ) {
          const teamA = group[i];
          const teamB = group[j];
          const [headToHeadMatch] = await db.query(
            `
                        SELECT m.*
                        FROM matches m
                        WHERE (m.player1_id = ? AND m.player2_id = ?) OR (m.player1_id = ? AND m.player2_id = ?)
                        LIMIT 1
                    `,
            [teamA.player_id, teamB.player_id, teamB.player_id, teamA.player_id]
          );

          if (headToHeadMatch) {
            const teamAWins =
              (headToHeadMatch.player1_id === teamA.player_id &&
                headToHeadMatch.score1 > headToHeadMatch.score2) ||
              (headToHeadMatch.player2_id === teamA.player_id &&
                headToHeadMatch.score2 > headToHeadMatch.score1);
            const teamBWins =
              (headToHeadMatch.player1_id === teamB.player_id &&
                headToHeadMatch.score1 > headToHeadMatch.score2) ||
              (headToHeadMatch.player2_id === teamB.player_id &&
                headToHeadMatch.score2 > headToHeadMatch.score1);

            if (teamAWins) {
              group[i].rank = group[j].rank;
              group[j].rank = group[i].rank + 1;
            } else if (teamBWins) {
              group[j].rank = group[i].rank;
              group[i].rank = group[j].rank + 1;
            }
          }
        }
      }

      // Resolve any remaining ties by fair play (optional, not implemented in this example)
    };

    // Rank teams within each group
    for (let groupId in groupedData) {
      await rankGroups(groupedData[groupId]);
    }

    // Select top 2 teams from each group
    const topTeams = [];
    const thirdTeams = [];

    for (let groupId in groupedData) {
      const group = groupedData[groupId];
      topTeams.push(group[0], group[1]);
      if (group.length > 2) {
        thirdTeams.push(group[2]);
      }
    }

    // Calculate the required number of teams for knockout stage
    const numTeams = topTeams.length + thirdTeams.length;
    const powerOfTwo = Math.pow(2, Math.floor(Math.log2(numTeams)));

    // Select the best third-placed teams to fill the required number of teams
    thirdTeams.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goal_difference !== a.goal_difference)
        return b.goal_difference - a.goal_difference;
      if (b.goals_scored !== a.goals_scored)
        return b.goals_scored - a.goals_scored;
      return 0;
    });

    const knockoutTeams = topTeams.concat(
      thirdTeams.slice(0, powerOfTwo - topTeams.length)
    );

    // Create knockout matches
    const knockoutMatches = [];
    for (let i = 0; i < knockoutTeams.length / 2; i++) {
      knockoutMatches.push({
        player1_id: knockoutTeams[i].player_id,
        player2_id: knockoutTeams[knockoutTeams.length - 1 - i].player_id,
        round: 1, // Initial round
      });
    }

    // Insert knockout matches into the database
    await db.query(
      `
            INSERT INTO knockout_matches (player1_id, player2_id, round, score1 ,score2 ) VALUES ?
        `,
      [
        knockoutMatches.map((match) => [
          match.player1_id,
          match.player2_id,
          match.round,
          null,
          null,
        ]),
      ]
    );

    res.status(200).json(knockoutMatches);
    //return knockoutMatches;
  } catch (err) {
    console.error(err);
    res.status(500).send(err);
    throw err;
  }
});
// Get Knockout Progress
router.get("/get-knockout-progress", async (req, res) => {
  try {
    const [progress] = await db.query(`
            SELECT * FROM knockout_matches
            ORDER BY FIELD(round, 'Round of 16', 'Quarter Finals', 'Semi Finals', 'Final')
        `);
    res.status(200).json(progress);
  } catch (err) {
    res.status(500).send(err);
  }
});

module.exports = router;
