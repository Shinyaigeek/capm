const enabled =
  process.env.NO_COLOR === undefined &&
  process.env.FORCE_COLOR !== "0" &&
  process.stdout.isTTY !== false;

function ansi(code: number, text: string): string {
  return enabled ? `\x1b[${code}m${text}\x1b[0m` : text;
}

export const bold = (t: string) => ansi(1, t);
export const dim = (t: string) => ansi(2, t);
export const green = (t: string) => ansi(32, t);
export const red = (t: string) => ansi(31, t);
export const cyan = (t: string) => ansi(36, t);
export const yellow = (t: string) => ansi(33, t);
export const magenta = (t: string) => ansi(35, t);

export const SYMBOLS = {
  ok: enabled ? "✔" : "ok",
  fail: enabled ? "✖" : "x",
  arrow: enabled ? "→" : "->",
  dot: enabled ? "●" : "*",
  warn: enabled ? "⚠" : "!",
  pkg: enabled ? "◆" : "#",
} as const;

export function info(msg: string): void {
  console.log(`${cyan(SYMBOLS.arrow)} ${msg}`);
}

export function success(msg: string): void {
  console.log(`${green(SYMBOLS.ok)} ${msg}`);
}

export function warn(msg: string): void {
  console.log(`${yellow(SYMBOLS.warn)} ${msg}`);
}

export function fail(msg: string): void {
  console.log(`${red(SYMBOLS.fail)} ${msg}`);
}

export function item(msg: string): void {
  console.log(`  ${dim(SYMBOLS.dot)} ${msg}`);
}

export function header(msg: string): void {
  console.log(`\n${bold(msg)}`);
}

export function pkgName(name: string): string {
  return bold(name);
}

export function commitHash(hash: string): string {
  return dim(hash.slice(0, 8));
}

export function specRef(spec: string, ref: string): string {
  return `${dim(spec)}${dim("@")}${cyan(ref)}`;
}

export function typeBadge(type: string): string {
  const colors: Record<string, (t: string) => string> = {
    skill: magenta,
    agent: cyan,
    command: yellow,
  };
  const colorFn = colors[type] ?? dim;
  return colorFn(type);
}

// ---------------------------------------------------------------------------
// Spinner
// ---------------------------------------------------------------------------

const SPINNER_FRAMES = enabled ? ["◒", "◐", "◓", "◑"] : ["-", "\\", "|", "/"];
const SPINNER_INTERVAL = 80;

export interface Spinner {
  update(msg: string): void;
  stop(finalMsg?: string): void;
}

/**
 * Create a spinner that animates on stderr so it doesn't pollute stdout.
 * In non-TTY environments the spinner is a no-op and just prints the message.
 */
export function spinner(msg: string): Spinner {
  if (!enabled) {
    process.stderr.write(`  ${msg}\n`);
    return {
      update(m: string) {
        process.stderr.write(`  ${m}\n`);
      },
      stop() {},
    };
  }

  let frame = 0;
  let text = msg;

  const render = () => {
    const symbol = cyan(SPINNER_FRAMES[frame % SPINNER_FRAMES.length]);
    process.stderr.write(`\x1b[?25l\r\x1b[2K${symbol} ${text}`);
    frame++;
  };

  render();
  const timer = setInterval(render, SPINNER_INTERVAL);

  return {
    update(m: string) {
      text = m;
    },
    stop(finalMsg?: string) {
      clearInterval(timer);
      process.stderr.write("\r\x1b[2K\x1b[?25h");
      if (finalMsg) {
        console.log(finalMsg);
      }
    },
  };
}
