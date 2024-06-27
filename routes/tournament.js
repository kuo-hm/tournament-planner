const express = require('express');
const router = express.Router();
const db = require('../models/db');

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
router.post('/add-player', async (req, res) => {
    const { name } = req.body;
    try {
        await db.query("INSERT INTO players (name) VALUES (?)", [name]);
        res.status(201).send('Player added');
    } catch (err) {
        res.status(500).send(err);
    }
});

// Get Players
router.get('/get-players', async (req, res) => {
    try {
        const [players] = await db.query("SELECT * FROM players");
        res.status(200).json(players);
    } catch (err) {
        res.status(500).send(err);
    }
});

// Set Groups
router.post('/set-groups', async (req, res) => {
    try {
        const [players] = await db.query("SELECT id FROM players");
        const shuffledPlayers = players.sort(() => 0.5 - Math.random());
        const groupSize = 4;
        const numGroups = Math.ceil(shuffledPlayers.length / groupSize);
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

        // Clear existing groups and group players
        await db.query("DELETE FROM group_players");
        await db.query("DELETE FROM groups");

        // Create groups and assign players
        let currentGroupIndex = 0;
        for (let i = 0; i < numGroups; i++) {
            const groupName = `Group ${alphabet[i]}`;
            const [group] = await db.query("INSERT INTO groups (name) VALUES (?)", [groupName]);
            const groupId = group.insertId;

            for (let j = 0; j < groupSize && currentGroupIndex < shuffledPlayers.length; j++, currentGroupIndex++) {
                const playerId = shuffledPlayers[currentGroupIndex].id;
                await db.query("INSERT INTO group_players (group_id, player_id) VALUES (?, ?)", [groupId, playerId]);
            }
        }

        res.status(201).send('Groups set dynamically');
    } catch (err) {
        res.status(500).send(err);
    }
});

// Get Matches with Player Names and Group Names
router.get('/get-matches', async (req, res) => {
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
router.post('/set-score', async (req, res) => {
    const { matchId, score1, score2 } = req.body;
    try {
        await db.query("UPDATE matches SET score1 = ?, score2 = ? WHERE id = ?", [score1, score2, matchId]);
        res.status(200).send('Score updated');
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
router.get('/get-unplayed-matches-and-save', async (req, res) => {
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
        const [playedMatches] = await db.query("SELECT * FROM matches ORDER BY id DESC");

        // Map of players who have played recently by group
        const recentlyPlayedMap = {};

        // Function to check if two players have played recently
        function havePlayedRecently(player1, player2, groupId) {
            if (!recentlyPlayedMap[groupId]) {
                recentlyPlayedMap[groupId] = [];
            }
            for (const match of recentlyPlayedMap[groupId]) {
                if ((match.player1_id === player1 && match.player2_id === player2) ||
                    (match.player1_id === player2 && match.player2_id === player1)) {
                    return true;
                }
            }
            return false;
        }

        // Generate all possible matches for each group
        const unplayedMatches = [];
        const groupMap = {};

        // Create a map of group_id to players
        groupPlayers.forEach(row => {
            if (!groupMap[row.group_id]) {
                groupMap[row.group_id] = [];
            }
            groupMap[row.group_id].push({
                player_id: row.player_id,
                player_name: row.player_name
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
                    const matchPlayed = playedMatches.some(match =>
                        (match.player1_id === player1 && match.player2_id === player2) ||
                        (match.player1_id === player2 && match.player2_id === player1)
                    );

                    // Check if players have played recently
                    const recentlyPlayed = havePlayedRecently(player1, player2, groupId);

                    // If not played and not played recently, add to unplayed matches and save to database
                    if (!matchPlayed && !recentlyPlayed) {
                        // Save match to database
                        const query = "INSERT INTO matches (group_id, player1_id, player2_id, score1, score2) VALUES (?, ?, ?, NULL, NULL)";
                        await db.query(query, [groupId, player1, player2]);

                        // Add to recently played map
                        recentlyPlayedMap[groupId].unshift({ player1_id: player1, player2_id: player2 });
                        if (recentlyPlayedMap[groupId].length > 5) {
                            recentlyPlayedMap[groupId].pop();
                        }

                        // Add to unplayed matches response
                        unplayedMatches.push({
                            group_id: groupId,
                            group_name: groups.find(group => group.id == groupId).name,
                            player1_id: player1,
                            player1_name: players[i].player_name,
                            player2_id: player2,
                            player2_name: players[j].player_name
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
router.get('/get-groups', async (req, res) => {
    try {
        const [groups] = await db.query(`
            SELECT 
                g.name as group_name, 
                p.name as player_name, 
                SUM(CASE WHEN m.score1 > m.score2 THEN 1 ELSE 0 END) as wins,
                SUM(CASE WHEN m.score1 < m.score2 THEN 1 ELSE 0 END) as losses,
                SUM(CASE WHEN m.score1 = m.score2 THEN 1 ELSE 0 END) as draws,
                COUNT(m.id) as matches_played,
                SUM(m.score1) as goals_scored,
                SUM(m.score2) as goals_conceded,
                SUM(m.score1) - SUM(m.score2) as goal_difference
            FROM group_players gp
            JOIN players p ON gp.player_id = p.id
            JOIN groups g ON gp.group_id = g.id
            LEFT JOIN matches m ON (gp.player_id = m.player1_id OR gp.player_id = m.player2_id)
            GROUP BY g.id, p.id
            ORDER BY g.id, goal_difference DESC, wins DESC, goals_scored DESC
        `);
        res.status(200).json(groups);
    } catch (err) {
        res.status(500).send(err);
    }
});

// Knockout Matches
router.get('/get-knockout-matches', async (req, res) => {
    try {
        const [knockoutMatches] = await db.query("SELECT * FROM knockout_matches");
        res.status(200).json(knockoutMatches);
    } catch (err) {
        res.status(500).send(err);
    }
});

// Set Knockout Match Score
router.post('/set-knockout-score', async (req, res) => {
    const { matchId, score1, score2 } = req.body;
    try {
        await db.query("UPDATE knockout_matches SET score1 = ?, score2 = ? WHERE id = ?", [score1, score2, matchId]);
        res.status(200).send('Score updated');
    } catch (err) {
        res.status(500).send(err);
    }
});

// Get Knockout Progress
router.get('/get-knockout-progress', async (req, res) => {
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
