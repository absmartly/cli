import { Command } from 'commander';
import chalk from 'chalk';
import {
  getAPIClientFromOptions,
  getGlobalOptions,
  printFormatted,
  printResult,
  resolveEndpoint,
  resolveAPIKey,
  withErrorHandling,
} from '../../lib/utils/api-helper.js';
import { parseNoteId } from '../../lib/utils/validators.js';
import { replaceMarkdownImages } from '../../lib/utils/linear-match.js';
import { parseExperimentIdOrName } from './resolve-id.js';
import { formatNoteText, type NoteLookups } from '../activity/index.js';
import { fetchAndDisplayImage, supportsInlineImages } from '../../lib/utils/terminal-image.js';
import type { NoteId } from '../../lib/api/branded-types.js';
import type { Note } from '../../api-client/types.js';
import {
  listExperimentActivity,
  createExperimentNote,
  editExperimentNote,
  replyToExperimentNote,
} from '../../core/experiments/activity.js';

function formatTimestamp(dateStr: string): string {
  const d = new Date(dateStr);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function getUserName(note: Note): string {
  const createdBy = note.created_by as { first_name?: string; last_name?: string } | undefined;
  if (!createdBy) return 'System';
  const parts = [createdBy.first_name, createdBy.last_name].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : 'System';
}

export const activityCommand = new Command('activity').description('Activity operations');

const listActivityCommand = new Command('list')
  .description('List all activity notes for an experiment')
  .argument('<id>', 'experiment ID or name', parseExperimentIdOrName)
  .option('--notes', 'show note text for each entry')
  .option('--show-images [cols]', 'display inline images from notes', parseInt)
  .action(
    withErrorHandling(async (nameOrId: string, options) => {
      const globalOptions = getGlobalOptions(listActivityCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      const id = await client.resolveExperimentId(nameOrId);

      const result = await listExperimentActivity(client, { experimentId: id });
      const notes = result.data as Note[];

      if (notes.length === 0) {
        console.log(chalk.blue('No activity found'));
        return;
      }

      const useRaw = globalOptions.output === 'json' || globalOptions.output === 'yaml';
      if (useRaw) {
        printFormatted(notes, globalOptions);
        return;
      }

      let lookups: NoteLookups = {};
      if (options.notes) {
        const [users, teams] = await Promise.all([
          client.listUsers({ items: 500 }),
          client.listTeams({ items: 500 }),
        ]);
        const userMap = new Map<number, string>();
        for (const u of users)
          userMap.set(u.id, [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email);
        const teamMap = new Map<number, string>();
        for (const t of teams) teamMap.set(t.id, t.name);
        lookups = { users: userMap, teams: teamMap };
      }

      for (const note of notes) {
        const ts = note.created_at ? formatTimestamp(note.created_at) : 'unknown';
        const user = getUserName(note);
        const action = note.action ?? 'unknown';

        console.log(`${chalk.gray(`[${ts}]`)} ${chalk.white(`${user}: ${action}`)}`);

        if (options.notes && note.note) {
          const noteText = note.note as string;
          const showImages = options.showImages !== undefined && supportsInlineImages();

          if (showImages) {
            const IMG_PLACEHOLDER = '\x00IMG:';
            const images: Array<{ alt: string; url: string }> = [];
            const withPlaceholders = replaceMarkdownImages(noteText, (alt, url) => {
              images.push({ alt, url });
              return `${IMG_PLACEHOLDER}${images.length - 1}\x00`;
            });

            const formatted = formatNoteText(withPlaceholders, lookups);
            const parts = formatted.split(/\x00IMG:(\d+)\x00/);

            const endpointUrl = new URL(resolveEndpoint(globalOptions));
            const apiKey = await resolveAPIKey(globalOptions);
            const width = typeof options.showImages === 'number' ? options.showImages : 30;

            process.stdout.write(`  → `);
            for (let i = 0; i < parts.length; i++) {
              if (i % 2 === 0) {
                process.stdout.write(parts[i]!);
              } else {
                const img = images[parseInt(parts[i]!, 10)]!;
                const imgUrl = new URL(img.url, endpointUrl.origin);
                const headers =
                  imgUrl.origin === endpointUrl.origin
                    ? { Authorization: `Api-Key ${apiKey}` }
                    : undefined;
                process.stdout.write('\n');
                await fetchAndDisplayImage(imgUrl.toString(), img.alt || 'image', {
                  ...(headers && { headers }),
                  width,
                });
              }
            }
            if (!formatted.endsWith('\n')) process.stdout.write('\n');
          } else {
            const formatted = formatNoteText(noteText, lookups);
            if (formatted) console.log(`  ${chalk.white(`→ ${formatted}`)}`);
          }
        }
      }
    })
  );

const createActivityCommand = new Command('create')
  .description('Create a new activity note for an experiment')
  .argument('<id>', 'experiment ID or name', parseExperimentIdOrName)
  .requiredOption('--note <text>', 'note text')
  .action(
    withErrorHandling(async (nameOrId: string, options) => {
      const globalOptions = getGlobalOptions(createActivityCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      const id = await client.resolveExperimentId(nameOrId);

      const result = await createExperimentNote(client, { experimentId: id, note: options.note });
      printResult(globalOptions, {
        message: `✓ Note created (id: ${result.data.id})`,
        id: result.data.id,
        raw: result.data,
      });
    })
  );

const editActivityCommand = new Command('edit')
  .description('Edit an existing activity note')
  .argument('<experimentId>', 'experiment ID or name', parseExperimentIdOrName)
  .argument('<noteId>', 'note ID', parseNoteId)
  .requiredOption('--note <text>', 'updated note text')
  .action(
    withErrorHandling(async (expNameOrId: string, noteId: NoteId, options) => {
      const globalOptions = getGlobalOptions(editActivityCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      const id = await client.resolveExperimentId(expNameOrId);

      await editExperimentNote(client, { experimentId: id, noteId, note: options.note });
      printResult(globalOptions, { message: `✓ Note ${noteId} updated`, id: noteId });
    })
  );

const replyActivityCommand = new Command('reply')
  .description('Reply to an existing activity note')
  .argument('<experimentId>', 'experiment ID or name', parseExperimentIdOrName)
  .argument('<noteId>', 'note ID', parseNoteId)
  .requiredOption('--note <text>', 'reply text')
  .action(
    withErrorHandling(async (expNameOrId: string, noteId: NoteId, options) => {
      const globalOptions = getGlobalOptions(replyActivityCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      const id = await client.resolveExperimentId(expNameOrId);

      const result = await replyToExperimentNote(client, {
        experimentId: id,
        noteId,
        note: options.note,
      });
      printResult(globalOptions, {
        message: `✓ Reply created (id: ${result.data.id})`,
        id: result.data.id,
        raw: result.data,
      });
    })
  );

activityCommand.addCommand(listActivityCommand);
activityCommand.addCommand(createActivityCommand);
activityCommand.addCommand(editActivityCommand);
activityCommand.addCommand(replyActivityCommand);
