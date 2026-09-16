const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// Determine static assets directory
const candidateDir = path.join(__dirname, 'hotel 1103');
const staticDir = fs.existsSync(candidateDir) ? candidateDir : path.join(__dirname, 'dist');

// Serve static assets at root
app.use(express.static(staticDir));

// Also serve when accessed via original folder path
app.use('/hotel 1103', express.static(staticDir));
app.use('/hotel%201103', express.static(staticDir));

// Fallback to index.html for undefined routes
app.get('*', (req, res) => {
  res.sendFile(path.join(staticDir, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
