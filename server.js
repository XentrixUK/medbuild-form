// server.js — local dev entry (npm start). Vercel uses api/index.js instead.
import app, { ADMIN_KEY } from './app.js';

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`MedBuild intake running on http://localhost:${PORT}`);
  console.log(`Admin API key: ${ADMIN_KEY}`);
});
