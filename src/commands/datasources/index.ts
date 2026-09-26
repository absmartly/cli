import { Command } from 'commander';
import chalk from 'chalk';
import {
  getAPIClientFromOptions,
  getGlobalOptions,
  printFormatted,
  printResult,
  withErrorHandling,
} from '../../lib/utils/api-helper.js';
import { parseDatasourceId, validateJSON } from '../../lib/utils/validators.js';
import { readStdinText } from '../../lib/utils/stdin.js';
import { addPaginationOptions, printPaginationFooter } from '../../lib/utils/pagination.js';
import type { DatasourceId } from '../../lib/api/branded-types.js';
import {
  listDatasources as coreListDatasources,
  getDatasource as coreGetDatasource,
  createDatasource as coreCreateDatasource,
  updateDatasource as coreUpdateDatasource,
  archiveDatasource as coreArchiveDatasource,
  testDatasource as coreTestDatasource,
  introspectDatasource as coreIntrospectDatasource,
  validateDatasourceQuery as coreValidateDatasourceQuery,
  previewDatasourceQuery as corePreviewDatasourceQuery,
  setDefaultDatasource as coreSetDefaultDatasource,
  getDatasourceSchema as coreGetDatasourceSchema,
  deleteDatasource as coreDeleteDatasource,
  createDatasourceJsonLayouts as coreCreateDatasourceJsonLayouts,
  recreateDatasourceJsonLayouts as coreRecreateDatasourceJsonLayouts,
  previewDatasourceJsonLayouts as corePreviewDatasourceJsonLayouts,
  columnarToRows,
} from '../../core/datasources/datasources.js';

export const datasourcesCommand = new Command('datasources')
  .aliases(['datasource', 'ds'])
  .description('Datasource management');

const listCommand = addPaginationOptions(
  new Command('list').description('List datasources')
).action(
  withErrorHandling(async (options) => {
    const globalOptions = getGlobalOptions(listCommand);
    const client = await getAPIClientFromOptions(globalOptions);
    const result = await coreListDatasources(client, { items: options.items, page: options.page });
    printFormatted(result.data, globalOptions);
    printPaginationFooter(
      (result.data as unknown[]).length,
      options.items,
      options.page,
      globalOptions.output as string
    );
  })
);

const getCommand = new Command('get')
  .description('Get datasource details')
  .argument('<id>', 'datasource ID', parseDatasourceId)
  .action(
    withErrorHandling(async (id: DatasourceId) => {
      const globalOptions = getGlobalOptions(getCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      const result = await coreGetDatasource(client, { id });
      printFormatted(result.data, globalOptions);
    })
  );

const createCommand = new Command('create')
  .description('Create a new datasource')
  .requiredOption('--json-config <json>', 'datasource configuration as JSON')
  .action(
    withErrorHandling(async (options) => {
      const globalOptions = getGlobalOptions(createCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      const config = validateJSON(options.jsonConfig, '--json-config') as Record<string, unknown>;
      const result = await coreCreateDatasource(client, { config });
      const data = result.data as { id?: unknown } | undefined;
      printResult(globalOptions, {
        message: `✓ Datasource created`,
        id: data?.id,
        raw: result.data,
      });
    })
  );

const updateCommand = new Command('update')
  .description('Update a datasource')
  .argument('<id>', 'datasource ID', parseDatasourceId)
  .requiredOption('--json-config <json>', 'datasource configuration as JSON')
  .action(
    withErrorHandling(async (id: DatasourceId, options) => {
      const globalOptions = getGlobalOptions(updateCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      const config = validateJSON(options.jsonConfig, '--json-config') as Record<string, unknown>;
      const result = await coreUpdateDatasource(client, { id, config });
      printResult(globalOptions, {
        message: `✓ Datasource ${id} updated`,
        id,
        raw: result.data,
      });
    })
  );

const archiveCommand = new Command('archive')
  .description('Archive or unarchive a datasource')
  .argument('<id>', 'datasource ID', parseDatasourceId)
  .option('--unarchive', 'unarchive the datasource', false)
  .action(
    withErrorHandling(async (id: DatasourceId, options) => {
      const globalOptions = getGlobalOptions(archiveCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      await coreArchiveDatasource(client, { id, unarchive: options.unarchive });
      const action = options.unarchive ? 'unarchived' : 'archived';
      printResult(globalOptions, { message: `✓ Datasource ${id} ${action}`, id });
    })
  );

const testCommand = new Command('test')
  .description('Test datasource connection')
  .requiredOption('--json-config <json>', 'datasource configuration as JSON')
  .action(
    withErrorHandling(async (options) => {
      const globalOptions = getGlobalOptions(testCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      const config = validateJSON(options.jsonConfig, '--json-config') as Record<string, unknown>;
      await coreTestDatasource(client, { config });
      printResult(globalOptions, { message: `✓ Datasource connection test passed` });
    })
  );

const introspectCommand = new Command('introspect')
  .description('Introspect datasource schema')
  .requiredOption('--json-config <json>', 'datasource configuration as JSON')
  .action(
    withErrorHandling(async (options) => {
      const globalOptions = getGlobalOptions(introspectCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      const config = validateJSON(options.jsonConfig, '--json-config') as Record<string, unknown>;
      const result = await coreIntrospectDatasource(client, { config });
      printFormatted(result.data, globalOptions);
    })
  );

const validateQueryCommand = new Command('validate-query')
  .description('Validate a datasource query')
  .requiredOption('--json-config <json>', 'query configuration as JSON')
  .action(
    withErrorHandling(async (options) => {
      const globalOptions = getGlobalOptions(validateQueryCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      const config = validateJSON(options.jsonConfig, '--json-config') as Record<string, unknown>;
      await coreValidateDatasourceQuery(client, { config });
      printResult(globalOptions, { message: `✓ Datasource query is valid` });
    })
  );

const previewQueryCommand = new Command('preview-query')
  .description('Preview a datasource query')
  .requiredOption('--json-config <json>', 'query configuration as JSON')
  .action(
    withErrorHandling(async (options) => {
      const globalOptions = getGlobalOptions(previewQueryCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      const config = validateJSON(options.jsonConfig, '--json-config') as Record<string, unknown>;
      const result = await corePreviewDatasourceQuery(client, { config });
      printFormatted(globalOptions.raw ? result.data : columnarToRows(result.data), globalOptions);
    })
  );

const queryCommand = new Command('query')
  .description('Run a SQL query against a datasource')
  .argument('<id>', 'datasource ID', parseDatasourceId)
  .argument('[sql]', 'SQL query (positional). Mutually exclusive with --sql and --json-config.')
  .option(
    '--sql <text>',
    'SQL query. Use "-" to read from stdin. Mutually exclusive with the positional argument and --json-config.'
  )
  .option('--limit <n>', 'maximum number of rows to return', (value) => Number(value))
  .option(
    '--json-config <json>',
    'full request body as JSON. Overrides all other inputs and rejects them if set.'
  )
  .action(
    withErrorHandling(
      async (
        id: DatasourceId,
        positionalSql: string | undefined,
        options: { sql?: string; limit?: number; jsonConfig?: string }
      ) => {
        const globalOptions = getGlobalOptions(queryCommand);

        let config: Record<string, unknown>;

        if (options.jsonConfig !== undefined) {
          if (
            positionalSql !== undefined ||
            options.sql !== undefined ||
            options.limit !== undefined
          ) {
            console.error(
              chalk.red(
                '✗ --json-config cannot be combined with positional SQL, --sql, or --limit.'
              )
            );
            process.exit(1);
          }
          config = validateJSON(options.jsonConfig, '--json-config') as Record<string, unknown>;
        } else {
          if (positionalSql !== undefined && options.sql !== undefined) {
            console.error(
              chalk.red('✗ Provide SQL via the positional argument OR --sql, not both.')
            );
            process.exit(1);
          }

          let sql: string | undefined = positionalSql ?? options.sql;
          if (sql === '-') {
            sql = await readStdinText();
            if (sql.length === 0) {
              console.error(chalk.red('✗ --sql - was specified but stdin was empty.'));
              process.exit(1);
            }
          }

          if (sql === undefined) {
            console.error(chalk.red('✗ SQL is required. Provide it positionally or via --sql.'));
            process.exit(1);
          }

          config = {
            datasource_id: id,
            query: sql,
          };
          if (options.limit !== undefined) {
            config.limit = options.limit;
          }
        }

        const client = await getAPIClientFromOptions(globalOptions);
        const result = await corePreviewDatasourceQuery(client, { config });
        printFormatted(
          globalOptions.raw ? result.data : columnarToRows(result.data),
          globalOptions
        );
      }
    )
  );

const setDefaultCommand = new Command('set-default')
  .description('Set a datasource as the default')
  .argument('<id>', 'datasource ID', parseDatasourceId)
  .action(
    withErrorHandling(async (id: DatasourceId) => {
      const globalOptions = getGlobalOptions(setDefaultCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      await coreSetDefaultDatasource(client, { id });
      printResult(globalOptions, { message: `✓ Datasource ${id} set as default`, id });
    })
  );

const schemaCommand = new Command('schema')
  .description('Fetch datasource schema')
  .argument('<id>', 'datasource ID', parseDatasourceId)
  .action(
    withErrorHandling(async (id: DatasourceId) => {
      const globalOptions = getGlobalOptions(schemaCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      const result = await coreGetDatasourceSchema(client, { id });
      printFormatted(result.data, globalOptions);
    })
  );

const deleteCommand = new Command('delete')
  .description('Delete a datasource (fails if default or used by any goal)')
  .argument('<id>', 'datasource ID', parseDatasourceId)
  .action(
    withErrorHandling(async (id: DatasourceId) => {
      const globalOptions = getGlobalOptions(deleteCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      await coreDeleteDatasource(client, { id });
      printResult(globalOptions, { message: `✓ Datasource ${id} deleted`, id });
    })
  );

const jsonLayoutsCommand = new Command('json-layouts').description(
  'Manage the json_layouts table on a datasource'
);

const jsonLayoutsCreateCommand = new Command('create')
  .description('Create the json_layouts table on a datasource')
  .argument('<id>', 'datasource ID', parseDatasourceId)
  .action(
    withErrorHandling(async (id: DatasourceId) => {
      const globalOptions = getGlobalOptions(jsonLayoutsCreateCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      await coreCreateDatasourceJsonLayouts(client, { id });
      printResult(globalOptions, {
        message: `✓ json_layouts table created on datasource ${id}`,
        id,
      });
    })
  );

const jsonLayoutsRecreateCommand = new Command('recreate')
  .description(
    'Drop and recreate the json_layouts table on a datasource (destructive — requires --yes)'
  )
  .argument('<id>', 'datasource ID', parseDatasourceId)
  .option('--yes', 'confirm the destructive recreate', false)
  .action(
    withErrorHandling(async (id: DatasourceId, options: { yes: boolean }) => {
      if (!options.yes) {
        console.error(
          chalk.red(
            `✗ Refusing to recreate the json_layouts table on datasource ${id} without --yes. This drops the existing table.`
          )
        );
        process.exit(1);
      }
      const globalOptions = getGlobalOptions(jsonLayoutsRecreateCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      await coreRecreateDatasourceJsonLayouts(client, { id });
      printResult(globalOptions, {
        message: `✓ json_layouts table recreated on datasource ${id}`,
        id,
      });
    })
  );

const jsonLayoutsPreviewCommand = new Command('preview')
  .description('Preview the json_layouts table (row count + 5-row sample)')
  .argument('<id>', 'datasource ID', parseDatasourceId)
  .action(
    withErrorHandling(async (id: DatasourceId) => {
      const globalOptions = getGlobalOptions(jsonLayoutsPreviewCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      const result = await corePreviewDatasourceJsonLayouts(client, { id });
      printFormatted(result.data, globalOptions);
    })
  );

jsonLayoutsCommand.addCommand(jsonLayoutsCreateCommand);
jsonLayoutsCommand.addCommand(jsonLayoutsRecreateCommand);
jsonLayoutsCommand.addCommand(jsonLayoutsPreviewCommand);

datasourcesCommand.addCommand(listCommand);
datasourcesCommand.addCommand(getCommand);
datasourcesCommand.addCommand(createCommand);
datasourcesCommand.addCommand(updateCommand);
datasourcesCommand.addCommand(archiveCommand);
datasourcesCommand.addCommand(testCommand);
datasourcesCommand.addCommand(introspectCommand);
datasourcesCommand.addCommand(validateQueryCommand);
datasourcesCommand.addCommand(previewQueryCommand);
datasourcesCommand.addCommand(queryCommand);
datasourcesCommand.addCommand(setDefaultCommand);
datasourcesCommand.addCommand(schemaCommand);
datasourcesCommand.addCommand(deleteCommand);
datasourcesCommand.addCommand(jsonLayoutsCommand);
