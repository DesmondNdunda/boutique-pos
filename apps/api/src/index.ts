import { env } from "./config/env";
import { app } from "./app";

app.listen(env.port, () => {
  console.log(`[boutique-pos-api] listening on port ${env.port} (${env.nodeEnv})`);
});
