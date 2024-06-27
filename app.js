const express = require('express');
const bodyParser = require('body-parser');
const tournamentRoutes = require('./routes/tournament');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use('/api/tournament', tournamentRoutes);

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
