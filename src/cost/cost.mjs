import { getTasks, isTaskGroupIdValid } from '../taskcluster.mjs';
import { exposeAsGlobal, getElement } from '../utils.mjs';
const server = 'https://firefox-ci-tc.services.mozilla.com';

const elements = {
  info: getElement('info'),
  infoMessage: getElement('infoMessage'),
  controls: getElement('controls'),
  taskGroup: /** @type {HTMLInputElement} */ (getElement('taskGroup')),
  fetchDependentTasks: /** @type {HTMLInputElement} */ (
    getElement('fetchDependentTasks')
  ),
  taskGroups: getElement('taskGroups'),
  taskGroupList: /** @type {HTMLTableElement} */ (getElement('taskGroupList')),
  taskGroupTasks: getElement('taskGroupTasks'),
  taskGroupTasksBody: getElement('taskGroupTasksBody'),
  error: getElement('error'),
  costBreakdown: getElement('costBreakdown'),
  costTotals: /** @type {HTMLTableElement} */ (getElement('costTotals')),
  breakdownCosts: /** @type {HTMLTableElement} */ (
    getElement('breakdownCosts')
  ),
};

document.addEventListener('DOMContentLoaded', () => {
  main().catch((error) => {
    console.error(error);
    getElement('error').style.display = 'block';
  });
});

/** @type {Promise<TaskGroup[]>} */
let taskGroupsPromise;

async function main() {
  setupHandlers();
  const taskGroupIds = getTaskGroupIds();
  if (taskGroupIds.length === 0) {
    return;
  }
  updateInfoMessage('');

  const promise = getTasks(
    taskGroupIds,
    server,
    /* merge chunks */ false,
    getFetchDependentTasks(),
    /* merge task types */ [],
    updateInfoMessage,
    new Set(getIgnoredTaskGroupIds()),
  );

  taskGroupsPromise = promise.then((result) => {
    if (!result) {
      updateInfoMessage('No tasks were found');
      return Promise.reject('No taskgroups were found.');
    }
    updateInfoMessage('');

    const { taskGroups } = result;
    exposeAsGlobal('taskGroups', taskGroups);

    addDependentTaskGroups(taskGroups);
    computeCost();

    return taskGroups;
  });
}

function setupHandlers() {
  elements.taskGroup.addEventListener('keydown', (event) => {
    const taskGroupId =
      /** @type {HTMLInputElement } */ elements.taskGroup.value;
    if (event.key === 'Enter' && taskGroupId) {
      if (!isTaskGroupIdValid(taskGroupId)) {
        alert('The task group id was not valid');
        return;
      }
      const ids = getTaskGroupIds();
      ids.push(taskGroupId);

      const urlParams = new URLSearchParams(window.location.search);
      urlParams.set('taskGroupIds', ids.join(','));
      changeLocation(urlParams);
    }
  });

  const taskGroupNames = getTaskGroupNames();
  const taskGroupIds = getTaskGroupIds();
  for (const taskGroupId of getTaskGroupIds()) {
    buildTaskGroupRow(taskGroupId, taskGroupNames[taskGroupId] ?? '');
  }
  for (const taskGroupId of getIgnoredTaskGroupIds()) {
    buildTaskGroupRow(taskGroupId, taskGroupNames[taskGroupId] ?? '');
  }
  if (taskGroupIds.length) {
    elements.taskGroups.style.display = 'flex';
  }

  elements.fetchDependentTasks.checked = getFetchDependentTasks();
  elements.fetchDependentTasks.addEventListener('click', () => {
    const urlParams = new URLSearchParams(window.location.search);
    urlParams.set(
      'fetchDependentTasks',
      elements.fetchDependentTasks.checked.toString(),
    );
    changeLocation(urlParams);
  });
}

/**
 * @param {string} taskGroupId
 * @param {string} taskGroupName
 * @param {Element?} [insertBefore]
 */
function buildTaskGroupRow(taskGroupId, taskGroupName, insertBefore) {
  const { tr, createTD } = createTableRow(elements.taskGroupList, insertBefore);
  const taskGroupIds = getTaskGroupIds();
  const ignoredIds = getIgnoredTaskGroupIds();
  const isIgnored = ignoredIds.includes(taskGroupId);
  const isDependent = !taskGroupIds.includes(taskGroupId);

  if (isIgnored) {
    tr.style.opacity = '0.5';
  }

  {
    const div = document.createElement('div');
    if (isIgnored) {
      div.innerText = '(ignored) ';
    }
    const a = document.createElement('a');
    a.innerText = taskGroupId;
    a.setAttribute('href', `${server}/tasks/groups/${taskGroupId}`);
    div.appendChild(a);
    createTD(div);
  }

  const input = document.createElement('input');
  {
    if (taskGroupName) {
      input.value = taskGroupName;
    }
    if (isDependent) {
      input.placeholder = 'dependent task group';
    } else {
      input.placeholder = 'requested task group';
    }
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        setTaskgroupName(taskGroupId, input.value);
      }
    });
    input.addEventListener('blur', () => {
      setTaskgroupName(taskGroupId, input.value);
    });

    createTD(input);
  }

  const controls = document.createElement('div');
  controls.className = 'taskGroupControls';

  {
    const viewTasks = document.createElement('button');
    viewTasks.innerText = 'view tasks';
    viewTasks.addEventListener('click', () => {
      viewTask(taskGroupId).catch((error) => {
        updateInfoMessage('Error viewing tasks: ' + error);
      });
    });
    controls.appendChild(viewTasks);
  }

  {
    const closeButton = document.createElement('button');
    const rebuildRow = () => {
      const next = tr.nextElementSibling;
      tr.remove();
      // Rebuild this row.
      buildTaskGroupRow(taskGroupId, input.value, next);
      computeCost();
    };

    if (!isDependent) {
      // This is a normally requested task group id, it can be removed.
      closeButton.setAttribute('title', 'Remove the task group');
      closeButton.innerText = 'remove';
      closeButton.addEventListener('click', () => {
        const ids = taskGroupIds.filter((id) => id !== taskGroupId);
        const urlParams = new URLSearchParams(window.location.search);
        urlParams.set('taskGroupIds', [...new Set(ids)].join(','));
        changeLocation(urlParams);
      });
    } else if (isIgnored) {
      // This was a dependent task, but has been ignored.
      closeButton.setAttribute('title', 'Fetch this dependent task.');
      closeButton.innerText = 'show';
      closeButton.addEventListener('click', () => {
        const ids = getIgnoredTaskGroupIds().filter((id) => id !== taskGroupId);
        const urlParams = new URLSearchParams(window.location.search);
        urlParams.set('ignoredTaskGroupIds', [...new Set(ids)].join(','));
        replaceLocation(urlParams);
        rebuildRow();
      });
    } else {
      // This is a dependent task.
      closeButton.setAttribute('title', 'Ignore the depdendent task group');
      closeButton.innerText = 'hide';
      closeButton.addEventListener('click', () => {
        // This is a dependent task, hide it only.
        const ids = getIgnoredTaskGroupIds();
        ids.push(taskGroupId);
        const urlParams = new URLSearchParams(window.location.search);
        urlParams.set('ignoredTaskGroupIds', [...new Set(ids)].join(','));
        replaceLocation(urlParams);
        rebuildRow();
      });
    }

    controls.appendChild(closeButton);
  }

  createTD(controls);
}

async function computeCost() {
  const taskGroups = await taskGroupsPromise;
  const { allCosts, breakdownCosts } = getCosts(taskGroups);
  elements.costBreakdown.style.display = 'block';

  for (const { tbody, costs } of [
    { tbody: elements.costTotals, costs: allCosts },
    { tbody: elements.breakdownCosts, costs: breakdownCosts },
  ]) {
    for (const { description, duration, cost } of costs) {
      const { createTD } = createTableRow(tbody);
      createTD(description);
      createTD(cost);
      createTD(duration);
    }
  }
}

/**
 * @param {string} id
 * @param {string} name
 */
function setTaskgroupName(id, name) {
  const names = getTaskGroupNames();
  names[id] = name;
  const urlParams = new URLSearchParams(window.location.search);
  urlParams.set('taskGroupNames', JSON.stringify(names));
  // There is no reason to refresh the page here.
  replaceLocation(urlParams);
}

/**
 * @returns {string[]}
 */
function getTaskGroupIds() {
  const urlParams = new URLSearchParams(window.location.search);
  // Extract the taskGroupId parameter
  const taskGroupIdParam = urlParams.get('taskGroupIds');

  // "PuI6mYZPTUqAfyZMTgeUng", "S5E71GihQM6Te_KdrUmATw"

  if (!taskGroupIdParam) {
    return [];
  }

  // Parse the taskGroupId values into an array
  const taskGroupIds = taskGroupIdParam.split(',');
  return taskGroupIds;
}

/**
 * Should the dependent chunks be fetched?
 *
 * @returns {boolean}
 */
function getFetchDependentTasks() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('fetchDependentTasks') === 'true';
}

/**
 * @param {string} message
 */
function updateInfoMessage(message) {
  if (message) {
    elements.infoMessage.style.display = '';
    elements.infoMessage.innerText = message;
  } else {
    elements.infoMessage.style.display = 'none';
  }
}

/**
 * @returns {string[]}
 */
function getIgnoredTaskGroupIds() {
  const urlParams = new URLSearchParams(window.location.search);
  // Extract the taskGroupId parameter
  const taskGroupIdParam = urlParams.get('ignoredTaskGroupIds');

  // "PuI6mYZPTUqAfyZMTgeUng", "S5E71GihQM6Te_KdrUmATw"

  if (!taskGroupIdParam) {
    return [];
  }

  // Parse the taskGroupId values into an array
  const taskGroupIds = taskGroupIdParam.split(',');
  return taskGroupIds;
}

/**
 * @param {URLSearchParams} urlParams
 */
function changeLocation(urlParams) {
  const url = new URL(window.location.href);
  const newLocation = `${url.origin}${url.pathname}?${urlParams}`;

  // @ts-ignore
  window.location = newLocation;
}

/**
 * @param {URLSearchParams} urlParams
 */
function replaceLocation(urlParams) {
  const url = new URL(window.location.href);
  const newLocation = `${url.origin}${url.pathname}?${urlParams}`;
  history.replaceState(null, '', newLocation);
}

/**
 * @param {HTMLElement} tbody
 * @param {Element?} [insertBefore]
 */
function createTableRow(tbody, insertBefore) {
  const tr = document.createElement('tr');
  tbody.insertBefore(tr, insertBefore ?? null);

  return {
    tr,
    /**
     * @param {string | Element} [textOrEl]
     * @returns {HTMLTableCellElement}
     */
    createTD(textOrEl = '') {
      const el = document.createElement('td');
      if (typeof textOrEl === 'string') {
        el.innerText = textOrEl;
      } else {
        el.appendChild(textOrEl);
      }
      tr.appendChild(el);
      return el;
    },
  };
}

/**
 * Maps the taskGroupId to name.
 * @returns {Record<string, string>}
 */
function getTaskGroupNames() {
  const urlParams = new URLSearchParams(window.location.search);
  // Extract the taskGroupId parameter
  const taskGroupsString = urlParams.get('taskGroupNames');

  if (!taskGroupsString) {
    return {};
  }

  let taskGroups;
  try {
    taskGroups = JSON.parse(taskGroupsString);
  } catch {}

  if (!taskGroups || typeof taskGroups !== 'object') {
    console.error('Bad taskGroups', taskGroups);
    return {};
  }

  // Sanitize the results.
  /** @type {Record<string, string>} */
  const taskGroupsFinal = {};
  for (const [taskGroupId, name] of Object.entries(taskGroups)) {
    if (typeof name === 'string') {
      taskGroupsFinal[taskGroupId] = name;
    } else {
      console.error('Expected task group names to be a string', {
        taskGroupId,
        name,
      });
    }
  }
  return taskGroupsFinal;
}

/**
 * @param {string} taskGroupId
 */
async function viewTask(taskGroupId) {
  elements.taskGroupTasks.style.display = 'block';
  while (elements.taskGroupTasksBody.lastChild) {
    elements.taskGroupTasksBody.lastChild.remove();
  }

  const taskGroups = await taskGroupsPromise;
  const taskGroup = taskGroups.find(
    (taskGroup) => taskGroup.taskGroupId === taskGroupId,
  );
  if (!taskGroup) {
    elements.taskGroupTasks.innerText = 'Could not find that task group.';
    return;
  }
  const sortedTasks = [...taskGroup.tasks];
  sortedTasks.sort((a, b) =>
    a.task.metadata.name.localeCompare(b.task.metadata.name),
  );
  for (const { task, status } of sortedTasks) {
    const { createTD } = createTableRow(elements.taskGroupTasksBody);
    const a = document.createElement('a');
    a.href = `${server}/tasks/${status.taskId}`;
    a.innerText = task.metadata.name;
    createTD(a);
    createTD(status.state);
  }
}

/**
 * @param {TaskGroup[]} taskGroups
 */
function addDependentTaskGroups(taskGroups) {
  const taskGroupIds = getTaskGroupIds();
  const taskGroupNames = getTaskGroupNames();
  for (const taskGroup of taskGroups) {
    if (taskGroupIds.includes(taskGroup.taskGroupId)) {
      // This is not a dependent
      continue;
    }
    buildTaskGroupRow(
      taskGroup.taskGroupId,
      taskGroupNames[taskGroup.taskGroupId],
    );
  }
}

/**
 * @typedef {Object} CostRow
 *
 * @property {string} description
 * @property {number} hours
 * @property {string} duration
 * @property {string} cost
 */

/**
 * @param {TaskGroup[]} taskGroups
 * @returns {{allCosts: CostRow[], breakdownCosts: CostRow[]}}
 */
function getCosts(taskGroups) {
  // This is kind of hacky, but determine the cost of this run. The rates below
  // are the hourly rate.
  // https://docs.google.com/spreadsheets/d/1-mn60Kwp-IUJ99XfiUkxYv4DX-H6CQDwIUV4WnaykJk/edit#gid=118509819
  const costPreemptibleGPU = 0.99;
  const costNonPreemptibleGPU = 3.42;
  const costCpu = 0.14;
  const costs = {
    teacher: costPreemptibleGPU,
    student: costPreemptibleGPU,
    backtranslations: costPreemptibleGPU,
    bicleaner: costPreemptibleGPU,
    evaluate: costPreemptibleGPU,
  };
  /**
   * @param {TaskAndStatus} task
   * @returns {number}
   */
  const getCost = (task) =>
    task.task.workerType.endsWith('-standard')
      ? costNonPreemptibleGPU
      : costPreemptibleGPU;

  for (const taskGroup of taskGroups) {
    for (const task of taskGroup.tasks) {
      if (task.task.metadata.name.startsWith('train-student-')) {
        costs.student = getCost(task);
      }
      if (task.task.metadata.name.startsWith('train-teacher-')) {
        costs.teacher = getCost(task);
      }
      if (task.task.metadata.name.startsWith('train-backwards-')) {
        costs.teacher = getCost(task);
      }
      if (task.task.metadata.name.startsWith('bicleaner-ai-')) {
        costs.bicleaner = getCost(task);
      }
    }
  }
  /** @type {CostRow[]} */
  const allCosts = [];
  /** @type {CostRow[]} */
  const breakdownCosts = [];

  let table = allCosts;

  /**
   * @param {string} description
   * @param {number} hours
   * @param {string} duration
   * @param {number} [costPerHour]
   */
  function log(description, hours, duration, costPerHour) {
    let cost = '';
    if (costPerHour) {
      cost = `$${(costPerHour * hours).toFixed(2)}`;
    }
    table.push({ description, hours, duration, cost });
  }
  {
    const wallTime = getWallTime(
      mergeOverlappingTimeRanges(getTaskGroupTimeRanges(taskGroups)),
    );
    log(
      'Task group wall time',
      reportHours(wallTime),
      humanizeDuration(wallTime),
    );
  }
  const taskTimeRanges = getTaskTimeRanges(taskGroups);
  {
    const wallTime = getWallTime(mergeOverlappingTimeRanges(taskTimeRanges));
    log(
      'Task run wall time:',
      reportHours(wallTime),
      humanizeDuration(wallTime),
    );
  }

  const taskRunTime = getTimeRangeDuration(taskTimeRanges);

  /**
   * @param {string} message
   * @param {(task: TaskAndStatus) => boolean} filterFn
   * @param {number} [cost]
   * @returns {number}
   */
  const logFiltered = (message, filterFn, cost) => {
    const runTime = getTimeRangeDuration(
      getTaskTimeRanges(taskGroups, filterFn),
    );
    log(message, reportHours(runTime), humanizeDuration(runTime), cost);
    return runTime;
  };

  const gpuRunTime = logFiltered(
    'gpu tasks (non-preemptible)',
    ({ task }) =>
      task.workerType.includes('-gpu') && task.workerType.includes('-standard'),
    costNonPreemptibleGPU,
  );
  const gpuPreemptibleRunTime = logFiltered(
    'gpu tasks (preemptible)',
    ({ task }) =>
      task.workerType.includes('-gpu') &&
      !task.workerType.includes('-standard'),
    costPreemptibleGPU,
  );
  const cpuTime = taskRunTime - gpuPreemptibleRunTime - gpuRunTime;

  log('cpu tasks', reportHours(cpuTime), humanizeDuration(cpuTime), costCpu);

  // Put the total at the top.
  table.push({
    description: 'total',
    hours: reportHours(taskRunTime),
    duration: humanizeDuration(taskRunTime),
    cost:
      '$' +
      (
        reportHours(cpuTime) * costCpu +
        reportHours(gpuRunTime) * costNonPreemptibleGPU +
        reportHours(gpuPreemptibleRunTime) * costPreemptibleGPU
      ).toFixed(2),
  });

  // It's easier to compute these in reverse order.
  table.reverse();

  // Switch tables.
  table = breakdownCosts;

  logFiltered(
    'Train Backwards:',
    ({ task }) => {
      const { name } = task.metadata;
      return name.startsWith('train-backwards');
    },
    costs.backtranslations,
  );

  logFiltered(
    'Train Teacher:',
    ({ task }) => {
      const { name } = task.metadata;
      return name.startsWith('train-teacher');
    },
    costs.teacher,
  );

  logFiltered(
    'Train Student:',
    ({ task }) => {
      const { name } = task.metadata;
      return (
        name.startsWith('train-student-') || name.startsWith('finetune-student')
      );
    },
    costs.student,
  );

  logFiltered(
    'Synthesize student data (mono-src):',
    ({ task }) => {
      const { name } = task.metadata;
      return name.startsWith('translate-mono-src');
    },
    costPreemptibleGPU,
  );

  logFiltered(
    'Synthesize backtranslation data (mono-trg):',
    ({ task }) => {
      const { name } = task.metadata;
      return name.startsWith('translate-mono-trg');
    },
    costPreemptibleGPU,
  );

  logFiltered(
    'Translate "corpus" time',
    ({ task }) => {
      const { name } = task.metadata;
      return name.startsWith('translate-corpus');
    },
    costPreemptibleGPU,
  );

  logFiltered(
    'Compute alignments',
    ({ task }) => {
      const { name } = task.metadata;
      return name.startsWith('alignments-');
    },
    costCpu,
  );

  logFiltered(
    'Bicleaner AI',
    ({ task }) => {
      const { name } = task.metadata;
      return name.startsWith('bicleaner-ai-');
    },
    costs.bicleaner,
  );

  logFiltered(
    'Evaluations',
    ({ task }) => {
      const { name } = task.metadata;
      return name.startsWith('evaluate-');
    },
    costs.evaluate,
  );

  return { allCosts, breakdownCosts };
}

/**
 * @param {TimeRange[]} timeRanges
 */
function getTimeRangeDuration(timeRanges) {
  let taskTime = 0;
  for (const { start, end } of timeRanges) {
    if (start && end) {
      taskTime += end - start;
    }
  }
  return taskTime;
}

/**
 * @param {TimeRange[]} timeRangesWithNulls
 * @returns {number}
 */
function getWallTime(timeRangesWithNulls) {
  const timeRanges = mergeOverlappingTimeRanges(timeRangesWithNulls);

  let wallTime = 0;
  for (const timeRange of timeRanges) {
    const { start, end } = timeRange;
    if (start === null || end === null) {
      continue;
    }
    wallTime += end - start;
  }
  return wallTime;
}
/**
 * @param {number} ms
 */
function reportHours(ms) {
  return Math.floor((ms / 1000 / 60 / 60) * 10) / 10;
}

/**
 * @param {TimeRange[]} timeRangesOrNull
 * @returns {TimeRangeNonNull[]}
 */
function mergeOverlappingTimeRanges(timeRangesOrNull) {
  /** @type {TimeRangeNonNull[]} */
  const timeRanges = [];
  for (const timeRange of timeRangesOrNull) {
    const { start, end } = timeRange;
    if (start && end) {
      timeRanges.push({ start, end });
    }
  }

  // By start, ascending start time.
  const sorted = timeRanges.sort((a, b) => a.start - b.start);

  /**
   * @type {TimeRangeNonNull[]}
   */
  const result = [];

  for (const curr of sorted) {
    if (result.length === 0) {
      // Just add the first range.
      result.push(curr);
      continue;
    }
    const prev = result.pop();
    if (!prev) {
      throw new Error('Unexpected pop');
    }
    if (curr.end <= prev.end) {
      // Current range is completely inside previous
      result.push(prev);
      continue;
    }
    // Merges overlapping (<) and contiguous (==) ranges
    if (curr.start <= prev.end) {
      // Current range overlaps previous
      result.push({ start: prev.start, end: curr.end });
      continue;
    }
    // Ranges do not overlap
    result.push(prev);
    result.push(curr);
  }

  return result;
}

/**
 * @param {TaskGroup[]} taskGroups
 * @param {(task: TaskAndStatus) => boolean} filterTask
 * @returns {TimeRange[]}
 */
export function getTaskGroupTimeRanges(taskGroups, filterTask = () => true) {
  return taskGroups.map((taskGroup) => {
    /** @type {null | number} */
    let start = null;
    /** @type {null | number} */
    let end = null;
    for (const taskAndStatus of taskGroup.tasks) {
      const { runs } = taskAndStatus.status;
      if (runs && filterTask(taskAndStatus)) {
        for (const run of runs) {
          // Attempt to parse a Date. The results will be NaN on failure.
          const startedMS = new Date(
            run.started ?? run.resolved ?? '',
          ).valueOf();
          const resolvedMS = new Date(run.resolved ?? '').valueOf();

          if (!Number.isNaN(startedMS)) {
            if (start === null) {
              start = startedMS;
            } else {
              start = Math.min(start, startedMS);
            }
          }
          if (!Number.isNaN(resolvedMS)) {
            if (end === null) {
              end = resolvedMS;
            } else {
              end = Math.max(end, resolvedMS);
            }
          }
        }
      }
    }
    return { start, end };
  });
}

/**
 * @param {number} ms
 */
function humanizeDuration(ms) {
  if (ms < 0) {
    ms = -ms;
  }
  if (ms === 0) {
    return '';
  }

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const secondsRemainder = seconds % 60;
  const minutesRemainder = minutes % 60;
  const hoursRemainder = hours % 24;

  /**
   * @param {string} string
   */
  const removeLastComma = (string) => {
    if (string.endsWith(', ')) {
      return string.slice(0, string.length - 2);
    }
    return string;
  };

  let result = '';

  if (days > 0) {
    result += `${days} day${days > 1 ? 's' : ''}, `;
  }
  if (hoursRemainder > 0 || days > 0) {
    result += `${hoursRemainder} hour${hoursRemainder > 1 ? 's' : ''}, `;
  }
  if (days > 0) {
    // Truncate the results.
    return removeLastComma(result);
  }
  if (minutesRemainder > 0 || hours > 0) {
    result += `${minutesRemainder} minute${minutesRemainder > 1 ? 's' : ''}, `;
    return removeLastComma(result);
  }
  result += `${secondsRemainder} second${secondsRemainder > 1 ? 's' : ''}`;

  return result;
}

/**
 * @param {TaskGroup[]} taskGroups
 * @param {(task: TaskAndStatus) => boolean} filterFn
 * @returns {TimeRange[]}
 */
export function getTaskTimeRanges(taskGroups, filterFn = () => true) {
  /** @type {Array<TimeRange | null>} */
  const timeRangeOrNull = taskGroups.flatMap((taskGroup) => {
    return taskGroup.tasks.flatMap((task) => {
      if (!filterFn(task)) {
        return null;
      }
      const { runs } = task.status;
      if (!runs) {
        return [];
      }
      return runs.map((run) => {
        const start = new Date(run.started ?? run.resolved ?? '').valueOf();
        const end = new Date(run.resolved ?? '').valueOf();
        return { start, end };
      });
    });
  });

  // @ts-ignore
  return timeRangeOrNull.filter((timeRange) => timeRange);
}
