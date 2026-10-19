import { app } from "./app.js";
import "dotenv/config";
import { startNewsSyncJob } from "./news-job.js";

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
  startNewsSyncJob();
  console.log("Sincronizzazione automatica delle notizie ogni 5 minuti");
});
