// @group Logging > Levels: Enumeration of supported logging levels used to control logger verbosity and filtering behavior
import * as vscode from 'vscode';

// @group Logging > Levels: Enumeration of supported logging levels used to control logger verbosity and filtering behavior
export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3
}

// @group Logging > Core > Logger: Core logger implementation for formatting messages, level checks, and output to channels
class Logger {
    private outputChannel: vscode.OutputChannel;
    private logLevel: LogLevel = LogLevel.INFO;

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Group Code');
    }

    // @group Logging > Core > Configuration: Set the logger's global logging level, affecting which messages are emitted subsequently
    public setLogLevel(level: LogLevel): void {
        this.logLevel = level;
    }

    // @group Logging > Core > Shortcuts: Log a debug-level message with optional formatting arguments to the output channel
    public debug(message: string, ...args: any[]): void {
        this.log(LogLevel.DEBUG, 'DEBUG', message, ...args);
    }

    // @group Logging > Core > Shortcuts: Log an info-level message with optional formatting arguments to the output channel
    public info(message: string, ...args: any[]): void {
        this.log(LogLevel.INFO, 'INFO', message, ...args);
    }

    // @group Logging > Core > Shortcuts: Log a warning-level message with optional formatting arguments to the output channel
    public warn(message: string, ...args: any[]): void {
        this.log(LogLevel.WARN, 'WARN', message, ...args);
    }

    // @group Logging > Core > ErrorHandling: Log an error message with optional Error object, includes stack trace when available
    public error(message: string, error?: any): void {
        let fullMessage = message;
        if (error) {
            if (error instanceof Error) {
                fullMessage += `: ${error.message}`;
                if (error.stack) {
                    fullMessage += `\nStack trace: ${error.stack}`;
                }
            } else {
                fullMessage += `: ${String(error)}`;
            }
        }
        this.log(LogLevel.ERROR, 'ERROR', fullMessage);
    }

    // @group Logging > Core > Internal: Internal logging core that formats messages, respects log level, and writes to outputs
    private log(level: LogLevel, levelName: string, message: string, ...args: any[]): void {
        if (level < this.logLevel) {
            return;
        }

        const timestamp = new Date().toISOString();
        const formattedMessage = args.length > 0 
            ? `[${timestamp}] [${levelName}] ${message} ${args.map(arg => 
                typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
              ).join(' ')}`
            : `[${timestamp}] [${levelName}] ${message}`;

        this.outputChannel.appendLine(formattedMessage);

        // Also log to console in development for easier debugging
        if (vscode.env.machineId === 'someValue' || process.env.NODE_ENV === 'development') {
            switch (level) {
                case LogLevel.DEBUG:
                    console.debug(formattedMessage);
                    break;
                case LogLevel.INFO:
                    console.info(formattedMessage);
                    break;
                case LogLevel.WARN:
                    console.warn(formattedMessage);
                    break;
                case LogLevel.ERROR:
                    console.error(formattedMessage);
                    break;
            }
        }
    }

    // @group Logging > Core > UI: Reveal the output channel UI to the user, bringing focus to logs
    public show(): void {
        this.outputChannel.show();
    }

    // @group Logging > Core > Lifecycle: Dispose of the output channel and free associated resources used by logger
    public dispose(): void {
        this.outputChannel.dispose();
    }
}

// Create a singleton instance
// @group Logging > Instance > Singleton: Singleton logger instance created for consistent, application-wide logging and shared usage
const logger = new Logger();

// Export both the logger instance and the class for flexibility
// @group Logging > API > Exports: Export the logger instance and default export to be consumed by other modules
export { logger };
export default logger;