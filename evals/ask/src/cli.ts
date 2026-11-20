import { loadCases, runLive, runReplay } from "./run";

const modeFlag = process.argv.indexOf("--mode");
const mode = modeFlag === -1 ? "replay" : process.argv[modeFlag + 1];

const cases = loadCases();
const card = mode === "live" ? await runLive(cases, process.env) : await runReplay(cases);
console.log(JSON.stringify(card, null, 2));
if (mode === "live") {
  const rate = card.cases.length === 0 ? 0 : (card.passed / card.cases.length) * 100;
  console.error(`live pass rate ${rate.toFixed(1)}% (target 85%, not gating)`);
} else if (card.failed > 0) {
  process.exitCode = 1;
}
