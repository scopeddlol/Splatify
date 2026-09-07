import { runCommunityBrowser } from "./community-browser";

runCommunityBrowser(true).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
