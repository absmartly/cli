#!/usr/bin/env node

import { program } from './program.js';
import { handleFatalError } from './lib/utils/error-handler.js';

process.on('unhandledRejection', (reason) =>
  handleFatalError('unhandled promise rejection', reason)
);
process.on('uncaughtException', (error) => handleFatalError('uncaught exception', error));

program.parseAsync().catch((error) => handleFatalError('command parsing', error));
