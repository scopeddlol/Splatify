import { runCommunityBrowser } from "./community-browser";

runCommunityBrowser(false).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
