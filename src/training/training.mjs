import { isTaskGroupIdValid } from '../taskcluster.mjs';

const server = 'https://firefox-ci-tc.services.mozilla.com';

const elements = {
  taskGroup: /** @type {HTMLInputElement} */ (getElement('taskGroup')),
  loading: getElement('loading'),
  controls: getElement('controls'),
  table: /** @type {HTMLTableElement} */ (getElement('table')),
  tbody: getElement('tbody'),
  showAll: /** @type {HTMLInputElement} */ (getElement('showAll')),
  trainTaskGroupIds: getElement('trainTaskGroupIds'),
};

/** @type {Array<TaskGroup>} */
const taskGroups = [];
// @ts-ignore
window.taskGroups = taskGroups;
console.log('window.taskGroups', taskGroups);

/**
 * @param {string} id
 */
function getElement(id) {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error('Could not find element by id: ' + id);
  }
  return el;
}

document.addEventListener('DOMContentLoaded', () => {
  main().catch((error) => {
    console.error(error);
    getElement('error').style.display = 'block';
  });
});

async function main() {
  elements.showAll.checked = getShowAll();
  console.log(`!!! `, elements.showAll, getShowAll());
  elements.showAll.addEventListener('click', () => {
    const urlParams = new URLSearchParams(window.location.search);
    urlParams.set('showAll', elements.showAll.checked.toString());
    changeLocation(urlParams);
  });

  for (const trainTaskGroupId of getTrainTaskGroupIds()) {
    const { tr, createTD } = createTableRow(elements.trainTaskGroupIds);
    createTD('Train Task Group');
    {
      const a = document.createElement('a');
      a.innerText = trainTaskGroupId;
      a.href = `${server}/tasks/groups/${trainTaskGroupId}`;
      a.target = '_blank';
      createTD(a);
    }
    {
      const button = document.createElement('button');
      button.innerText = 'remove';
      button.addEventListener('click', () => {
        const ids = getTrainTaskGroupIds();

        const urlParams = new URLSearchParams(window.location.search);
        urlParams.set(
          'taskGroupIds',
          ids.filter((id) => id !== trainTaskGroupId).join(','),
        );
        changeLocation(urlParams);
      });
      createTD(button);
    }
    elements.trainTaskGroupIds.appendChild(tr);
  }
  elements.taskGroup.addEventListener('keydown', (event) => {
    const taskGroupId =
      /** @type {HTMLInputElement } */ elements.taskGroup.value;
    if (event.key === 'Enter' && taskGroupId) {
      if (!isTaskGroupIdValid(taskGroupId)) {
        alert('The task group id was not valid');
        return;
      }
      const ids = getTrainTaskGroupIds();
      ids.push(taskGroupId);

      const urlParams = new URLSearchParams(window.location.search);
      urlParams.set('taskGroupIds', ids.join(','));
      changeLocation(urlParams);
    }
  });

  buildTable();
}

/**
 * @param {string} taskGroupId
 * @returns {Promise<TaskGroup>}
 */
async function fetchTaskGroup(taskGroupId) {
  const listUrl = `${server}/api/queue/v1/task-group/${taskGroupId}/list`;
  const response = await fetch(listUrl);
  if (!response.ok) {
    const error = await response.json();
    console.error();
    return Promise.reject(new Error(error));
  }
  return await response.json();
}

/**
 * @param {string} taskId
 * @returns {Promise<Task>}
 */
export async function fetchTask(taskId) {
  const taskUrl = `${server}/api/queue/v1/task/${taskId}`;
  const response = await fetch(taskUrl);
  if (!response.ok) {
    const error = await response.json();
    console.error();
    return Promise.reject(new Error(error));
  }
  return await response.json();
}

/**
 * @param {string} taskId
 * @returns {Promise<TaskDependents>}
 */
async function fetchDependents(taskId) {
  const taskUrl = `${server}/api/queue/v1/task/${taskId}/dependents`;

  const response = await fetch(taskUrl);
  if (!response.ok) {
    const error = await response.json();
    console.error();
    return Promise.reject(new Error(error));
  }
  return await response.json();
}

/**
 * @param {HTMLElement} tbody
 */
function createTableRow(tbody) {
  const tr = document.createElement('tr');
  tbody.appendChild(tr);

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

function buildTable() {
  /** @type {Map<string, Array<TaskAndStatus[]>>} */
  const taskGroupsByLangPair = new Map();

  const fetchPromises = getTrainTaskGroupIds().map(async (trainTaskGroupId) => {
    const listUrl = `${server}/api/queue/v1/task-group/${trainTaskGroupId}/list`;

    console.log('Fetching Task Group:', listUrl);
    const actionTaskGroup = await fetchTaskGroup(trainTaskGroupId);
    console.log('Action task group', actionTaskGroup);

    const trainTasks = actionTaskGroup.tasks.filter(
      ({ task }) => task.metadata.name === 'Action: Train',
    );

    console.log('trainTasks', trainTasks);
    // @ts-ignore
    window.trainTasks = trainTasks;

    // Go through all of the train actions.
    const promises = trainTasks.map(async (trainActionTask) => {
      const { tasks } = await fetchDependents(trainActionTask.status.taskId);
      const { tr, createTD } = createTableRow(elements.tbody);
      const [firstTask] = tasks;
      if (!firstTask) {
        if (getShowAll()) {
          createTD(
            `${trainActionTask.status.taskId} ${trainActionTask.status.state}`,
          );
        }
      } else {
        tr.dataset.taskGroupId = firstTask.task.taskGroupId;
        await buildTableRow(
          createTD,
          firstTask.task.taskGroupId,
          taskGroupsByLangPair,
          trainActionTask,
        );
      }
    });

    return Promise.allSettled(promises);
  });

  Promise.allSettled(fetchPromises).then(() => {
    for (const taskGroups of taskGroupsByLangPair.values()) {
      // Sort newest to oldest
      taskGroups.sort((aList, bList) => {
        const a = aList[0].task.created;
        const b = bList[0].task.created;
        return a < b ? 1 : a > b ? -1 : 0;
      });
      for (const taskGroup of taskGroups.slice(1)) {
        const { taskGroupId } = taskGroup[0].task;
        /** @type {HTMLElement | null} */
        const tr = document.querySelector(
          `tr[data-task-group-id="${taskGroupId}"]`,
        );
        if (!tr) {
          throw new Error('Could not find tr for task group.');
        }
        if (getShowAll()) {
          tr.classList.add('older-taskgroup');
        } else {
          tr.style.display = 'none';
        }
      }
    }
    taskGroupsByLangPair;

    // @ts-ignore
    window.taskGroupsByLangPair = taskGroupsByLangPair;
    console.log('taskGroupsByLangPair', taskGroupsByLangPair);
  });

  elements.loading.style.display = 'none';
  elements.table.style.display = 'table';
}

/**
 * @param {(text: string | Element) => HTMLTableCellElement} createTD
 * @param {string} taskGroupId
 * @param {Map<string, Array<TaskAndStatus[]>>} taskGroupsByLangPair
 * @param {TaskAndStatus} trainActionTask
 */
async function buildTableRow(
  createTD,
  taskGroupId,
  taskGroupsByLangPair,
  trainActionTask,
) {
  const tasks = (await fetchTaskGroup(taskGroupId)).tasks;
  const taskGroupUrl = `${server}/tasks/groups/${taskGroupId}`;

  {
    // Build the task group ID link
    const a = document.createElement('a');
    a.innerText = taskGroupId;
    a.href = taskGroupUrl;
    a.target = '_blank';
    createTD(a);
  }

  // Attempt to find a langpair
  let langPair = '';
  for (const { task } of tasks) {
    const match = task.metadata.name.match(/-([a-z]{2,3}-[a-z]{2,3})$/);
    if (match) {
      langPair = match[1];
      break;
    }
  }

  {
    // Keep track of this list.
    let list = taskGroupsByLangPair.get(langPair);
    if (!list) {
      list = [];
      taskGroupsByLangPair.set(langPair, list);
    }
    list.push(tasks);
  }

  {
    const button = document.createElement('button');
    button.innerHTML = 'config';
    button.addEventListener(
      'click',
      copyConfigHandler(button, trainActionTask),
    );
    const td = createTD(langPair + ' ');
    td.appendChild(button);
  }

  console.log(langPair, tasks);

  /** @type {Record<TaskState, number>} */
  const stateCounts = {
    completed: 0,
    running: 0,
    failed: 0,
    exception: 0,
    pending: 0,
    unscheduled: 0,
  };

  /** @type {Record<string, "not-started" | "running" | "completed">} */
  const heavyStepsCompleted = {
    'translate-mono-': 'not-started',
    'bicleaner-ai-': 'not-started',
    'train-backwards-': 'not-started',
    'train-teacher-': 'not-started',
    'train-student-': 'not-started',
    'finetune-student-': 'not-started',
  };

  for (const { status, task } of tasks) {
    // Compute the status counts
    const count = stateCounts[status.state];
    stateCounts[status.state] = count + 1;

    // Compute if a heavy step was completed.
    for (const taskNamePrefix of Object.keys(heavyStepsCompleted)) {
      if (task.metadata.name.startsWith(taskNamePrefix)) {
        if (status.state === 'completed') {
          if (heavyStepsCompleted[taskNamePrefix] === 'not-started') {
            heavyStepsCompleted[taskNamePrefix] = 'completed';
          }
        } else if (status.state === 'running') {
          heavyStepsCompleted[taskNamePrefix] = 'running';
        }
      }
    }
  }

  /**
   * @param {TaskState} status
   * @param {string} [color]
   * @param {string} [stage]
   */
  const addStateCount = (status, color, stage) => {
    const a = document.createElement('a');
    a.innerText = String(stateCounts[status] ?? 0);
    a.href = taskGroupUrl;
    a.target = '_blank';
    const el = createTD(a);
    if (color && stateCounts[status]) {
      el.style.background = color;
      a.style.color = '#fff';
    }
    if (stage) {
      const span = document.createElement('span');
      span.innerText = ' ' + stage;
      el.appendChild(span);
    }
  };

  let completed = '';
  let running = '';
  for (const [step, state] of Object.entries(heavyStepsCompleted)) {
    if (state === 'completed') {
      completed = step;
    }
    if (state === 'running') {
      running = step;
    }
  }
  // Take off the last "-"
  completed = completed.slice(0, completed.length - 1);
  running = running.slice(0, running.length - 1);

  addStateCount('completed', undefined, completed);
  addStateCount('running', undefined, running);
  addStateCount('failed', '#f44336');
  addStateCount('exception', '#ffa000');
  addStateCount('pending');
  addStateCount('unscheduled');

  // Sort by langpair.
  sortTable(elements.table, 1);
}

/**
 * @param {HTMLButtonElement} button
 * @param {TaskAndStatus} trainActionTask
 */
function copyConfigHandler(button, trainActionTask) {
  return async () => {
    try {
      button.innerText = 'downloading...';
      button.disabled = true;
      const { taskId } = trainActionTask.status;
      const artifactPath = 'public/parameters.yml';
      const taskUrl = `${server}/api/queue/v1/task/${taskId}/artifacts/${artifactPath}`;
      const response = await fetch(taskUrl);
      const configText = await response.text();

      // Extract the config
      const parts = configText.split('\ntraining_config:\n');

      // Collect all the lines of the same indent level
      let finalConfig = '';
      for (const line of parts[1].split('\n')) {
        if (line.startsWith('  ')) {
          finalConfig += line.slice(2) + '\n';
        } else {
          break;
        }
      }

      await navigator.clipboard.writeText(finalConfig);

      button.innerText = 'config copied';
      button.disabled = false;
    } catch (error) {
      alert('Failed to get the training config');
    }
  };
}

function getTrainTaskGroupIds() {
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
 * @param {URLSearchParams} urlParams
 */
function changeLocation(urlParams) {
  const url = new URL(window.location.href);
  const newLocation = `${url.origin}${url.pathname}?${urlParams}`;

  // @ts-ignore
  window.location = newLocation;
}

/**
 * @param {HTMLTableElement} table
 * @param {number} columnIndex
 */
function sortTable(table, columnIndex, dir = 'asc') {
  let switchCount = 0;
  let shouldSwitch = false;
  let switching = true;
  while (switching) {
    switching = false;
    // @ts-ignore
    const rows = table.rows;

    let i;
    for (i = 1; i < rows.length - 1; i++) {
      shouldSwitch = false;

      const x =
        rows[i].querySelectorAll('td')[columnIndex]?.innerText.toLowerCase() ??
        '';

      const y =
        rows[i + 1]
          .querySelectorAll('td')
          [columnIndex]?.innerText.toLowerCase() ?? '';

      if (dir == 'asc') {
        if (x > y) {
          shouldSwitch = true;
          break;
        }
      } else if (dir == 'desc') {
        if (x < y) {
          shouldSwitch = true;
          break;
        }
      }
    }

    if (shouldSwitch) {
      rows[i].parentNode?.insertBefore(rows[i + 1], rows[i]);
      switching = true;
      switchCount++;
    } else {
      if (switchCount == 0 && dir == 'asc') {
        dir = 'desc';
        switching = true;
      }
    }
  }
}

/**
 * Should the task chunks be merged?
 *
 * @returns {boolean}
 */
function getShowAll() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('showAll') === 'true';
}
