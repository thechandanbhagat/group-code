import * as vscode from 'vscode';

export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3
}

class Logger {
    private outputChannel: vscode.OutputChannel;
    private logLevel: LogLevel = LogLevel.INFO;

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Group Code');
    }

    public setLogLevel(level: LogLevel): void {
        this.logLevel = level;
    }

    public debug(message: string, ...args: any[]): void {
        this.log(LogLevel.DEBUG, 'DEBUG', message, ...args);
    }

    public info(message: string, ...args: any[]): void {
        this.log(LogLevel.INFO, 'INFO', message, ...args);
    }

    public warn(message: string, ...args: any[]): void {
        this.log(LogLevel.WARN, 'WARN', message, ...args);
    }

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

    public show(): void {
        this.outputChannel.show();
    }

    public dispose(): void {
        this.outputChannel.dispose();
    }
}

// Create a singleton instance
const logger = new Logger();

// Export both the logger instance and the class for flexibility
export { logger };
export default logger;
