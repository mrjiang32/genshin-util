import ora from "ora";
import chalk from "chalk";

let current = 0;
let total = 0;
let spinner = null;

function render() {
  if (!spinner) return;
  const percentage = total === 0 ? 0 : Math.floor((current / total) * 100);
  const filled = Math.floor(percentage / 2);
  const empty = 50 - filled;
  const bar = chalk.green("█".repeat(filled)) + chalk.gray("░".repeat(empty));
  spinner.text = `${bar} ${chalk.yellow(percentage + "%")} | ${current.toString().padEnd(total.toString().length, " ")}/${total}`;
}

export function initProgress(taskTotal) {
  total = taskTotal;
  current = 0;
  spinner = ora({
    text: "准备中...",
    color: "cyan",
    spinner: { interval: 80, frames: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] },
  });
  render();
  spinner.start();
}

export function updateProgress({ task, stat }) {
  if (!spinner) return;
  const percentage = total === 0 ? 0 : Math.floor((current / total) * 100);
  const filled = Math.floor(percentage / 2);
  const bar = chalk.green("█".repeat(filled)) + chalk.gray("░".repeat(50 - filled));
  let text = `${bar} ${chalk.yellow(percentage + "%")} | ${current}/${total}`;
  if (stat) text += ` | ${stat}`;
  if (task) text += ` | ${task}`;
  spinner.text = text;
  spinner.start();
}

export function incrementProgress() {
  current++;
  render();
  spinner?.start();
}

export function safeLog(message) {
  if (spinner) spinner.info(message);
  else console.log(message);
}

export function stopProgress(successMsg = "全部处理完成!") {
  if (!spinner) return;
  spinner.succeed(successMsg);
  spinner = null;
}

export function failProgress(errMsg = "程序异常!") {
  if (!spinner) return;
  spinner.fail(errMsg);
  spinner = null;
}