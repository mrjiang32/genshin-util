// utils/logger.js
import ora from "ora";
import chalk from "chalk";

let current = 0;
let total = 0;
let spinner = null; // 初始为空

/**
 * 内部渲染函数
 */
function render() {
  if (!spinner) return;
  const percentage = total === 0 ? 0 : Math.floor((current / total) * 100);
  const filled = Math.floor(percentage / 2);
  const empty = 50 - filled;

  const bar = chalk.green("█".repeat(filled)) + chalk.gray("░".repeat(empty));
  const pad = total.toString().length
  spinner.text = `${bar} ${chalk.yellow(percentage + "%")} | ${current.toString().padEnd(pad, " ")}/${total}`;
}

/**
 * 启动进度条（每次都会创建一个全新的 ora 实例！）
 */
export function initProgress(taskTotal) {
  total = taskTotal;
  current = 0;

  // 每次启动都重新创建 spinner
  spinner = ora({
    text: "准备中...",
    color: "cyan",
    spinner: {
      interval: 80,
      frames: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
    },
  });

  render(); // 先渲染一次基础进度条
  spinner.start(); // 启动转圈圈

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true); // 开启原始模式，直接捕获按键
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    process.stdin.on("data", (key) => {
      // Ctrl+C 的 ASCII 码是 \u0003
      if (key === "\u0003") {
        spinner.stop();
        process.stdin.setRawMode(false); // 恢复终端状态
        console.log(chalk.yellow("\n[i] 收到中断信号，程序已安全退出"));
        process.exit(0);
      }
    });
  }
}

/**
 * 更新底部状态栏
 */
export function updateProgress({ task, stat }) {
  if (!spinner) return;

  const percentage = total === 0 ? 0 : Math.floor((current / total) * 100);
  const filled = Math.floor(percentage / 2);
  const empty = 50 - filled;
  const bar = chalk.green("█".repeat(filled)) + chalk.gray("░".repeat(empty));

  let text = `${bar} ${chalk.yellow(percentage + "%")} | ${current}/${total}`;
  if (stat) text += ` | ${stat}`;
  if (task) text += ` | ${task}`;

  spinner.text = text;
  spinner.start();
}

/**
 * 进度条 +1
 */
export function incrementProgress() {
  current++;
  render();
  spinner?.start();
}

/**
 * 在进度条上方安全打印日志
 */
export function safeLog(message) {
  if (spinner) {
    spinner.info(message);
  } else {
    console.log(message);
  }
}

/**
 * 停止并成功提示
 */
export function stopProgress(successMsg = "全部处理完成!") {
  if (spinner) {
    spinner.succeed(successMsg);
    spinner = null; // 彻底销毁，防止内存泄漏
  }
}

/**
 * 异常时停止
 */
export function failProgress(errMsg = "程序异常!") {
  if (spinner) {
    spinner.fail(errMsg);
    spinner = null;
  }
}
