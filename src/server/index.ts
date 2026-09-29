import { createApp } from "./app.js";
import {
  configService,
  fileLifecycleService
} from "./services/dependencies.js";

const port = Number(process.env.PORT ?? 3001);
const app = createApp();

async function start(): Promise<void> {
  const config = await configService.getConfig();
  await fileLifecycleService.initialize();
  setInterval(async () => {
    await fileLifecycleService.cleanupExpired(config.lifecycle.fileTtlMinutes);
  }, config.lifecycle.cleanupIntervalMinutes * 60_000);

  app.listen(port, () => {
    process.stdout.write(`Server listening on http://localhost:${port}\n`);
  });
}

void start();
