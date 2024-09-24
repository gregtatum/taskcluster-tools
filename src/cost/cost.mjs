import {
  fetchTaskGroup,
  getTasks,
  isTaskGroupIdValid,
} from '../taskcluster.mjs';
import {
  createTableRow,
  exposeAsGlobal,
  getElement,
  replaceLocation,
} from '../utils.mjs';
const server = 'https://firefox-ci-tc.services.mozilla.com';

// Work around ts(2686)
//   > 'd3' refers to a UMD global, but the current file is a module.
//   > Consider adding an import instead.
const d3 = window.d3;

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
  label: /** @type {HTMLInputElement} */ (getElement('label')),
  error: getElement('error'),
  costBreakdown: getElement('costBreakdown'),
  costTotals: /** @type {HTMLTableElement} */ (getElement('costTotals')),
  breakdownCosts: /** @type {HTMLTableElement} */ (
    getElement('breakdownCosts')
  ),
  costPreemptibleGPU: /** @type {HTMLInputElement} */ (
    getElement('costPreemptibleGPU')
  ),
  costNonPreemptibleGPU: /** @type {HTMLInputElement} */ (
    getElement('costNonPreemptibleGPU')
  ),
  costCpu: /** @type {HTMLInputElement} */ (getElement('costCpu')),
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

    if (getFetchDependentTasks()) {
      // Don't re-fetch dependents, as we will likely fetch new ones, and it's quicker
      // not to look it up again.
      const urlParams = new URLSearchParams(window.location.search);
      const ids = taskGroups.map((taskGroup) => taskGroup.taskGroupId);
      urlParams.set('taskGroupIds', [...new Set(ids)].join(','));
      urlParams.set('fetchDependentTasks', 'false');
      replaceLocation(urlParams);
    }

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
  for (const taskGroupId of taskGroupIds) {
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

  /**
   * @param {string} key
   */
  function handleCostChangeFn(key) {
    /**
     * @param {Event} event
     */
    return (event) => {
      const urlParams = new URLSearchParams(window.location.search);

      /** @type {HTMLInputElement} */
      const input = /** @type {any} */ (event.target);
      urlParams.set(key, input.value);
      replaceLocation(urlParams);

      localStorage.setItem(
        'costPreemptibleGPU',
        elements.costPreemptibleGPU.value,
      );
      localStorage.setItem(
        'costNonPreemptibleGPU',
        elements.costNonPreemptibleGPU.value,
      );
      localStorage.setItem('costCpu', elements.costCpu.value);

      computeCost();
    };
  }

  {
    // Cost controls.
    const urlParams = new URLSearchParams(window.location.search);

    // Initialize the values from the urlParams.
    const costNonPreemptibleGPU =
      urlParams.get('costNonPreemptibleGPU') ||
      localStorage.getItem('costNonPreemptibleGPU');
    if (costNonPreemptibleGPU) {
      elements.costNonPreemptibleGPU.value = costNonPreemptibleGPU;
    }
    const costPreemptibleGPU =
      urlParams.get('costPreemptibleGPU') ||
      localStorage.getItem('costPreemptibleGPU');
    if (costPreemptibleGPU) {
      elements.costPreemptibleGPU.value = costPreemptibleGPU;
    }
    const costCpu = urlParams.get('costCpu') || localStorage.getItem('costCpu');
    if (costCpu) {
      elements.costCpu.value = costCpu;
    }

    elements.costNonPreemptibleGPU.addEventListener(
      'change',
      handleCostChangeFn('costNonPreemptibleGPU'),
    );
    elements.costPreemptibleGPU.addEventListener(
      'change',
      handleCostChangeFn('costPreemptibleGPU'),
    );
    elements.costCpu.addEventListener('change', handleCostChangeFn('costCpu'));
  }

  elements.label.value = getLabel();
  elements.label.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      setLabel(elements.label.value);
    }
  });
  elements.label.addEventListener('blur', () => {
    setLabel(elements.label.value);
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
    if (isDependent) {
      div.innerText = '⮑ ';
    }
    if (isIgnored) {
      div.innerText += '(ignored) ';
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
      input.focus();
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
        taskGroupsPromise = ensureTaskGroupExists(taskGroupId);
        rebuildRow();
        computeCost();
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
        computeCost();
      });
    }

    controls.appendChild(closeButton);
  }

  createTD(controls);
}

/**
 * We may not have fetched this task group.
 * @param {string} taskGroupId
 */
async function ensureTaskGroupExists(taskGroupId) {
  const taskGroups = await taskGroupsPromise;
  if (!taskGroups.find((taskGroup) => taskGroup.taskGroupId === taskGroupId)) {
    return [...taskGroups, await fetchTaskGroup(server, taskGroupId)];
  }
  return taskGroups;
}

/**
 * @param {number} cost
 * @returns {string}
 */
function formatCost(cost) {
  return '$' + cost.toFixed(2);
}

async function getVisibleTaskGroup() {
  const taskGroups = await taskGroupsPromise;
  const ignored = new Set(getIgnoredTaskGroupIds());
  return taskGroups.filter((taskGroup) => !ignored.has(taskGroup.taskGroupId));
}

async function computeCost() {
  const taskGroups = await getVisibleTaskGroup();
  const { allCosts, breakdownCosts } = getCosts(taskGroups);
  elements.costBreakdown.style.display = 'block';

  buildPieChart(breakdownCosts);

  for (const { tbody, costs } of [
    { tbody: elements.costTotals, costs: allCosts },
    { tbody: elements.breakdownCosts, costs: breakdownCosts },
  ]) {
    while (tbody.lastChild) {
      // Clear out the old costs.
      tbody.lastChild.remove();
    }
    for (const {
      description,
      time,
      cost,
      timeBreakdown,
      costBreakdown,
    } of costs) {
      if (cost === 0) {
        continue;
      }
      const { createTD } = createTableRow(tbody);
      createTD(description);
      createTD(formatCost(cost));
      createTD(humanizeDuration(time));

      for (const state of ['completed', 'running', 'failed', 'exception']) {
        const stateCost = costBreakdown[state] ?? 0;
        const stateTime = timeBreakdown[state] ?? 0;
        if (stateCost) {
          const stateTD = createTD(formatCost(stateCost));
          stateTD.title = humanizeDuration(stateTime);
        } else {
          createTD();
        }
      }
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
 * @returns {string}
 */
function getLabel() {
  const urlParams = new URLSearchParams(window.location.search);
  // Extract the taskGroupId parameter
  return urlParams.get('label') ?? '';
}

/**
 * @param {string} label
 */
function setLabel(label) {
  const urlParams = new URLSearchParams(window.location.search);
  urlParams.set('label', label);
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
  taskGroupsPromise = ensureTaskGroupExists(taskGroupId);

  const taskGroups = await taskGroupsPromise;
  elements.taskGroupTasks.style.display = 'block';
  while (elements.taskGroupTasksBody.lastChild) {
    elements.taskGroupTasksBody.lastChild.remove();
  }

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
  for (const taskGroupId of getIgnoredTaskGroupIds()) {
    if (taskGroups.find((taskGroup) => taskGroup.taskGroupId === taskGroupId)) {
      // Only show the ignored rows if they exist.
      buildTaskGroupRow(taskGroupId, taskGroupNames[taskGroupId] ?? '');
    }
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
 * @param {TaskAndStatus} task
 */
function getWorkerCost(task) {
  const { workerType } = task.task;

  // Example CPU worker types
  //   b-linux-large-gcp
  //   b-linux-v100-gpu-4-1tb
  // Example GPU:
  //   b-linux-v100-gpu
  //   b-linux-v100-gpu-4-300gb
  // Example GPU (non-preemptible)
  //   b-linux-large-gcp-1tb-standard

  if (workerType.endsWith('-gpu') || workerType.includes('-gpu-')) {
    // GPU machine.
    return workerType.endsWith('-standard')
      ? Number(elements.costNonPreemptibleGPU.value)
      : Number(elements.costPreemptibleGPU.value);
  }

  // CPU machine
  return Number(elements.costCpu.value);
}

/**
 * @param {TaskGroup[]} taskGroups
 * @returns {{allCosts: TimeCostBreakdown[], breakdownCosts: TimeCostBreakdown[]}}
 */
function getCosts(taskGroups) {
  const taskTimeRanges = getTaskTimeRanges(taskGroups);
  const totalTimeAndCost = getTimeCostBreakdown('total', taskTimeRanges);

  /**
   * @param {string} description
   * @param {(task: TaskAndStatus) => boolean} filterFn
   * @returns {TimeCostBreakdown}
   */
  const filterTasks = (description, filterFn) =>
    getTimeCostBreakdown(description, getTaskTimeRanges(taskGroups, filterFn));

  /** @type {TimeCostBreakdown[]} */
  const allCosts = [
    totalTimeAndCost,
    filterTasks('cpu tasks', ({ task }) => !task.workerType.includes('-gpu')),
    filterTasks(
      'gpu tasks (preemptible)',
      ({ task }) =>
        task.workerType.includes('-gpu') &&
        !task.workerType.includes('-standard'),
    ),
    filterTasks(
      'gpu tasks (non-preemptible)',
      ({ task }) =>
        task.workerType.includes('-gpu') &&
        task.workerType.includes('-standard'),
    ),
  ];

  /** @type {TimeCostBreakdown[]} */
  const breakdownCosts = [
    filterTasks('train backwards', ({ task }) =>
      task.metadata.name.startsWith('train-backwards'),
    ),

    filterTasks('train teacher', ({ task }) =>
      task.metadata.name.startsWith('train-teacher'),
    ),

    filterTasks(
      'train student',
      ({ task }) =>
        task.metadata.name.startsWith('train-student-') ||
        task.metadata.name.startsWith('finetune-student'),
    ),

    filterTasks(
      'synthesize backtranslation data (translate-mono-trg)',
      ({ task }) => task.metadata.name.startsWith('translate-mono-trg'),
    ),

    filterTasks('synthesize student data (translate-mono-src)', ({ task }) =>
      task.metadata.name.startsWith('translate-mono-src'),
    ),

    filterTasks('synthesize student data (translate-corpus)', ({ task }) =>
      task.metadata.name.startsWith('translate-corpus'),
    ),

    filterTasks('compute alignments', ({ task }) =>
      task.metadata.name.startsWith('alignments-'),
    ),

    filterTasks('bicleaner ai', ({ task }) =>
      task.metadata.name.startsWith('bicleaner-ai-'),
    ),

    filterTasks('evaluations', ({ task }) =>
      task.metadata.name.startsWith('evaluate-'),
    ),
  ];

  {
    // Find out the final costs that weren't accounted for.
    /** @type {TimeCostBreakdown} */
    const otherCosts = {
      description: 'other',
      timeBreakdown: {},
      costBreakdown: {},
      time: 0,
      cost: 0,
    };
    // First sum up the broken out costs.
    for (const brokenOutCosts of breakdownCosts) {
      otherCosts.time += brokenOutCosts.time;
      otherCosts.cost += brokenOutCosts.cost;
      for (const [k, v] of Object.entries(brokenOutCosts.timeBreakdown)) {
        otherCosts.timeBreakdown[k] = (otherCosts.timeBreakdown[k] ?? 0) + v;
      }
      for (const [k, v] of Object.entries(brokenOutCosts.costBreakdown)) {
        otherCosts.costBreakdown[k] = (otherCosts.costBreakdown[k] ?? 0) + v;
      }
    }
    // Now compute the "other" by subtracting from the totalBreakdown
    otherCosts.time = totalTimeAndCost.time - otherCosts.time;
    otherCosts.cost = totalTimeAndCost.cost - otherCosts.cost;
    for (const k of Object.keys(otherCosts.timeBreakdown)) {
      otherCosts.timeBreakdown[k] =
        totalTimeAndCost.timeBreakdown[k] - otherCosts.timeBreakdown[k];
    }
    for (const k of Object.keys(otherCosts.costBreakdown)) {
      otherCosts.costBreakdown[k] =
        totalTimeAndCost.costBreakdown[k] - otherCosts.costBreakdown[k];
    }

    breakdownCosts.push(otherCosts);
  }

  return { allCosts, breakdownCosts };
}

/**
 * @typedef {Object} TimeCostBreakdown
 * @property {string} description
 * @property {Record<string, number>} timeBreakdown
 * @property {Record<string, number>} costBreakdown
 * @property {number} time
 * @property {number} cost
 */

/**
 * @param {string} description
 * @param {TimeRangeCost[]} timeRanges
 * @returns {TimeCostBreakdown}
 */
function getTimeCostBreakdown(description, timeRanges) {
  /** @type {Record<string, number>} */
  const timeBreakdown = {};
  /** @type {Record<string, number>} */
  const costBreakdown = {};
  let time = 0;
  let finalCost = 0;
  for (const { start, end, costPerHour, state } of timeRanges) {
    if (start && end) {
      const duration = end - start;
      time += duration;
      const cost = costPerHour * msToHours(duration);
      finalCost += cost;
      timeBreakdown[state] = (timeBreakdown[state] ?? 0) + duration;
      costBreakdown[state] = (costBreakdown[state] ?? 0) + cost;
    }
  }
  return { timeBreakdown, costBreakdown, time, cost: finalCost, description };
}

/**
 * @param {number} ms
 */
function msToHours(ms) {
  return Math.floor((ms / 1000 / 60 / 60) * 10) / 10;
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
    result += `${hoursRemainder} hr${hoursRemainder > 1 ? 's' : ''}, `;
  }
  if (days > 0) {
    // Truncate the results.
    return removeLastComma(result);
  }
  if (minutesRemainder > 0 || hours > 0) {
    result += `${minutesRemainder} min${minutesRemainder > 1 ? 's' : ''}, `;
    return removeLastComma(result);
  }
  result += `${secondsRemainder} sec${secondsRemainder > 1 ? 's' : ''}`;

  return result;
}

/**
 * @param {TaskGroup[]} taskGroups
 * @param {(task: TaskAndStatus) => boolean} filterFn
 * @returns {TimeRangeCost[]}
 */
function getTaskTimeRanges(taskGroups, filterFn = () => true) {
  /** @type {Array<TimeRangeCost | null>} */
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
        /** @type {TimeRangeCost} */
        const timeRange = {
          start,
          end,
          state: run.state,
          costPerHour: getWorkerCost(task),
        };
        return timeRange;
      });
    });
  });

  // @ts-ignore
  return timeRangeOrNull.filter((timeRange) => timeRange);
}

/**
 * @param {TimeCostBreakdown[]} costs
 */
function buildPieChart(costs) {
  // Set the dimensions and margins of the graph
  const width = 600;
  const height = 600;
  const margin = 80;
  const legendWidth = 400;
  const labelSpacing = 40;

  // Sort the costs by time.
  costs = [...costs];
  costs.sort((a, b) => b.cost - a.cost);

  // Clear out any old chats
  d3.select('#chart').html('');

  // Append the svg object to the div called 'chart'
  const svg = d3
    .select('#chart')
    .append('svg')
    .attr('width', width + legendWidth)
    .attr('height', height);

  // Set the color scale
  const color = d3
    .scaleOrdinal()
    .domain(costs.map((d) => d.description))
    .range(d3.schemeSet2);

  const tooltip = d3
    .select('body')
    .append('div')
    .style('position', 'absolute')
    .style('background', 'white')
    .style('padding', '5px')
    .style('border', '1px solid black')
    .style('border-radius', '5px')
    .style('pointer-events', 'none')
    .style('opacity', 0);

  {
    // Build the pie chart.

    // Compute the position of each group on the pie
    // @ts-ignore
    const pie = d3.pie().value((d) => d.cost);
    // @ts-ignore
    const pieData = pie(costs);
    const g = svg
      .append('g')
      .attr('transform', `translate(${width / 2},${height / 2})`);

    const outerRadius = Math.min(width, height) / 2 - margin;
    const innerRadius = outerRadius * 0.2;

    /**
     * @typedef {Object} PieData
     * @property {TimeCostBreakdown} data
     * @property {number} value
     * @property {number} index
     * @property {number} startAngle
     * @property {number} endAngle
     * @property {number} padAngle
     */

    /**
     * D3's TypeScript types don't really work. This coerces the `d` value to the proper
     * type that is passed.
     * @type {(d: any) => PieData}
     */
    const asPieData = (d) => d;

    const arcGenerator = d3
      .arc()
      .innerRadius(innerRadius)
      .outerRadius(outerRadius)
      .cornerRadius(5)
      .padAngle(0.015);

    // Build the pie chart
    g.selectAll('whatever')
      .data(pieData)
      .join('path')
      // @ts-ignore
      .attr('d', arcGenerator)
      .attr('fill', (d) => color(asPieData(d).data.description))
      .attr('stroke', '#000a')
      .style('stroke-width', '2px')
      .style('opacity', 0.7)
      .on('mouseover', (_event, d) => {
        const task = asPieData(d).data.description;
        const cost = formatCost(asPieData(d).data.cost);
        tooltip
          //
          .style('opacity', 1)
          .html(`Task: ${task}<br><br>Cost: ${cost}`);
      })
      .on('mousemove', function (_event) {
        // Coerce the type.
        /** @type {MouseEvent} */
        const event = /** @type {any} */ (_event);

        tooltip
          .style('left', event.pageX + 10 + 'px')
          .style('top', event.pageY - 15 + 'px');
      })
      .on('mouseout', function () {
        tooltip.style('opacity', 0);
      });

    // Add labels
    g.selectAll('whatever')
      .data(pieData)
      .join('text')
      .text((d) => formatCost(asPieData(d).data.cost))
      .attr('title', (d) => asPieData(d).data.description)
      .attr('transform', (d) => {
        const [x, y] = d3
          .arc()
          .innerRadius(0)
          .outerRadius(outerRadius * 2 + labelSpacing)
          // @ts-ignore
          .centroid(d);
        return `translate(${x},${y})`;
      })
      .style('text-anchor', (d) =>
        (d.endAngle + d.startAngle) / 2 > Math.PI ? 'end' : 'start',
      )
      .style('font-size', 12);
  }
  {
    // Add legend
    const g = svg
      .append('g')
      .attr('transform', `translate(${width + margin}, ${margin})`);

    const items = g
      .selectAll('legend-item')
      .data(costs)
      .enter()
      .append('g')
      .attr('transform', (_d, i) => `translate(0, ${i * 20})`);

    // Legend colored squares.
    items
      .append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', 10)
      .attr('height', 10)
      .attr('fill', (d) => color(d.description));

    // Legend text.
    items
      .append('text')
      .attr('x', 20)
      .attr('y', 10)
      .text((d) => `${formatCost(d.cost)} - ${d.description}`)
      .style('font-size', 12)
      .style('text-anchor', 'start');
  }
}
