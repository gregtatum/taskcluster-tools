// @ts-check
import { asAny, getElement } from '../utils.mjs';
import {
  getEmptyProfile,
  getEmptyThread,
  UniqueStringArray,
} from '../profiler.mjs';

const elements = {
  form: /** @type {HTMLFormElement} */ (getElement('form')),
  taskId: /** @type {HTMLInputElement} */ (getElement('taskId')),
  loading: /** @type {HTMLDivElement} */ (getElement('loading')),
  error: /** @type {HTMLDivElement} */ (getElement('error')),
};

console.log('Override the profiler origin with window.profilerOrigin');
asAny(window).profilerOrigin = 'https://profiler.firefox.com';

/**
 * @typedef {Object} LogRow
 *
 * @prop {string} component
 * @prop {Date | null} time
 * @prop {string} message
 */

/**
 * Parses log lines and returns an array of LogRow objects.
 *
 * @param {string[]} lines - The log lines to parse.
 * @returns {LogRow[]} The parsed log rows.
 */
function readLogFile(lines) {
  const logPattern =
    /\[(?<component>\w+)(:(?<logLevel>\w+))?\s*(?<time>[\d\-T:.Z]+)\]\s*(?<message>.*)/;
  // \[                                                            \]                     "[taskcluster:warn 2024-05-20T14:40:11.353Z]"
  //   (?<component>\w+)                                                                  Capture the component name, here "taskcluster"
  //                    (:(?<logLevel>\w+))?                                              An optional log level, like "warn"
  //                                        \s*                                           Ignore whitespace
  //                                           (?<time>[\d\-T:.Z]+)                       Capture the timestamp
  //                                                                 \s*                  Ignore whitespace
  //                                                                    (?<message>.*)    Capture the rest as the message

  /** @type {LogRow[]} */
  const logRows = [];

  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }

    const match = line.match(logPattern);
    if (match && match.groups) {
      logRows.push({
        component: match.groups.component,
        time: new Date(match.groups.time),
        message: match.groups.message,
      });
    } else {
      logRows.push({
        component: '',
        time: null,
        message: line,
      });
    }
  }

  return logRows;
}

/**
 * Removes any extra datetimes from the log messages.
 *
 * @param {LogRow[]} logRows - The log rows to process.
 * @returns {LogRow[]} The modified log rows.
 */
function fixupLogRows(logRows) {
  //  Remove any extra datetimes.
  //  "[2024-05-20 15:04:26] Ep. 1 : Up. 12 : Sen. 24,225 : ..."
  //   ^^^^^^^^^^^^^^^^^^^^^

  const regex = /^\s*\[[\d\-T:.Z]\]\s*/;

  for (const logRow of logRows) {
    // Remove the date-time part from the log string
    logRow.message = logRow.message.replace(regex, '');
  }

  return logRows;
}

/**
 * Colors are listed here:
 * https://github.com/firefox-devtools/profiler/blob/ffe2b6af0fbf4f91a389cc31fd7df776bb198034/src/utils/colors.js#L96
 */
function getCategories() {
  return [
    {
      name: 'none',
      color: 'grey',
      subcategories: ['Other'],
    },
    {
      name: 'fetches',
      color: 'purple',
      subcategories: ['Other'],
    },
    {
      name: 'vcs',
      color: 'orange',
      subcategories: ['Other'],
    },
    {
      name: 'setup',
      color: 'lightblue',
      subcategories: ['Other'],
    },
    {
      name: 'taskcluster',
      color: 'green',
      subcategories: ['Other'],
    },
  ];
}

/**
 * This is documented in the profiler:
 * Markers: https://github.com/firefox-devtools/profiler/src/types/markers.js
 * Schema: https://github.com/firefox-devtools/profiler/blob/df32b2d320cb4c9bc7b4ee988a291afa33daff71/src/types/markers.js#L100
 */
function getTaskSchema() {
  return {
    name: 'LiveLogRow',
    tooltipLabel: '{marker.data.message}',
    tableLabel: '{marker.data.message}',
    chartLabel: '{marker.data.message}',
    display: ['marker-chart', 'marker-table', 'timeline-overview'],
    data: [
      {
        key: 'startTime',
        label: 'Start time',
        format: 'string',
      },
      {
        key: 'message',
        label: 'Log Message',
        format: 'string',
        searchable: true,
      },
      {
        key: 'hour',
        label: 'Hour',
        format: 'string',
      },
      {
        key: 'date',
        label: 'Date',
        format: 'string',
      },
      {
        key: 'time',
        label: 'Time',
        format: 'time',
      },
    ],
  };
}

/**
 * Builds a profile from the provided log rows.
 *
 * @param {LogRow[]} logRows - The log rows to process.
 * @returns {import('profiler.mjs').Profile} The generated profile.
 */
function buildProfile(logRows) {
  const profile = getEmptyProfile();
  profile.meta.markerSchema = [getTaskSchema()];
  profile.meta.categories = getCategories();

  // Compute and save the profile start time.
  let profileStartTime = 0;
  for (const logRow of logRows) {
    if (logRow.time) {
      profileStartTime = Number(logRow.time);
      profile.meta.startTime = profileStartTime;
    }
  }

  // Create the thread that we'll attach the markers to.
  const thread = getEmptyThread();
  thread.name = 'Live Log';
  profile.threads.push(thread);
  thread.isMainThread = true;
  const markers = thread.markers;

  // Map a category name to its index.

  /** @type {Record<string, number>} */
  const categoryIndexDict = {};
  profile.meta.categories.forEach((category, index) => {
    categoryIndexDict[category.name] = index;
  });

  const stringArray = new UniqueStringArray();

  for (const logRow of logRows) {
    if (!logRow.time) {
      continue;
    }
    const runStart = Number(logRow.time);
    const instantMarker = 0;
    markers.startTime.push(runStart - profileStartTime);

    markers.endTime.push(null);
    markers.phase.push(instantMarker);

    // Code to add a duration marker:
    // const durationMarker = 1;
    // markers.endTime.push(runEnd - profileStartTime);
    // markers.phase.push(durationMarker);

    markers.category.push(categoryIndexDict[logRow.component] || 0);
    markers.name.push(stringArray.indexForString(logRow.component));

    markers.data.push({
      type: 'LiveLogRow',
      name: 'LiveLogRow',
      message: logRow.message,
      hour: logRow.time.toISOString().substr(11, 8),
      date: logRow.time.toISOString().substr(0, 10),
      // url: `https://${url.host}/tasks/groups/${taskGroup.taskGroupId}`,
    });

    markers.length += 1;
  }

  thread.stringArray = stringArray.serializeToArray();

  return profile;
}

/**
 * Fetches log rows from the specified TaskCluster URL.
 *
 * @param {string} taskId - The Task ID to fetch logs for.
 * @returns {Promise<import('profiler.mjs').Profile>} A promise that resolves to an array of LogRow objects.
 */
async function fetchLogsAndBuildProfile(taskId) {
  const url = `https://firefoxci.taskcluster-artifacts.net/${taskId}/0/public/logs/live_backing.log`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`);
  }

  const logText = await response.text();
  const logLines = logText.split('\n');

  const logRows = readLogFile(logLines);
  fixupLogRows(logRows);
  return buildProfile(logRows);
}

document.addEventListener('DOMContentLoaded', () => {
  elements.form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const { value } = elements.taskId;
    if (!value) {
      return;
    }
    elements.loading.style.display = 'block';
    elements.error.style.display = 'none';
    try {
      const profile = await fetchLogsAndBuildProfile(value);
      console.log(profile);

      const { profilerOrigin } = asAny(window);

      const profilerURL = profilerOrigin + '/from-post-message/';

      const profilerWindow = window.open(profilerURL, '_blank');
      elements.loading.style.display = 'none';

      if (!profilerWindow) {
        console.error('Failed to open the new window.');
        return;
      }

      // Wait for the profiler page to respond that it is ready.
      let isReady = false;

      /**
       * @param {MessageEvent} event
       */
      const listener = ({ data }) => {
        if (data?.name === 'is-ready') {
          console.log('The profiler is ready. Injecting the profile.');
          isReady = true;
          const message = {
            name: 'inject-profile',
            profile,
          };
          profilerWindow.postMessage(message, profilerOrigin);
          window.removeEventListener('message', listener);
        }
      };

      window.addEventListener('message', listener);
      while (!isReady) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        profilerWindow.postMessage({ name: 'is-ready' }, profilerOrigin);
      }

      window.removeEventListener('message', listener);
    } catch (error) {
      console.error(error);
      elements.loading.style.display = 'none';
      elements.error.style.display = 'block';
    }
  });
});
