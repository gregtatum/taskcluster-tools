import { isTaskGroupIdValid } from '../taskcluster.mjs';
import { googleComet } from './eval.mjs';

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
  elements.showAll.addEventListener('click', () => {
    const urlParams = new URLSearchParams(window.location.search);
    urlParams.set('showAll', elements.showAll.checked.toString());
    changeLocation(urlParams);
  });

  for (const [
    taskGroupIdIndex,
    { taskGroupId, name },
  ] of getTrainTaskGroups().entries()) {
    const { tr, createTD } = createTableRow(elements.trainTaskGroupIds);
    createTD('Train Task Group');
    {
      const a = document.createElement('a');
      a.innerText = taskGroupId;
      a.href = `${server}/tasks/groups/${taskGroupId}`;
      a.target = '_blank';
      createTD(a);
    }
    {
      const input = document.createElement('input');
      input.value = name;
      input.placeholder = 'Add a name';
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          const names = getTrainTaskGroups().map(({ name }) => name);
          names[taskGroupIdIndex] = input.value ?? '';

          const urlParams = new URLSearchParams(window.location.search);
          urlParams.set('taskGroupNames', JSON.stringify(names));
          changeLocation(urlParams);
        }
      });
      createTD(input);
    }
    {
      const button = document.createElement('button');
      button.innerText = 'remove';
      button.addEventListener('click', () => {
        const ids = [];
        const names = [];
        for (const { taskGroupId: id, name } of getTrainTaskGroups()) {
          if (taskGroupId !== id) {
            ids.push(id);
            names.push(name);
          }
        }
        const urlParams = new URLSearchParams(window.location.search);
        urlParams.set(
          'taskGroupIds',
          ids.filter((id) => id !== taskGroupId).join(','),
        );
        urlParams.set('taskGroupNames', JSON.stringify(names));
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

    const hidden = getHiddenTaskGroups();
    const showAll = getShowAll();

    // Go through all of the train actions.
    const promises = trainTasks.map(async (trainActionTask) => {
      const { tasks } = await fetchDependents(trainActionTask.status.taskId);
      const [firstTask] = tasks;
      if (!firstTask) {
        const { createTD } = createTableRow(elements.tbody);
        if (getShowAll()) {
          createTD(
            `${trainActionTask.status.taskId} ${trainActionTask.status.state}`,
          );
        }
      } else {
        const isHidden = hidden.includes(firstTask.task.taskGroupId);
        if (showAll || !isHidden) {
          const { tr, createTD } = createTableRow(elements.tbody);

          tr.dataset.taskGroupId = firstTask.task.taskGroupId;
          await buildTableRow(
            createTD,
            firstTask.task.taskGroupId,
            taskGroupsByLangPair,
            trainActionTask,
            isHidden,
          );
        }
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
 * @typedef {object} ScoreDetails
 * @prop {string} langPair
 * @prop {number} score
 * @prop {Date} created
 * @prop {string} taskId
 */

/** @type {Record<string, Array<ScoreDetails>>} */
const scores = {
  teacher1: [],
  teacher2: [],
  teacherensemble: [],
  student: [],
  studentquantized: [],
};

function updateScores() {
  if (getShowAll()) {
    // Do not update all of the scores if the scores are hidden.
    return;
  }
  for (const [name, scoresList] of Object.entries(scores)) {
    /** @type {Map<string, ScoreDetails>} */
    const latestScores = new Map();

    for (const scoreDetails of scoresList) {
      const latestScoreDetails = latestScores.get(scoreDetails.langPair);
      if (
        !latestScoreDetails ||
        latestScoreDetails.created > scoreDetails.created
      ) {
        latestScores.set(scoreDetails.langPair, scoreDetails);
      }
    }

    for (const { langPair, score, taskId } of latestScores.values()) {
      for (const element of Array.from(
        document.querySelectorAll(`[data-${name}=${langPair}]`),
      )) {
        const td = /** @type {HTMLTableCellElement} */ (element);
        updateCometTD(td, langPair, score, taskId);
      }
    }
  }
}

/**
 * @param {HTMLTableCellElement} td
 * @param {string} langPair
 * @param {number} score
 * @param {string} taskId
 */
function updateCometTD(td, langPair, score, taskId) {
  const googleScore = googleComet[langPair] ?? 0;
  const percentage = 100 * (1 - googleScore / score);
  const sign = percentage >= 0 ? '+' : '';
  const percentageDisplay = `${sign}${percentage.toFixed(2)}%`;
  while (td.lastChild) {
    td.removeChild(td.lastChild);
  }

  let shippable = 'Shippable';
  td.style.color = '#fff';
  td.style.background = '#388e3c';
  if (percentage < -5) {
    // Does not meet release criteria.
    td.style.background = '#f44336';
    shippable = 'Not shippable';
  }

  {
    const a = document.createElement('a');
    a.href = `https://firefox-ci-tc.services.mozilla.com/tasks/${taskId}`;
    a.innerText = `${score}`;
    a.style.color = '#fff';
    a.target = '_blank';
    td.appendChild(a);
  }
  {
    const span = document.createElement('span');
    span.innerText = percentageDisplay;
    span.style.color = '#000';
    td.appendChild(span);
  }

  td.title =
    `${shippable} - COMET ${score} ` +
    `vs Google Comet ${googleScore.toFixed(4)} ` +
    `(${percentageDisplay})`;
}

/**
 * @param {(text: string | Element) => HTMLTableCellElement} createTD
 * @param {string} taskGroupId
 * @param {Map<string, Array<TaskAndStatus[]>>} taskGroupsByLangPair
 * @param {TaskAndStatus} trainActionTask
 * @param {boolean} isHidden
 */
async function buildTableRow(
  createTD,
  taskGroupId,
  taskGroupsByLangPair,
  trainActionTask,
  isHidden,
) {
  const tasks = (await fetchTaskGroup(taskGroupId)).tasks;
  const taskGroupUrl = `${server}/tasks/groups/${taskGroupId}`;

  {
    // Build the task group ID link

    const div = document.createElement('div');
    div.className = 'taskGroupCell';

    const a = document.createElement('a');
    a.innerText = taskGroupId;
    a.href = taskGroupUrl;
    a.target = '_blank';
    div.appendChild(a);

    const button = document.createElement('button');
    button.innerText = isHidden ? 'Show' : 'Hide';
    button.addEventListener(
      'click',
      toggleHiddenHandler(taskGroupId, isHidden),
    );
    div.appendChild(button);

    createTD(div);
  }

  // Attempt to find a langpair
  let langPair = '';
  for (const { task } of tasks) {
    if (task.metadata.name.match(/-src-[a-z]{2,3}$/)) {
      // Monolingual task.
      continue;
    }
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
    const a = document.createElement('a');
    a.innerText = langPair;
    a.href = `https://wandb.ai/moz-translations/${langPair}/overview`;
    a.target = '_blank';
    const td = createTD(a);
    td.appendChild(document.createTextNode(' '));
    td.appendChild(button);
  }

  const evals = [
    {
      name: 'teacher1',
      match: /^evaluate-teacher-flores-devtest-[a-z]{2,3}-[a-z]{2,3}-1$/,
    },
    {
      name: 'teacher2',
      match: /^evaluate-teacher-flores-devtest-[a-z]{2,3}-[a-z]{2,3}-2/,
    },
    {
      name: 'teacherensemble',
      match: /^evaluate-teacher-ensemble-flores-devtest-[a-z]{2,3}-[a-z]{2,3}$/,
    },
    {
      name: 'student',
      match: /^evaluate-student-flores-dev-[a-z]{2,3}-[a-z]{2,3}$/,
    },
    {
      name: 'studentquantized',
      match: /^evaluate-finetuned-student-flores-dev-[a-z]{2,3}-[a-z]{2,3}$ }/,
    },
  ];

  for (const { name, match } of evals) {
    const scoreList = scores[name];
    const task = tasks.find(
      (t) =>
        t.task.metadata.name.match(match) && t.status.state === 'completed',
    );

    let td = createTD('');
    if (task) {
      // If there is an eval teacher, pull its score, and update all of the other TDs,
      // as the task may have failed or be outdated, but its score is still valid.
      td.innerText = '';
      const { taskId } = task.status;
      fetchArtifact(taskId, 'public/build/devtest.metrics.json')
        .then((response) => response.json())
        .then((metrics) => {
          const score = metrics?.comet?.score;
          scoreList.push({
            langPair,
            score,
            created: new Date(task.task.created),
            taskId,
          });
          updateCometTD(td, langPair, score, taskId);
          updateScores();
        });
    }

    td.setAttribute(`data-${name}`, langPair);
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

  /**
   * @param {string[]} keys
   * @param {any} defaultValue
   * @returns {Record<string, any>}
   */
  function makeObj(keys, defaultValue) {
    /** @type {Record<string, any>} */
    const obj = {};

    for (const key of keys) {
      obj[key] = defaultValue;
    }
    return obj;
  }

  /**
   * Training is a complicated graph, but attempt to order the results here.
   */
  const orderedSteps = [
    'dataset-',
    'translate-mono-',
    'clean-corpus-',
    'bicleaner-ai-',
    'train-backwards-',
    'alignments-backtranslated-',
    'train-teacher-',
    'alignments-student-',
    'train-student-',
    'finetune-student-',
  ];

  /** @type {Record<string, "not-started" | "running" | "completed">} */
  const stepsCompleted = makeObj(orderedSteps, 'not-started');

  /** @type {Record<string, boolean>} */
  const stepsFailed = makeObj(orderedSteps, false);

  /** @type {Record<string, boolean>} */
  const stepsException = makeObj(orderedSteps, false);

  for (const { status, task } of tasks) {
    // Compute the status counts
    const count = stateCounts[status.state];
    stateCounts[status.state] = count + 1;

    for (const taskNamePrefix of Object.keys(stepsCompleted)) {
      if (task.metadata.name.startsWith(taskNamePrefix)) {
        // Compute if a step was completed.
        if (status.state === 'completed') {
          if (stepsCompleted[taskNamePrefix] === 'not-started') {
            stepsCompleted[taskNamePrefix] = 'completed';
          }
        } else if (status.state === 'running') {
          stepsCompleted[taskNamePrefix] = 'running';
        }

        if (status.state === 'failed') {
          stepsFailed[taskNamePrefix] = true;
        }
        if (status.state === 'exception') {
          stepsException[taskNamePrefix] = true;
        }
      }
    }
  }

  /**
   * @param {TaskState} state
   * @param {string} [color]
   * @param {string} [stage]
   */
  const addStateCount = (state, color, stage) => {
    const a = document.createElement('a');
    a.innerText = String(stateCounts[state] ?? 0);
    a.target = '_blank';
    a.href = taskGroupUrl;
    const matchingTasks = tasks.filter((task) => task.status.state === state);
    if (matchingTasks.length === 1) {
      a.href = `${server}/tasks/${matchingTasks[0].status.taskId}`;
    }
    const el = createTD(a);
    if (color && stateCounts[state]) {
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
  let failed = '';
  let exception = '';
  for (const [step, state] of Object.entries(stepsCompleted)) {
    if (state === 'completed') {
      completed = step;
    }
    if (state === 'running') {
      running = step;
    }
  }
  for (const [step, didFail] of Object.entries(stepsFailed).reverse()) {
    if (didFail) {
      failed = step;
    }
  }
  for (const [step, isException] of Object.entries(stepsException).reverse()) {
    if (isException) {
      exception = step;
    }
  }
  // Take off the last "-"
  completed = completed.slice(0, completed.length - 1);
  running = running.slice(0, running.length - 1);
  failed = failed.slice(0, failed.length - 1);
  exception = exception.slice(0, exception.length - 1);

  addStateCount('completed', undefined, completed);
  addStateCount('running', undefined, running);
  addStateCount('failed', '#f44336', failed);
  addStateCount('exception', '#ffa000', exception);
  addStateCount('pending');
  addStateCount('unscheduled');

  // Sort by langpair.
  sortTable(elements.table, 1);
}

/**
 * Hide or show a task group after a click.
 *
 * @param {string} taskGroupId
 * @param {boolean} isHidden
 * @returns {() => void}
 */
function toggleHiddenHandler(taskGroupId, isHidden) {
  return () => {
    let hidden = getHiddenTaskGroups();
    if (isHidden) {
      hidden = hidden.filter((id) => id !== taskGroupId);
    } else {
      hidden.push(taskGroupId);
    }
    const urlParams = new URLSearchParams(window.location.search);
    urlParams.set('hidden', hidden.join(','));
    changeLocation(urlParams);
  };
}

function getHiddenTaskGroups() {
  const urlParams = new URLSearchParams(window.location.search);
  const hiddenParam = urlParams.get('hidden');
  // e.g. "PuI6mYZPTUqAfyZMTgeUng,S5E71GihQM6Te_KdrUmATw"
  if (!hiddenParam) {
    return [];
  }
  return hiddenParam.split(',');
}

/**
 * @param {string} taskId
 * @param {string} artifactPath
 * @returns {Promise<Response>}
 */
async function fetchArtifact(taskId, artifactPath) {
  const taskUrl = `${server}/api/queue/v1/task/${taskId}/artifacts/${artifactPath}`;
  return await fetch(taskUrl);
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
      const response = await fetchArtifact(taskId, 'public/parameters.yml');
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

function getEmptyTrainTaskGroups() {
  return getTrainTaskGroupIds().map((taskGroupId) => ({
    taskGroupId,
    name: '',
  }));
}

/**
 * @returns {Array<{ taskGroupId: string, name: string }>}
 */
function getTrainTaskGroups() {
  const urlParams = new URLSearchParams(window.location.search);
  // Extract the taskGroupId parameter
  const namesString = urlParams.get('taskGroupNames');
  const ids = getTrainTaskGroupIds();

  if (!namesString) {
    return getEmptyTrainTaskGroups();
  }

  // Parse the taskGroupId values into an array
  let names;
  try {
    names = JSON.parse(namesString);
  } catch {}

  if (!Array.isArray(names)) {
    console.error('Bad taskGroupNames');
    return getEmptyTrainTaskGroups();
  }
  const namesFinal = [];
  for (let i = 0; i < ids.length; i++) {
    const name = typeof names[i] === 'string' ? names[i] : '';
    namesFinal.push({ taskGroupId: ids[i], name });
  }
  return namesFinal;
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
