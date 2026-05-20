import chalk from 'chalk';

export function createServerLogger() {
  return {
    info: (msg) => console.log(`${chalk.blue('info')}  ${msg}`),
    warn: (msg) => console.log(`${chalk.yellow('warn')}  ${msg}`),
    error: (msg) => console.log(`${chalk.red('error')} ${msg}`),
    debug: (msg) => {
      if (process.env.DEBUG) {
        console.log(`${chalk.gray('debug')} ${msg}`);
      }
    }
  };
}
