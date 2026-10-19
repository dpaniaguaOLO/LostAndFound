import { createApp } from './app.js';
import { config } from './config.js';

const app = createApp();

app.listen(config.port, () => {
  console.log(`[lost-and-found] API escuchando en http://localhost:${config.port}`);
  console.log(`[lost-and-found] CORS permitido para ${config.corsOrigin}`);
});
