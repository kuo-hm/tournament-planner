CREATE DATABASE fifa_tournament;
USE fifa_tournament;

CREATE TABLE players (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL
);

CREATE TABLE groups (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(10) NOT NULL
);

CREATE TABLE group_players (
    group_id INT,
    player_id INT,
    FOREIGN KEY (group_id) REFERENCES groups(id),
    FOREIGN KEY (player_id) REFERENCES players(id),
    PRIMARY KEY (group_id, player_id)
);

CREATE TABLE matches (
    id INT AUTO_INCREMENT PRIMARY KEY,
    group_id INT,
    player1_id INT,
    player2_id INT,
    score1 INT DEFAULT 0,
    score2 INT DEFAULT 0,
    FOREIGN KEY (group_id) REFERENCES groups(id),
    FOREIGN KEY (player1_id) REFERENCES players(id),
    FOREIGN KEY (player2_id) REFERENCES players(id)
);

CREATE TABLE knockout_matches (
    id INT AUTO_INCREMENT PRIMARY KEY,
    round VARCHAR(50),
    player1_id INT,
    player2_id INT,
    score1 INT DEFAULT 0,
    score2 INT DEFAULT 0,
    FOREIGN KEY (player1_id) REFERENCES players(id),
    FOREIGN KEY (player2_id) REFERENCES players(id)
);
